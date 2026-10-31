<?php

namespace App\Services\Assistant;

use App\Http\Resources\ProductResource;
use App\Models\AssistantUsage;
use App\Models\Product;
use App\Services\ProductQuery;
use App\Services\StoreSettings;
use App\Support\Money;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The shopping assistant in the storefront's contact button. It answers from DMD World's own data only: products
 * found in MySQL (with their real prices and stock) and the store's settings (delivery, payment, contact). Anything
 * else (returns, warranty, an order, a question it can't match) goes to a person: live chat or WhatsApp. It never
 * makes up a price, a spec, stock or a policy. English and Arabic.
 *
 * Without an AI provider (the default) the answer is written from templates. With one approved and within its
 * budget, the provider only words the same facts. Usage is counted per day (AssistantUsage), never the questions.
 */
class ShoppingAssistant
{
    public const MAX_PRODUCTS = 4;

    /** Arabic shop words → the English words product names use. */
    private const ARABIC = [
        'كرسي' => 'chair', 'كراسي' => 'chair', 'سماعة' => 'headset', 'سماعات' => 'headset', 'ماوس' => 'mouse', 'فارة' => 'mouse',
        'كيبورد' => 'keyboard', 'لوحة مفاتيح' => 'keyboard', 'لابتوب' => 'laptop', 'لاب توب' => 'laptop', 'حاسوب' => 'laptop', 'كمبيوتر' => 'pc',
        'بلايستيشن' => 'playstation', 'بلاي ستيشن' => 'playstation', 'سوني' => 'playstation', 'اكس بوكس' => 'xbox', 'نينتندو' => 'nintendo',
        'يد تحكم' => 'controller', 'ذراع' => 'controller', 'جويستيك' => 'controller', 'شاشة' => 'monitor', 'طاولة' => 'table', 'مكتب' => 'desk',
        'لعبة' => 'game', 'ألعاب' => 'game', 'العاب' => 'game', 'مروحة' => 'fan', 'شاحن' => 'charger', 'كابل' => 'cable', 'ميكروفون' => 'microphone',
        'كاميرا' => 'camera', 'ساعة' => 'watch', 'هاتف' => 'phone', 'موبايل' => 'phone',
    ];

    private const STOP = ['a', 'an', 'the', 'i', 'im', 'me', 'my', 'you', 'your', 'do', 'does', 'have', 'has', 'is', 'are', 'any', 'some', 'for', 'with', 'and', 'or',
        'to', 'of', 'in', 'on', 'want', 'need', 'looking', 'look', 'find', 'show', 'buy', 'get', 'please', 'can', 'could', 'would', 'what', 'which', 'how', 'much',
        'price', 'prices', 'cost', 'available', 'stock', 'cheap', 'cheapest', 'best', 'good', 'new', 'sell', 'selling', 'there', 'it', 'one', 'ones', 'something',
        'hi', 'hello', 'hey', 'thanks', 'thank', 'under', 'below', 'less', 'than', 'over', 'above', 'more', 'max', 'up', 'usd', 'dollars', 'dollar', 'sale', 'offer',
        'offers', 'discount', 'deal', 'deals', 'used', 'second', 'hand', 'about', 'tell', 'like', 'gaming', 'game', 'deliver', 'delivery', 'shipping', 'ship',
        'pay', 'payment', 'cash', 'card', 'transfer', 'whish', 'lebanon', 'store', 'shop', 'dmd', 'world'];

    private const TOPICS = [
        'delivery' => ['deliver', 'delivery', 'shipping', 'ship', 'توصيل', 'شحن', 'دليفري'],
        'payment' => ['pay', 'payment', 'cash', 'whish', 'card', 'transfer', 'دفع', 'كاش', 'ويش', 'تحويل', 'بطاقة'],
        'contact' => ['contact', 'phone', 'call', 'number', 'email', 'address', 'location', 'where are', 'hours', 'open', 'اتصال', 'رقم', 'تلفون', 'عنوان', 'موقع', 'وين', 'دوام'],
        'person' => ['return', 'refund', 'warranty', 'guarantee', 'exchange', 'my order', 'order status', 'complaint', 'ارجاع', 'إرجاع', 'استرجاع', 'كفالة', 'ضمان', 'طلبي', 'تبديل', 'شكوى'],
    ];

    public function __construct(private AssistantProvider $provider) {}

    public static function enabled(): bool
    {
        return (bool) StoreSettings::get('assistant_enabled');
    }

    /**
     * @return array{reply: string, locale: string, products: list<array>, handoff: bool, source: string}
     */
    public function answer(string $message): array
    {
        $message = trim(preg_replace('/\s+/u', ' ', $message));
        $locale = preg_match('/\p{Arabic}/u', $message) ? 'ar' : 'en';
        $text = mb_strtolower(strtr($message, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']));

        $topic = $this->topic($text);
        $products = $topic === null || $topic === 'delivery' || $topic === 'payment' ? $this->search($text) : [];
        $store = $this->storeFacts();
        $handoff = $topic === 'person' || ($topic === null && ! $products);
        $reply = $this->template($locale, $topic, $products, $store);
        $source = 'catalog';

        if (! $handoff && $this->provider->available() && AssistantBudget::allows()) {
            try {
                $ai = $this->provider->reply($message, $locale, ['products' => $products, 'store' => $store]);
                $reply = trim($ai['text']) !== '' ? trim($ai['text']) : $reply;
                $source = 'ai';
                AssistantUsage::add(['ai_requests' => 1, 'ai_input_tokens' => $ai['input_tokens'], 'ai_output_tokens' => $ai['output_tokens'], 'ai_cost_usd' => (float) $ai['cost_usd']]);
            } catch (Throwable $e) {
                Log::warning("Shopping assistant provider failed: {$e->getMessage()}");
                AssistantUsage::add(['ai_requests' => 1, 'ai_failures' => 1]); // the catalog answer stands
            }
        }
        AssistantUsage::add(['questions' => 1, $handoff ? 'unanswered' : 'answered' => 1]);

        return ['reply' => $reply, 'locale' => $locale, 'products' => $products, 'handoff' => $handoff, 'source' => $source];
    }

    private function topic(string $text): ?string
    {
        foreach (self::TOPICS as $topic => $words) {
            foreach ($words as $w) {
                if (preg_match('/(^|[^\p{L}])'.preg_quote($w, '/').'/u', $text)) {
                    return $topic;
                }
            }
        }

        return null;
    }

    /** Products that match the question, best first: real prices and stock, from MySQL. */
    private function search(string $text): array
    {
        $max = preg_match('/(?:under|below|less than|max|up to|cheaper than|<|أقل من|اقل من|تحت|حتى|لحد)\s*\$?\s*(\d+(?:\.\d+)?)/u', $text, $m) ? (float) $m[1] : null;
        $min = preg_match('/(?:over|above|more than|from|>|أكثر من|اكثر من|فوق)\s*\$?\s*(\d+(?:\.\d+)?)/u', $text, $m) ? (float) $m[1] : null;
        $onSale = (bool) preg_match('/\b(sale|offer|offers|discount|deal|deals)\b|عرض|عروض|تخفيض|خصم/u', $text);
        $used = (bool) preg_match('/\bused\b|second[- ]hand|مستعمل/u', $text);

        $words = [];
        foreach (self::ARABIC as $ar => $en) {
            if (mb_strpos($text, $ar) !== false) {
                $words[] = $en;
                $text = str_replace($ar, ' ', $text);
            }
        }
        foreach (preg_split('/[^\p{L}\p{N}]+/u', preg_replace('/\$?\d+(\.\d+)?/', ' ', $text)) as $w) {
            if (mb_strlen($w) >= 2 && ! in_array($w, self::STOP, true) && ! preg_match('/\p{Arabic}/u', $w)) {
                $words[] = $w;
                if (mb_strlen($w) > 3 && str_ends_with($w, 's')) {
                    $words[] = mb_substr($w, 0, -1); // chairs → chair
                }
            }
        }
        $words = array_values(array_unique(array_slice($words, 0, 8)));
        if (! $words && ! $onSale && ! $used && $max === null && $min === null) {
            return [];
        }

        $q = Product::published()->with(['images:id,product_id,url,position', 'categories:id,name', 'variants', 'brand:id,name']);
        if ($words) {
            $q->where(function ($w) use ($words) {
                foreach ($words as $word) {
                    $like = '%'.addcslashes($word, '%_\\').'%';
                    $w->orWhere('name', 'like', $like)
                        ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', $like))
                        ->orWhereHas('categories', fn ($c) => $c->where('name', 'like', $like));
                }
            });
        }
        ProductQuery::priceBetween($q, $min, $max);
        if ($onSale) {
            ProductQuery::onSale($q);
        }
        if ($used) {
            $q->whereNotNull('condition');
        }
        $found = $q->limit(60)->get();

        // Best first: more of the words in its name, then in stock, then cheaper.
        $scored = $found->map(function (Product $p) use ($words) {
            $name = mb_strtolower($p->name.' '.($p->brand?->name ?? ''));
            $hits = count(array_filter($words, fn ($w) => str_contains($name, $w)));
            $cats = mb_strtolower($p->categories->pluck('name')->implode(' '));
            $hits += array_filter($words, fn ($w) => str_contains($cats, $w)) ? 0.5 : 0; // a category word counts for less than the name

            return ['p' => $p, 'score' => $hits, 'in' => $p->stock_status !== 'out_of_stock' && (! $p->track_stock || $p->stock_quantity > 0)];
        });
        // When some products match by name, ones that only share a category word (a desk in "Chairs and Tables") go.
        if ($scored->max('score') >= 1) {
            $scored = $scored->filter(fn ($s) => $s['score'] >= 1);
        }
        $scored = $scored->sortBy([['score', 'desc'], ['in', 'desc']])->take(self::MAX_PRODUCTS);

        return $scored->map(function ($s) {
            $r = (new ProductResource($s['p']))->resolve();

            return [
                'id' => $r['id'], 'name' => $r['name'], 'price' => $r['price'], 'regular_price' => $r['regular_price'], 'on_sale' => $r['on_sale'],
                'availability' => $r['availability'], 'from' => $r['type'] === 'variable', 'image' => $r['image'],
                'url' => '/product/'.$r['id'], 'condition' => $r['condition'],
            ];
        })->values()->all();
    }

    /** What the store has set (never more): delivery, payment and how to reach it. */
    private function storeFacts(): array
    {
        $fee = StoreSettings::get('delivery_fee');

        return [
            'name' => StoreSettings::get('store_name'),
            'delivery_fee' => $fee === null ? null : Money::json(Money::cents($fee)),
            'pickup' => array_key_exists('pickup', StoreSettings::deliveryMethods()),
            'payment_methods' => array_values(StoreSettings::paymentMethods()),
            'phone' => StoreSettings::get('contact_phone'),
            'email' => StoreSettings::get('contact_email'),
            'currency' => 'USD',
        ];
    }

    private function template(string $locale, ?string $topic, array $products, array $store): string
    {
        $ar = $locale === 'ar';
        $money = fn ($v) => '$'.number_format((float) $v, (float) $v == floor((float) $v) ? 0 : 2);
        $lines = [];
        if ($topic === 'delivery') {
            $lines[] = $ar
                ? ($store['delivery_fee'] === null ? 'تكلفة التوصيل وموعده يؤكدهما فريق DMD معك بعد الطلب.' : ($store['delivery_fee'] > 0 ? "التوصيل بـ {$money($store['delivery_fee'])} إلى كل لبنان." : 'التوصيل مجاني إلى كل لبنان.'))
                : ($store['delivery_fee'] === null ? 'Delivery cost and timing are confirmed by DMD with you after you order.' : ($store['delivery_fee'] > 0 ? "Delivery is {$money($store['delivery_fee'])} anywhere in Lebanon." : 'Delivery is free anywhere in Lebanon.'));
            if ($store['pickup']) {
                $lines[] = $ar ? 'ويمكنك الاستلام من المتجر مجاناً.' : 'You can also pick it up from the store for free.';
            }
        } elseif ($topic === 'payment') {
            $lines[] = ($ar ? 'طرق الدفع المتاحة: ' : 'You can pay by: ').implode($ar ? '، ' : ', ', $store['payment_methods']).'.';
            $lines[] = $ar ? 'لا يُطلب أي دفع بالبطاقة على الموقع.' : 'Nothing is charged online.';
        } elseif ($topic === 'contact') {
            $lines[] = $ar ? "يمكنك الاتصال بنا على {$store['phone']} أو مراسلتنا على {$store['email']}." : "You can call DMD World on {$store['phone']} or email {$store['email']}.";
        } elseif ($topic === 'person') {
            return $ar
                ? 'هذا سؤال يجيب عنه فريقنا مباشرة. تحدّث معنا في الدردشة المباشرة أو على واتساب.'
                : 'That’s one for our team. Ask them in live chat or on WhatsApp and a person will answer.';
        }

        if ($products) {
            $lines[] = $ar ? 'إليك ما وجدته في متجرنا:' : 'Here’s what I found in our store:';
            foreach ($products as $p) {
                $stock = match ($p['availability']) { 'out_of_stock' => $ar ? 'نفد من المخزون' : 'sold out', 'low_stock' => $ar ? 'كمية محدودة' : 'only a few left', default => $ar ? 'متوفر' : 'in stock' };
                $price = ($p['from'] ? ($ar ? 'من ' : 'from ') : '').$money($p['price']);
                $lines[] = "• {$p['name']}: {$price} ({$stock})";
            }
            $lines[] = $ar ? 'الأسعار والمخزون من المتجر الآن. للأسئلة عن التوافق أو الحالة، اسأل فريقنا.' : 'Prices and stock are live from the store. For compatibility or condition questions, ask our team.';
        } elseif ($topic === null) {
            return $ar
                ? 'لم أجد ذلك في متجرنا. جرّب كلمة أخرى (مثل "كرسي" أو "سماعة")، أو اسأل فريقنا في الدردشة أو على واتساب.'
                : 'I couldn’t find that in our store. Try another word (like “chair” or “headset”), or ask our team in live chat or on WhatsApp.';
        }

        return implode("\n", $lines);
    }
}
