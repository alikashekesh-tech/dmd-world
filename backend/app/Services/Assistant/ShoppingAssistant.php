<?php

namespace App\Services\Assistant;

use App\Models\AssistantUsage;
use App\Services\StoreSettings;
use App\Support\Money;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The shopping assistant in the storefront's contact button. It answers from DMD World's own data only: products
 * found in MySQL (with their real prices, stock and links) and the store's settings (delivery, payment, contact).
 * Returns, warranty, an order, or a question it can't match go to a person: live chat or WhatsApp. It never makes
 * up a price, a spec, stock or a policy. English and Arabic.
 *
 * It greets, asks which console or which kind of product when a question is too broad, and follows up ("ps5",
 * "cheaper", "more") using the previous answer's context, which the browser sends back: nothing about the visitor
 * or the conversation is stored. Without an AI provider (the default) every answer is written from templates; an
 * approved provider within its budget only rewords the same facts. Usage is counted per day, never the questions.
 */
class ShoppingAssistant
{
    public const MAX_PRODUCTS = CatalogSearch::PAGE;

    private const TOPICS = [
        'person' => ['return', 'refund', 'warranty', 'guarantee', 'exchange', 'my order', 'order status', 'track my order', 'where is my order', 'complaint', 'broken', 'damaged', 'not working',
            'ارجاع', 'استرجاع', 'استرداد', 'كفاله', 'ضمان', 'طلبي', 'طلبيتي', 'تبديل', 'شكوي', 'مكسور', 'خربان', 'معطل'],
        'delivery' => ['deliver', 'delivery', 'shipping', 'ship to', 'shipped', 'توصيل', 'دليفري', 'ديليفري', 'شحن'],
        'payment' => ['pay', 'payment', 'paying', 'cash on delivery', 'cash', 'whish', 'wish money', 'bank transfer', 'transfer', 'credit card', 'visa', 'mastercard', 'installment',
            'دفع', 'كاش', 'ويش', 'تحويل', 'فيزا', 'تقسيط', 'بطاقه ائتمان'],
        'contact' => ['contact', 'phone number', 'your number', 'your phone', 'call you', 'whatsapp number', 'address', 'location', 'where are you', 'where is your store', 'where is the shop',
            'opening hours', 'working hours', 'are you open', 'email', 'اتصال', 'رقم', 'تلفون', 'تليفون', 'عنوان', 'موقع', 'وين', 'دوام', 'ساعات العمل', 'ايميل'],
    ];

    /** Quick replies: broad gaming kinds, and the start of a search. */
    private const START = ['en' => ['PS5 games', 'Controllers', 'Headsets', 'Gaming chairs'], 'ar' => ['ألعاب بلايستيشن 5', 'أيادي تحكم', 'سماعات', 'كراسي ألعاب']];

    public function __construct(private AssistantProvider $provider) {}

    public static function enabled(): bool
    {
        return (bool) StoreSettings::get('assistant_enabled');
    }

    /**
     * @param  array  $context  the previous answer's `context`, as the browser sent it back (checked here)
     * @return array{reply: string, locale: string, products: list<array>, handoff: bool, source: string, kind: string, suggestions: list<string>, context: array}
     */
    public function answer(string $message, array $context = []): array
    {
        $message = trim(preg_replace('/\s+/u', ' ', $message));
        $ctx = self::context($context);
        $search = new CatalogSearch;
        $p = Lexicon::parse($message, $search->words(), self::topicWords());
        $locale = $p['arabic'] ? 'ar' : ($ctx['locale'] === 'ar' && ! $p['english'] ? 'ar' : 'en');
        $ar = $locale === 'ar';
        $topic = $this->topic(Lexicon::normalize($message));
        $store = $this->storeFacts();
        $hasQuery = $p['kinds'] || $p['platforms'] || $p['words'] || $p['sale'] || $p['used'] || $p['stock'] || $p['cheap'] || $p['more'] || $p['min'] !== null || $p['max'] !== null;
        $out = ['reply' => '', 'locale' => $locale, 'products' => [], 'handoff' => false, 'source' => 'catalog', 'kind' => 'products', 'suggestions' => [], 'context' => ['locale' => $locale] + $ctx];

        if ($topic === 'person') {
            return $this->done($message, ['kind' => 'person', 'handoff' => true, 'reply' => $ar
                ? 'هذا سؤال يجيب عنه فريقنا مباشرة. تحدّث معنا في الدردشة المباشرة أو على واتساب.'
                : 'That’s one for our team. Ask them in live chat or on WhatsApp and a person will answer.'] + $out, $store);
        }
        if (! $hasQuery && ! $topic && ($p['greet'] || $p['howru'] || $p['thanks'] || $p['bye'] || $p['help'])) {
            return $this->done($message, $this->social($p, $ar) + $out, $store);
        }
        if (! $hasQuery && $topic) {
            $hello = $p['greet'] || $p['howru'] ? [$ar ? 'أهلاً بك!' : 'Hi there!'] : [];

            return $this->done($message, ['kind' => 'info', 'reply' => implode("\n", [...$hello, ...$this->topicLines($topic, $ar, $store)])] + $out, $store);
        }

        $lines = [];
        if ($p['greet'] || $p['howru']) {
            $lines[] = $ar ? 'أهلاً بك!' : 'Hi there!';
        }
        if ($topic) {
            $lines = array_merge($lines, $this->topicLines($topic, $ar, $store));
        }
        if ($p['corrected']) {
            $fixed = implode('، ', array_map(fn ($w) => "«{$w}»", array_unique(array_values($p['corrected']))));
            $lines[] = $ar ? "عرض النتائج لـ {$fixed}." : 'Showing results for '.str_replace(['«', '»', '، '], ['“', '”', ', '], $fixed).'.';
        }

        $q = $this->query($p, $p['greet'] ? self::context(['locale' => $locale]) : $ctx); // a greeting starts afresh
        if (! $q['kinds'] && ! $q['platforms'] && ! $q['words'] && ! $q['sale'] && ! $q['used'] && $q['min'] === null && $q['max'] === null) {
            if ($topic) {
                return $this->done($message, ['kind' => 'info', 'reply' => implode("\n", $lines)] + $out, $store);
            }
            if ($p['gaming']) {
                $lines[] = $ar
                    ? 'يسعدني مساعدتك! ما الذي تبحث عنه: ألعاب، يد تحكم، سماعة، ماوس أو كيبورد، أم كرسي ألعاب؟'
                    : 'Happy to help you gear up! What are you after: games, a controller, a headset, a mouse or keyboard, or a gaming chair?';

                return $this->done($message, ['kind' => 'clarify', 'reply' => implode("\n", $lines), 'suggestions' => self::START[$locale]] + $out, $store);
            }
            if (! $p['unknown'] && ! $p['corrected']) {
                return $this->done($message, $this->social(['help' => true] + $p, $ar) + $out, $store);
            }

            return $this->done($message, $this->nothing($lines, [], $ar, $locale) + $out, $store);
        }

        $r = $search->find($q);
        $note = null;
        // Words that match nothing in the last answer's subject are a new subject ("flux capacitor" after chairs).
        if ($q['fromContext'] && $p['words'] && (! $r['total'] || ! array_diff($p['words'], $r['unmatched']))) {
            $q = $this->query($p, self::context(['locale' => $locale]));
            $r = $search->find($q);
        }
        if (! $r['total'] && $q['platforms'] && $q['kinds']) {
            $wider = $search->find(['platforms' => []] + $q);
            if ($wider['total']) {
                $note = $ar
                    ? 'لم أجد '.$this->label($q['kinds'], [], true).' لـ '.$this->platformList($q['platforms'], true).' حالياً، لكن إليك ما لدينا:'
                    : 'I didn’t find '.$this->label($q['kinds'], [], false).' for '.$this->platformList($q['platforms'], false).' right now, but here’s what we have:';
                [$r, $q['platforms']] = [$wider, []];
            }
        }
        if (! $r['total'] && ($q['min'] !== null || $q['max'] !== null || $q['sale'] || $q['stock'] || $q['used']) && ($q['kinds'] || $q['words'] || $q['platforms'])) {
            $wider = $search->find(['min' => null, 'max' => null, 'sale' => false, 'stock' => false, 'used' => false, 'sort' => 'price', 'offset' => 0] + $q);
            if ($wider['total']) {
                $what = $this->label($q['kinds'], $q['platforms'], $ar) ?: implode(' ', $q['words']);
                $note = $ar ? "لم أجد {$what} ".$this->limits($q, true).' حالياً. إليك الأقرب لدينا:'
                    : 'I couldn’t find '.($q['used'] ? 'used ' : '')."{$what} ".$this->limits($q, false).' right now. Here’s the closest we have:';
                $note = preg_replace('/\s+/u', ' ', $note);
                $r = $wider;
                $q = ['min' => null, 'max' => null, 'sale' => false, 'stock' => false, 'used' => false, 'sort' => 'price'] + $q;
            }
        }
        if (! $r['total']) {
            return $this->done($message, $this->nothing($lines, $q, $ar, $locale) + $out, $store);
        }

        $label = $this->label($q['kinds'], $q['platforms'], $ar);
        $gamingKinds = array_filter($q['kinds'], fn ($k) => ! empty(Lexicon::KINDS[$k]['gaming']));
        if (! $note && $q['gaming'] && $gamingKinds && ! $r['gaming'] && ! $q['words']) {
            $note = $ar ? "لا يوجد لدينا {$label} مخصصة للألعاب حالياً، لكن إليك ما لدينا:" : "None of our {$label} is sold as a gaming model right now, but here’s what we have:";
        }
        if ($note) {
            $lines[] = $note;
        } elseif ($r['unmatched'] && $q['kinds']) {
            $missing = implode(' ', $r['unmatched']);
            $lines[] = $ar ? "لم أجد «{$missing}» ضمن {$label}، لكن إليك ما لدينا:" : "I couldn’t find “{$missing}” among our {$label}, but here’s what we have:";
        } else {
            $total = $r['total'] > count($r['products']) ? ($ar ? " (العدد الكلي: {$r['total']})" : " ({$r['total']} in total)") : '';
            $lines[] = match (true) {
                $q['offset'] > 0 => $ar ? 'إليك المزيد'.($label ? " من {$label}" : '').':' : 'Here are more'.($label ? " {$label}" : '').':',
                $q['sort'] === 'price' => $ar ? 'إليك الأقل سعراً'.($label ? " من {$label}" : '').$total.':' : 'Here are the lowest prices'.($label ? " for {$label}" : '').$total.':',
                default => $ar ? 'إليك ما وجدته في متجرنا'.($label ? " من {$label}" : '').$total.':' : 'Here’s what I found in our store'.($label ? " for {$label}" : '').$total.':',
            };
        }
        foreach ($r['products'] as $prod) {
            $lines[] = $this->line($prod, $ar);
        }
        $lines[] = $ar ? 'الأسعار والمخزون من المتجر الآن. للأسئلة عن التوافق أو الحالة، اسأل فريقنا.' : 'Prices and stock are live from the store. For compatibility or condition questions, ask our team.';

        // Too broad to be sure: ask which console, or what kind of thing.
        $kind = 'products';
        $suggestions = [];
        $platformed = array_filter($q['kinds'], fn ($k) => ! empty(Lexicon::KINDS[$k]['platformed']));
        $consoles = array_values(array_diff($r['platforms'], array_intersect($r['platforms'], ['ps4', 'ps5']) ? ['playstation'] : []));
        if ($q['offset'] === 0 && $platformed && ! $q['platforms'] && count($consoles) >= 2) {
            $names = array_map(fn ($k) => Lexicon::PLATFORMS[$k]['label'], $consoles);
            $lines[] = $ar ? 'لأي جهاز تريدها: '.$this->either($names, true).'؟' : 'Which console are they for: '.$this->either($names, false).'?';
            [$kind, $suggestions] = ['clarify', $names];
        } elseif ($q['offset'] === 0 && $q['platforms'] && ! $q['kinds'] && ! $q['words']) {
            $pl = $this->platformList($q['platforms'], $ar);
            $lines[] = $ar ? "ما الذي تبحث عنه لـ {$pl}: ألعاب، أيادي تحكم أم إكسسوارات؟" : "What are you looking for for {$pl}: games, controllers or accessories?";
            [$kind, $suggestions] = ['clarify', $ar ? ['ألعاب', 'أيادي تحكم', 'إكسسوارات'] : ['Games', 'Controllers', 'Accessories']];
        } else {
            if ($r['total'] > $q['offset'] + CatalogSearch::PAGE) {
                $suggestions[] = $ar ? 'المزيد' : 'Show more';
            }
            if ($q['sort'] !== 'price' && $r['total'] > 1) {
                $suggestions[] = $ar ? 'الأرخص أولاً' : 'Cheapest first';
            }
        }

        $next = array_intersect_key($q, array_flip(['kinds', 'platforms', 'words', 'min', 'max', 'sale', 'used', 'stock', 'gaming', 'sort', 'offset']));

        return $this->done($message, ['kind' => $kind, 'reply' => implode("\n", $lines), 'products' => $r['products'], 'suggestions' => $suggestions,
            'context' => ['locale' => $locale] + $next] + $out, $store);
    }

    /** The search: this question, or this question refining the last one ("ps5", "under $30", "cheaper", "more"). */
    private function query(array $p, array $ctx): array
    {
        $base = ['kinds' => [], 'platforms' => [], 'words' => [], 'said' => [], 'min' => null, 'max' => null, 'sale' => false, 'used' => false, 'stock' => false, 'gaming' => false, 'sort' => null, 'offset' => 0, 'fromContext' => false];
        if (! ($p['kinds'] || $p['platforms'] || $p['words'] || $p['sale'] || $p['used'] || $p['stock'] || $p['cheap'] || $p['more'] || $p['min'] !== null || $p['max'] !== null)) {
            return ['gaming' => $p['gaming']] + $base;
        }
        $had = $ctx['kinds'] || $ctx['words'] || $ctx['platforms'];
        $own = ['min' => $p['min'], 'max' => $p['max'], 'sale' => $p['sale'], 'used' => $p['used'], 'stock' => $p['stock'], 'gaming' => $p['gaming']];

        if ($had && $p['more'] && ! $p['kinds'] && ! $p['words']) {
            return ['offset' => $ctx['offset'] + CatalogSearch::PAGE, 'fromContext' => true] + $ctx + $base;
        }
        if ($had && ! $p['kinds']) { // a refinement: keep the subject, change what was said
            $q = ['fromContext' => true, 'offset' => 0] + $ctx + $base;
            if ($p['platforms']) {
                $q['platforms'] = $p['platforms'];
            }
            if ($p['words']) {
                $q['words'] = array_values(array_unique([...$ctx['words'], ...$p['words']]));
            }
            foreach (['min', 'max'] as $k) {
                $q[$k] = $p[$k] ?? $q[$k];
            }
            foreach (['sale', 'used', 'stock', 'gaming'] as $k) {
                $q[$k] = $p[$k] || $q[$k];
            }
            $q['sort'] = $p['cheap'] ? 'price' : $q['sort'];

            return $q;
        }
        $q = ['kinds' => $p['kinds'], 'platforms' => $p['platforms'], 'words' => $p['words'], 'said' => $p['said'], 'sort' => $p['cheap'] ? 'price' : null] + $own + $base;
        // "and controllers?" after "PS5 games": the same console. Asking for games again is asking more broadly.
        if (! $q['platforms'] && $ctx['platforms'] && array_diff($q['kinds'], $ctx['kinds']) && array_filter($q['kinds'], fn ($k) => ! empty(Lexicon::KINDS[$k]['platformed']))) {
            $q['platforms'] = $ctx['platforms'];
        }

        return $q;
    }

    /** The previous answer's context from the browser, reduced to what the assistant itself could have sent. */
    public static function context(array $c): array
    {
        $pick = fn ($v, array $allowed, int $max) => array_slice(array_values(array_unique(array_intersect(is_array($v) ? array_map(fn ($x) => is_scalar($x) ? (string) $x : '', $v) : [], $allowed))), 0, $max);
        $num = fn ($v) => is_numeric($v) ? max(0.0, min(1000000.0, (float) $v)) : null;
        $words = array_filter(array_map(fn ($w) => is_string($w) ? Lexicon::normalize($w) : '', is_array($c['words'] ?? null) ? $c['words'] : []), fn ($w) => mb_strlen($w) <= 30 && preg_match('/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u', $w));

        return [
            'kinds' => $pick($c['kinds'] ?? [], array_keys(Lexicon::KINDS), 4),
            'platforms' => $pick($c['platforms'] ?? [], array_keys(Lexicon::PLATFORMS), 5),
            'words' => array_slice(array_values(array_unique($words)), 0, 6),
            'min' => $num($c['min'] ?? null),
            'max' => $num($c['max'] ?? null),
            'sale' => ($c['sale'] ?? false) === true,
            'used' => ($c['used'] ?? false) === true,
            'stock' => ($c['stock'] ?? false) === true,
            'gaming' => ($c['gaming'] ?? false) === true,
            'sort' => ($c['sort'] ?? null) === 'price' ? 'price' : null,
            'offset' => is_numeric($c['offset'] ?? null) ? max(0, min(200, (int) $c['offset'])) : 0,
            'locale' => ($c['locale'] ?? null) === 'ar' ? 'ar' : 'en',
        ];
    }

    private function social(array $p, bool $ar): array
    {
        if ($p['thanks']) {
            return ['kind' => 'social', 'reply' => $ar ? 'على الرحب والسعة! هل تريد أن أبحث لك عن شيء آخر؟' : 'You’re welcome! Anything else I can look up for you?'];
        }
        if ($p['bye']) {
            return ['kind' => 'social', 'reply' => $ar ? 'شكراً لزيارتك DMD World. نحن هنا متى احتجتنا!' : 'Thanks for visiting DMD World. We’re here whenever you need us!'];
        }
        if ($p['help'] && ! $p['greet'] && ! $p['howru']) {
            return ['kind' => 'social', 'suggestions' => self::START[$ar ? 'ar' : 'en'], 'reply' => $ar
                ? 'يمكنني البحث عن المنتجات في متجرنا بأسعارها ومخزونها الحالي، والإجابة عن أسئلة التوصيل والدفع والتواصل. جرّب «ألعاب PS5» أو «سماعة لاسلكية أقل من 50 دولار» أو «كراسي ألعاب».'
                : 'I can look up products in our store with their live prices and stock, and answer delivery, payment and contact questions. Try “PS5 games”, “wireless headset under $50” or “gaming chairs”.'];
        }
        $how = $p['howru'] ? ($ar ? 'بخير، شكراً لسؤالك! ' : 'I’m doing well, thanks for asking! ') : '';

        return ['kind' => 'social', 'suggestions' => self::START[$ar ? 'ar' : 'en'], 'reply' => $ar
            ? "أهلاً وسهلاً! {$how}أنا مساعد التسوّق في DMD World. أخبرني بما تبحث عنه، مثل لعبة PS5 أو يد تحكم أو كرسي ألعاب، وسأبحث لك في متجرنا."
            : "Hi! {$how}I’m DMD World’s shopping assistant. Tell me what you’re looking for, like a PS5 game, a controller or a gaming chair, and I’ll check our store."];
    }

    /** Nothing found: say so plainly, say what the store does carry, and offer a person. */
    private function nothing(array $lines, array $q, bool $ar, string $locale): array
    {
        $label = $q ? $this->label($q['kinds'], $q['platforms'], $ar) : '';
        $lines[] = $label
            ? ($ar ? "لا يوجد لدينا {$label} في المتجر حالياً." : "We don’t have any {$label} in the store right now.")
            : ($ar ? 'لم أجد ذلك في متجرنا.' : 'I couldn’t find that in our store.');
        $lines[] = $ar
            ? 'لدينا ألعاب وأجهزة ألعاب وأيادي تحكم وسماعات وكراسي ألعاب وكيبوردات وماوسات والمزيد. جرّب أحد الاقتراحات، أو اسأل فريقنا في الدردشة المباشرة أو على واتساب.'
            : 'We carry games, consoles, controllers, headsets, gaming chairs, keyboards, mice and more. Try one of the suggestions, or ask our team in live chat or on WhatsApp.';

        return ['kind' => 'none', 'handoff' => true, 'reply' => implode("\n", $lines), 'suggestions' => self::START[$locale]];
    }

    /** Counts the question and lets an approved AI provider reword a product or store answer (never a hand-off). */
    private function done(string $message, array $out, array $store): array
    {
        if (in_array($out['kind'], ['products', 'info'], true) && $this->provider->available() && AssistantBudget::allows()) {
            try {
                $ai = $this->provider->reply($message, $out['locale'], ['products' => $out['products'], 'store' => $store]);
                $out['reply'] = trim($ai['text']) !== '' ? trim($ai['text']) : $out['reply'];
                $out['source'] = 'ai';
                AssistantUsage::add(['ai_requests' => 1, 'ai_input_tokens' => $ai['input_tokens'], 'ai_output_tokens' => $ai['output_tokens'], 'ai_cost_usd' => (float) $ai['cost_usd']]);
            } catch (Throwable $e) {
                Log::warning("Shopping assistant provider failed: {$e->getMessage()}");
                AssistantUsage::add(['ai_requests' => 1, 'ai_failures' => 1]); // the catalog answer stands
            }
        }
        AssistantUsage::add(['questions' => 1, $out['handoff'] ? 'unanswered' : 'answered' => 1]);

        return $out;
    }

    /** The single English words of the store topics (delivery, payment, contact…). */
    private static function topicWords(): array
    {
        $words = [];
        foreach (self::TOPICS as $list) {
            foreach ($list as $phrase) {
                foreach (Lexicon::tokens(Lexicon::normalize($phrase)) as $w) {
                    $words[$w] = true;
                }
            }
        }

        return array_keys(array_diff_key($words, array_flip(['my', 'your', 'you', 'is', 'the', 'are', 'where', 'to', 'on', 'not'])));
    }

    private function topic(string $text): ?string
    {
        foreach (self::TOPICS as $topic => $words) {
            foreach ($words as $w) {
                if (preg_match('/(?:^|[^\p{L}])(?:وال|بال|ال|لل|و|ب|ل)?'.preg_quote(Lexicon::normalize($w), '/').'/u', $text)) {
                    return $topic;
                }
            }
        }

        return null;
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

    private function topicLines(string $topic, bool $ar, array $store): array
    {
        $money = fn ($v) => $this->money($v);
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
        }

        return $lines;
    }

    private function line(array $p, bool $ar): string
    {
        $stock = match ($p['availability']) {
            'out_of_stock' => $ar ? 'نفد من المخزون' : 'sold out', 'low_stock' => $ar ? 'كمية محدودة' : 'only a few left', default => $ar ? 'متوفر' : 'in stock'
        };
        $price = ($p['from'] ? ($ar ? 'من ' : 'from ') : '').$this->money($p['price']);
        if ($ar) { // keep the English name and the price in their own direction inside an Arabic line
            return "• \u{2068}{$p['name']}\u{2069}: \u{2068}{$price}\u{2069} ({$stock})";
        }

        return "• {$p['name']}: {$price} ({$stock})";
    }

    private function money($v): string
    {
        return '$'.number_format((float) $v, (float) $v == floor((float) $v) ? 0 : 2);
    }

    /** "PS5 games", "ألعاب PS5", "headsets and headphones". */
    private function label(array $kinds, array $platforms, bool $ar): string
    {
        $names = array_map(fn ($k) => Lexicon::KINDS[$k]['label'][$ar ? 1 : 0], $kinds);
        $what = $ar ? implode(' و', $names) : implode(' and ', $names);
        if (! $platforms) {
            return $what;
        }
        $pl = $this->platformList($platforms, $ar);
        if ($what === '') {
            return $ar ? "منتجات {$pl}" : "{$pl} products";
        }

        return $ar ? "{$what} {$pl}" : "{$pl} {$what}";
    }

    /** "under $50", "on sale", "in stock"; "مستعملة بأقل من $50". */
    private function limits(array $q, bool $ar): string
    {
        $m = fn ($v) => $this->money($v);
        $parts = $ar ? array_filter([$q['used'] ? 'مستعملة' : null, $q['sale'] ? 'عليها عروض' : null, $q['stock'] ? 'متوفرة' : null]) : array_filter([$q['sale'] ? 'on sale' : null, $q['stock'] ? 'in stock' : null]);
        if ($q['min'] !== null && $q['max'] !== null) {
            $parts[] = $ar ? "بين {$m($q['min'])} و{$m($q['max'])}" : "between {$m($q['min'])} and {$m($q['max'])}";
        } elseif ($q['max'] !== null) {
            $parts[] = $ar ? "بأقل من {$m($q['max'])}" : "under {$m($q['max'])}";
        } elseif ($q['min'] !== null) {
            $parts[] = $ar ? "بأكثر من {$m($q['min'])}" : "over {$m($q['min'])}";
        }

        return implode(' ', $parts);
    }

    private function platformList(array $platforms, bool $ar): string
    {
        return $this->either(array_map(fn ($k) => Lexicon::PLATFORMS[$k]['label'], $platforms), $ar);
    }

    private function either(array $names, bool $ar): string
    {
        if (count($names) < 2) {
            return (string) ($names[0] ?? '');
        }
        $last = array_pop($names);

        return implode($ar ? '، ' : ', ', $names).($ar ? ' أو ' : ' or ').$last;
    }
}
