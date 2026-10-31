<?php

namespace App\Services\Assistant;

/**
 * What the shopping assistant understands: product kinds (with the store's category slugs and the words product names
 * use), consoles, greetings and shopping words, in English and Arabic. parse() turns a question into a query; it never
 * looks at the catalog except for the list of known words used to correct typos.
 *
 * Arabic is matched after normalize(): no diacritics or tatweel, أإآ → ا, ة → ه, ى → ي, Arabic digits → 0-9.
 */
final class Lexicon
{
    /**
     * Product kinds. en/ar: what shoppers call them. names: words in product names that mean the kind. cats: category
     * slugs (a product in that category, or below it unless `shallow`). match: what makes a product this kind
     * (name, category, or either). not_names/not_cats: never this kind. platformed: asks "which console?".
     * gaming: "gaming" before it is a preference, not a different product.
     */
    public const KINDS = [
        'games' => ['en' => ['game', 'games', 'video game', 'video games', 'videogame', 'videogames'], 'ar' => ['لعبه', 'العاب', 'لعب', 'لعبات', 'جيم', 'جيمز', 'جيمات'],
            'names' => [], 'cats' => ['games', 'xbox-series-games'], 'match' => 'category', 'platformed' => true, 'label' => ['games', 'ألعاب']],
        'consoles' => ['en' => ['console', 'consoles', 'game console', 'game consoles', 'gaming console', 'handheld', 'game stick', 'retro console'], 'ar' => ['جهاز', 'اجهزه', 'جهاز العاب', 'كونسول', 'كونسل', 'كونسولات'],
            'names' => ['console', 'handheld', 'game stick'], 'cats' => ['consoles', 'retro-games-and-consoles'], 'match' => 'either', 'platformed' => true, 'label' => ['consoles', 'أجهزة ألعاب']],
        'controllers' => ['en' => ['controller', 'controllers', 'gamepad', 'gamepads', 'joystick', 'joysticks', 'joypad', 'joy con', 'joycon', 'joycons', 'dualsense', 'dualshock', 'pad controller'], 'ar' => ['يد تحكم', 'ايادي تحكم', 'ذراع', 'دراع', 'ذراع تحكم', 'جويستيك', 'جوستيك', 'جويستك', 'دسه', 'دسات', 'كنترولر', 'كونترولر', 'وحده تحكم'],
            'names' => ['controller', 'gamepad', 'joystick', 'joy con', 'joycon', 'dualsense', 'dualshock'], 'not_names' => ['console', 'game stick'], 'cats' => ['controllers'], 'match' => 'either', 'platformed' => true, 'label' => ['controllers', 'أيادي تحكم']],
        'headsets' => ['en' => ['headset', 'headsets', 'headphone', 'headphones', 'earphone', 'earphones', 'earbud', 'earbuds', 'airpods', 'airpod', 'buds', 'headset mic'], 'ar' => ['سماعه', 'سماعات', 'هيدسيت', 'هيدفون', 'سماعه راس', 'ايربودز', 'اير بودز'],
            'names' => ['headset', 'headphone', 'earphone', 'earbud', 'airpods', 'buds'], 'cats' => ['headphones', 'headsets', 'airpods'], 'match' => 'either', 'gaming' => true, 'label' => ['headsets and headphones', 'سماعات']],
        'mousepads' => ['en' => ['mouse pad', 'mouse pads', 'mousepad', 'mousepads', 'mouse mat', 'desk mat', 'deskmat'], 'ar' => ['ماوس باد', 'ماوسباد', 'لوحه ماوس', 'قاعده ماوس'],
            'names' => ['mouse pad', 'mousepad', 'mouse mat', 'desk mat'], 'cats' => ['mouse-pads', 'mouse-pad'], 'match' => 'either', 'label' => ['mouse pads', 'ماوس باد']],
        'mouse' => ['en' => ['mouse', 'mice', 'mouses'], 'ar' => ['ماوس', 'فاره', 'ماوسات'],
            'names' => ['mouse', 'mice'], 'not_names' => ['pad', 'mousepad', 'mat'], 'cats' => ['mouse'], 'not_cats' => ['mouse-pads', 'mouse-pad'], 'match' => 'either', 'gaming' => true, 'label' => ['mice', 'ماوسات']],
        'keyboards' => ['en' => ['keyboard', 'keyboards', 'mechanical keyboard', 'red switch', 'blue switch', 'brown switch'], 'ar' => ['كيبورد', 'كيبوردات', 'كيبورت', 'لوحه مفاتيح', 'لوحات مفاتيح'],
            'names' => ['keyboard', 'mechanical', 'red switch', 'blue switch', 'brown switch', 'key'], 'cats' => ['keyboards'], 'match' => 'either', 'gaming' => true, 'label' => ['keyboards', 'كيبوردات'],
            'specific' => ['red switch', 'blue switch', 'brown switch']],
        'chairs' => ['en' => ['chair', 'chairs', 'seat', 'seats', 'gaming chair', 'gaming chairs'], 'ar' => ['كرسي', 'كراسي', 'كرسي العاب', 'كرسي جيمنج'],
            'names' => ['chair'], 'cats' => [], 'match' => 'name', 'gaming' => true, 'label' => ['chairs', 'كراسي']],
        'desks' => ['en' => ['desk', 'desks', 'table', 'tables', 'gaming desk', 'gaming table'], 'ar' => ['طاوله', 'طاولات', 'مكتب', 'ميز'],
            'names' => ['desk', 'table'], 'cats' => [], 'match' => 'name', 'gaming' => true, 'label' => ['desks and tables', 'طاولات']],
        'coolers' => ['en' => ['laptop cooler', 'laptop coolers', 'cooler', 'coolers', 'cooling pad', 'laptop fan', 'laptop stand'], 'ar' => ['مبرد', 'مبرد لابتوب', 'مروحه لابتوب', 'قاعده تبريد', 'تبريد'],
            'names' => ['cooler', 'cooling', 'laptop fan'], 'cats' => ['laptop-coolers'], 'match' => 'either', 'label' => ['laptop coolers', 'مبردات لابتوب']],
        'laptops' => ['en' => ['laptop', 'laptops', 'notebook', 'notebooks', 'gaming laptop', 'gaming laptops'], 'ar' => ['لابتوب', 'لابتوبات', 'لاب توب', 'كمبيوتر محمول', 'حاسوب محمول'],
            'names' => ['laptop', 'notebook'], 'not_names' => ['cooler', 'cooling', 'fan', 'bag', 'stand'], 'cats' => ['laptops'], 'shallow' => true, 'not_cats' => ['laptop-coolers', 'laptop-bags'], 'match' => 'either', 'gaming' => true, 'label' => ['laptops', 'لابتوبات']],
        'monitors' => ['en' => ['monitor', 'monitors', 'screen', 'screens', 'display'], 'ar' => ['شاشه', 'شاشات', 'مونيتور'],
            'names' => ['monitor', 'display'], 'cats' => ['monitors'], 'match' => 'either', 'gaming' => true, 'label' => ['monitors', 'شاشات']],
        'webcams' => ['en' => ['webcam', 'webcams', 'camera', 'cameras', 'cam'], 'ar' => ['كاميرا', 'كاميرات', 'ويب كام', 'ويبكام'],
            'names' => ['webcam', 'camera'], 'cats' => ['webcams'], 'match' => 'either', 'label' => ['cameras', 'كاميرات']],
        'microphones' => ['en' => ['microphone', 'microphones', 'mic', 'mics'], 'ar' => ['ميكروفون', 'ميكرفون', 'مايك', 'ميك'],
            'names' => ['microphone', 'mic'], 'cats' => [], 'match' => 'name', 'label' => ['microphones', 'ميكروفونات']],
        'speakers' => ['en' => ['speaker', 'speakers', 'soundbar', 'bluetooth speaker'], 'ar' => ['سبيكر', 'مكبر صوت', 'مكبرات صوت', 'سماعه بلوتوث'],
            'names' => ['speaker', 'soundbar'], 'cats' => ['speakers', 'bluetooth-speaker', 'computer-speaker'], 'match' => 'either', 'label' => ['speakers', 'مكبرات صوت']],
        'tablets' => ['en' => ['tablet', 'tablets', 'ipad', 'tab'], 'ar' => ['تابلت', 'تابلات', 'ايباد', 'تاب'],
            'names' => ['tablet'], 'cats' => ['tablets'], 'match' => 'either', 'label' => ['tablets', 'أجهزة تابلت']],
        'watches' => ['en' => ['smartwatch', 'smartwatches', 'smart watch', 'smart watches', 'watch', 'watches', 'fitness tracker'], 'ar' => ['ساعه', 'ساعات', 'ساعه ذكيه', 'ساعات ذكيه'],
            'names' => ['watch', 'smartwatch', 'tracker'], 'cats' => ['smart-watches'], 'match' => 'either', 'label' => ['smart watches', 'ساعات ذكية']],
        'power' => ['en' => ['power bank', 'power banks', 'powerbank', 'powerbanks', 'charger', 'chargers'], 'ar' => ['باور بانك', 'باوربانك', 'شاحن', 'شواحن', 'شاحن متنقل'],
            'names' => ['power bank', 'powerbank', 'charger'], 'cats' => ['power-banks'], 'match' => 'either', 'label' => ['chargers and power banks', 'شواحن وباور بانك']],
        'cables' => ['en' => ['cable', 'cables', 'adapter', 'adapters', 'hdmi', 'usb hub', 'hub'], 'ar' => ['كابل', 'كابلات', 'كيبل', 'وصله', 'محول', 'شريط'],
            'names' => ['cable', 'adapter', 'hdmi', 'splitter', 'hub'], 'cats' => ['cables-and-adapters', 'cables', 'hdmi-cables'], 'match' => 'either', 'label' => ['cables and adapters', 'كابلات ومحولات']],
        'wheels' => ['en' => ['racing wheel', 'racing wheels', 'steering wheel', 'wheel', 'wheels'], 'ar' => ['مقود', 'ستيرنج', 'دركسيون', 'مقود سباق'],
            'names' => ['wheel'], 'cats' => [], 'match' => 'name', 'platformed' => true, 'label' => ['racing wheels', 'مقاود سباق']],
        'cards' => ['en' => ['psn card', 'psn cards', 'ps card', 'ps cards', 'playstation card', 'playstation cards', 'gift card', 'gift cards'], 'ar' => ['بطاقه بلايستيشن', 'كرت بلايستيشن', 'بطاقه', 'كرت', 'بطاقات'],
            'names' => ['psn', 'card'], 'cats' => ['ps-cards'], 'match' => 'either', 'label' => ['PlayStation cards', 'بطاقات بلايستيشن']],
        'figures' => ['en' => ['action figure', 'action figures', 'figure', 'figures', 'figurine', 'collectible', 'collectibles'], 'ar' => ['مجسم', 'مجسمات', 'فيغر', 'فيجر'],
            'names' => ['figure', 'figurine', 'statue'], 'cats' => ['action-figures'], 'match' => 'either', 'label' => ['collectibles', 'مجسمات']],
        'toys' => ['en' => ['toy', 'toys', 'kids toys'], 'ar' => ['العاب اطفال', 'لعبه اطفال', 'لعب اطفال', 'العاب للاطفال'],
            'names' => ['toy'], 'cats' => ['electronic-toys'], 'match' => 'either', 'label' => ['toys', 'ألعاب أطفال']],
        'accessories' => ['en' => ['accessories', 'accessory', 'accessoires'], 'ar' => ['اكسسوارات', 'اكسسوار', 'اكسيسوارات', 'ملحقات'],
            'names' => [], 'cats' => ['accessories', 'computer-accessories', 'phone-accessories'], 'match' => 'category', 'platformed' => true, 'label' => ['accessories', 'إكسسوارات']],
    ];

    /** Consoles: a filter on the kind (its category tree, or its name in the product's name). */
    public const PLATFORMS = [
        'ps5' => ['en' => ['ps5', 'ps 5', 'playstation 5', 'play station 5'], 'ar' => ['بلايستيشن 5', 'بلاي ستيشن 5', 'بلاي 5', 'بلي 5', 'بليستيشن 5'],
            'cats' => ['ps5'], 'names' => ['ps5', 'playstation 5'], 'label' => 'PS5'],
        'ps4' => ['en' => ['ps4', 'ps 4', 'playstation 4', 'play station 4'], 'ar' => ['بلايستيشن 4', 'بلاي ستيشن 4', 'بلاي 4', 'بلي 4', 'بليستيشن 4'],
            'cats' => ['ps4'], 'names' => ['ps4', 'playstation 4'], 'label' => 'PS4'],
        'playstation' => ['en' => ['playstation', 'play station', 'ps', 'sony', 'psn'], 'ar' => ['بلايستيشن', 'بلاي ستيشن', 'بليستيشن', 'بلاي', 'بلي', 'سوني'],
            'cats' => ['playstation'], 'names' => ['ps3', 'ps4', 'ps5', 'playstation', 'dualsense', 'dualshock'], 'label' => 'PlayStation'],
        'xbox' => ['en' => ['xbox', 'x box', 'xbox one', 'xbox series', 'series x', 'series s', 'xbox 360'], 'ar' => ['اكس بوكس', 'اكسبوكس', 'اكس بوكس ون'],
            'cats' => ['xbox'], 'names' => ['xbox'], 'label' => 'Xbox'],
        'switch' => ['en' => ['switch', 'nintendo', 'nintendo switch', 'switch oled'], 'ar' => ['نينتندو', 'نينتيندو', 'سويتش', 'نينتندو سويتش'],
            'cats' => ['nintendo-switch'], 'names' => ['nintendo', 'switch oled', 'switch lite', 'joy con', 'mario'], 'label' => 'Nintendo Switch'], // not "switch" alone: keyboard switches, USB switches
    ];

    /** Conversation and shopping words. type => [English, Arabic]. */
    private const WORDS = [
        'greet' => [['hi', 'hii', 'hello', 'helo', 'hey', 'hiya', 'yo', 'greetings', 'good morning', 'good afternoon', 'good evening', 'morning', 'evening', 'marhaba', 'marhaban', 'ahlan', 'ahla', 'salam', 'salaam', 'salam alaikum', 'assalamu alaikum', 'bonjour', 'hola', 'hey there', 'hello there'],
            ['مرحبا', 'مرحبه', 'مرحبتين', 'مرحباً', 'اهلا', 'اهلين', 'اهلا وسهلا', 'هلا', 'هلو', 'هاي', 'هاللو', 'السلام عليكم', 'سلام', 'صباح الخير', 'مساء الخير', 'صباح النور', 'مسا الخير']],
        'howru' => [['how are you', 'how r u', 'how are u', 'hows it going', 'how is it going', 'kifak', 'kifik', 'kifkon'], ['كيفك', 'كيف حالك', 'كيف الحال', 'شو الاخبار', 'كيفكم', 'شلونك']],
        'thanks' => [['thanks', 'thank you', 'thank u', 'thx', 'ty', 'merci', 'shukran', 'thanks a lot', 'appreciate it', 'great thanks'], ['شكرا', 'شكراً', 'مشكور', 'يسلمو', 'تسلم', 'يعطيك العافيه', 'شكرا جزيلا', 'ميرسي']],
        'bye' => [['bye', 'goodbye', 'good bye', 'see you', 'good night', 'cya'], ['مع السلامه', 'باي', 'الى اللقاء', 'تصبح على خير']],
        'help' => [['help', 'what can you do', 'who are you', 'how does this work', 'what do you do', 'menu'], ['مساعده', 'ساعدني', 'شو بتعمل', 'مين انت', 'ماذا تفعل', 'شو فيك تعمل']],
        'more' => [['more', 'show more', 'see more', 'others', 'other', 'anything else', 'what else', 'other options', 'next', 'more options'], ['المزيد', 'غيرها', 'غيره', 'كمان', 'شو كمان', 'اعرض المزيد', 'غير هيك', 'خيارات اخرى']],
        'cheap' => [['cheap', 'cheaper', 'cheapest', 'lowest price', 'low price', 'budget', 'affordable', 'less expensive', 'inexpensive'], ['ارخص', 'رخيص', 'رخيصه', 'الارخص', 'سعر منخفض', 'ارخص شي', 'على قد الحال']],
        'stock' => [['in stock', 'available now', 'in stock now', 'ready'], ['متوفر', 'متوفره', 'موجود', 'متاح', 'بالمخزون']],
        'sale' => [['sale', 'on sale', 'offer', 'offers', 'discount', 'discounts', 'discounted', 'deal', 'deals', 'promo', 'promotion'], ['عرض', 'عروض', 'تخفيض', 'تخفيضات', 'خصم', 'خصومات', 'حسم', 'اوفر', 'اوفرات']],
        'used' => [['used', 'second hand', 'secondhand', 'pre owned', 'preowned'], ['مستعمل', 'مستعمله', 'استعمال', 'مستخدم']],
        'gaming' => [['gaming', 'gamer', 'gamers', 'for gaming', 'gaming stuff', 'gaming gear', 'gear'], ['جيمنج', 'جيمنغ', 'قيمنق', 'قيمنج', 'جيمر', 'للالعاب', 'العاب الفيديو']],
    ];

    /** Words that carry no product meaning. */
    private const STOP = [
        ['a', 'an', 'the', 'i', 'im', 'me', 'my', 'you', 'your', 'u', 'r', 'we', 'us', 'do', 'does', 'did', 'have', 'has', 'got', 'is', 'are', 'was', 'be', 'any', 'some', 'for', 'with', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'it',
            'its', 'this', 'that', 'these', 'those', 'want', 'wanna', 'need', 'looking', 'look', 'find', 'show', 'see', 'buy', 'get', 'please', 'pls', 'plz', 'can', 'could', 'would', 'will', 'what', 'whats', 'which',
            'how', 'much', 'many', 'price', 'prices', 'cost', 'costs', 'available', 'stock', 'best', 'good', 'nice', 'top', 'new', 'sell', 'selling', 'sold', 'there', 'one', 'ones', 'something', 'anything', 'stuff', 'thing',
            'things', 'item', 'items', 'product', 'products', 'kind', 'kinds', 'type', 'types', 'option', 'options', 'recommend', 'suggest', 'under', 'below', 'less', 'than', 'over', 'above', 'max', 'up', 'from',
            'between', 'usd', 'dollars', 'dollar', 'about', 'tell', 'like', 'love', 'store', 'shop', 'dmd', 'world', 'lebanon', 'also', 'too', 'just', 'only', 'all', 'list', 'still', 'now', 'today', 'yes', 'no', 'ok', 'okay',
            'sure', 'well', 'so', 'then', 'but', 'if', 'not', 'dont', 'am', 'here', 'where', 'when', 'who', 'why', 'two', 'cool', 'awesome', 'great', 'first', 'instead', 'maybe', 'else'],
        ['هل', 'عندكم', 'عندك', 'عندكن', 'عنا', 'عنده', 'في', 'فيه', 'فيي', 'بدي', 'بدنا', 'اريد', 'ابغى', 'ابي', 'حابب', 'شو', 'ما', 'ماذا', 'كم', 'سعر', 'اسعار', 'بكم', 'قديش', 'من', 'على', 'الى', 'عن', 'لو', 'سمحت',
            'لوسمحت', 'فضلك', 'ممكن', 'يا', 'انا', 'نحن', 'شي', 'شيء', 'اشي', 'حدا', 'واحد', 'دولار', 'حق', 'تبع', 'مع', 'او', 'و', 'لي', 'لنا', 'اي', 'بس', 'كتير', 'جدا', 'حلو', 'منيح', 'افضل', 'احسن', 'جديد',
            'نوع', 'انواع', 'اقل', 'اكثر', 'تحت', 'فوق', 'حتى', 'لحد', 'بين', 'هذا', 'هاد', 'هيدا', 'هيدي', 'هذه', 'يلي', 'اللي', 'الذي', 'التي', 'اعطيني', 'ورجيني', 'فرجيني', 'اعرض', 'دلني', 'تنصحني', 'تنصح', 'لل', 'ل', 'ب', 'كل', 'شي', 'كمان', 'برضو', 'ايضا', 'لسا', 'هلق', 'اليوم', 'نعم', 'لا', 'اه', 'طيب', 'تمام', 'عم', 'دور', 'ادور', 'بدور'],
    ];

    private const ARABIC_PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف'];

    /** @var array<string, list<array{0: string, 1: string, 2: string}>>|null phrase => [type, key, lang] */
    private static ?array $phrases = null;

    private static ?array $stop = null;

    public static function normalize(string $s): string
    {
        $s = mb_strtolower($s);
        $s = strtr($s, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ة' => 'ه', 'ى' => 'ي', '؟' => '?', '،' => ',', '’' => '', "'" => '', '`' => '']);
        $s = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}]/u', '', $s);

        return trim(preg_replace('/\s+/u', ' ', $s));
    }

    /** @return list<string> */
    public static function tokens(string $normalized): array
    {
        return array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', $normalized), fn ($t) => $t !== ''));
    }

    public static function isArabic(string $s): bool
    {
        return (bool) preg_match('/\p{Arabic}/u', $s);
    }

    /** Is $term in $text as whole words (an English plural ending is allowed)? Both normalized. */
    public static function has(string $text, string $term): bool
    {
        return (bool) preg_match('/(?<![\p{L}\p{N}])'.preg_quote($term, '/').'(?:s|es)?(?![\p{L}\p{N}])/u', $text);
    }

    /** Single words the assistant knows on its own (for typo correction). */
    public static function ownWords(): array
    {
        $words = [];
        foreach (array_keys(self::phrases()) as $phrase) {
            foreach (explode(' ', $phrase) as $w) {
                if (! self::isArabic($w)) {
                    $words[$w] = true;
                }
            }
        }

        return array_keys($words);
    }

    private static function phrases(): array
    {
        if (self::$phrases !== null) {
            return self::$phrases;
        }
        $p = [];
        $add = function (string $phrase, string $type, string $key, string $lang) use (&$p) {
            $p[implode(' ', self::tokens(self::normalize($phrase)))][] = [$type, $key, $lang];
        };
        foreach (self::KINDS as $key => $k) {
            foreach ($k['en'] as $w) {
                $add($w, 'kind', $key, 'en');
            }
            foreach ($k['ar'] as $w) {
                $add($w, 'kind', $key, 'ar');
            }
        }
        foreach (self::PLATFORMS as $key => $k) {
            foreach ($k['en'] as $w) {
                $add($w, 'platform', $key, 'xx'); // "ps5" says nothing about the language
            }
            foreach ($k['ar'] as $w) {
                $add($w, 'platform', $key, 'ar');
            }
        }
        foreach (self::WORDS as $type => [$en, $ar]) {
            foreach ($en as $w) {
                $add($w, $type, $type, 'en');
            }
            foreach ($ar as $w) {
                $add($w, $type, $type, 'ar');
            }
        }

        return self::$phrases = $p;
    }

    private static function stop(): array
    {
        if (self::$stop === null) {
            self::$stop = [];
            foreach (self::STOP as $i => $list) {
                foreach ($list as $w) {
                    self::$stop[self::normalize($w)] = $i === 0 ? 'en' : 'ar';
                }
            }
        }

        return self::$stop;
    }

    /** The forms a token may take in the dictionary: itself, then without an Arabic prefix or an English plural. */
    private static function forms(string $t): array
    {
        $forms = [$t];
        if (self::isArabic($t)) {
            foreach (self::ARABIC_PREFIXES as $pre) {
                if (str_starts_with($t, $pre) && mb_strlen($t) - mb_strlen($pre) >= 2) {
                    $forms[] = mb_substr($t, mb_strlen($pre));
                }
            }
        } elseif (mb_strlen($t) > 3) {
            if (str_ends_with($t, 'es')) {
                $forms[] = mb_substr($t, 0, -2);
            }
            if (str_ends_with($t, 's')) {
                $forms[] = mb_substr($t, 0, -1);
            }
        }

        return array_values(array_unique($forms));
    }

    /**
     * Reads a question.
     *
     * @param  list<string>  $catalogWords  words in the store's product, brand and category names (typo targets)
     * @param  list<string>  $ignore  words understood elsewhere (delivery, payment…): never corrected, never searched for
     * @return array{arabic: bool, english: bool, greet: bool, howru: bool, thanks: bool, bye: bool, help: bool, more: bool,
     *               cheap: bool, stock: bool, sale: bool, used: bool, gaming: bool, kinds: list<string>, platforms: list<string>,
     *               words: list<string>, corrected: array<string, string>, unknown: int, min: ?float, max: ?float}
     */
    public static function parse(string $message, array $catalogWords = [], array $ignore = []): array
    {
        $text = self::normalize($message);
        $q = ['arabic' => self::isArabic($text), 'english' => false, 'greet' => false, 'howru' => false, 'thanks' => false, 'bye' => false, 'help' => false,
            'more' => false, 'cheap' => false, 'stock' => false, 'sale' => false, 'used' => false, 'gaming' => false,
            'kinds' => [], 'platforms' => [], 'words' => [], 'said' => [], 'corrected' => [], 'unknown' => 0, 'min' => null, 'max' => null];

        // "ps 5", "playstation 5", "بلايستيشن ٥" → ps5, so the number isn't read as a price or dropped.
        $text = preg_replace('/(?<![\p{L}\p{N}])(?:ps|playstation|play station|بلايستيشن|بليستيشن|بلاي ستيشن|بلاي|بلي)\s*([345])(?![\p{N}])/u', 'ps$1', $text) ?? $text;
        // Prices next ("under $200", "أقل من 200", "between 50 and 100"), then they're out of the way.
        $n = '\$?\s*(\d+(?:\.\d+)?)\s*\$?';
        if (preg_match("/(?:between|from|بين|من)\s*{$n}\s*(?:and|to|-|و|الى|ل)\s*{$n}/u", $text, $m)) {
            [$q['min'], $q['max']] = [min((float) $m[1], (float) $m[2]), max((float) $m[1], (float) $m[2])];
            $text = str_replace($m[0], ' ', $text);
        }
        if (preg_match("/(?:under|below|less than|max|up to|cheaper than|no more than|<|اقل من|تحت|حتى|لحد|ما بيتعدى)\s*{$n}/u", $text, $m)) {
            $q['max'] = (float) $m[1];
            $text = str_replace($m[0], ' ', $text);
        }
        if (preg_match("/(?:over|above|more than|at least|>|اكثر من|فوق|اكتر من)\s*{$n}/u", $text, $m)) {
            $q['min'] = (float) $m[1];
            $text = str_replace($m[0], ' ', $text);
        }
        $text = preg_replace('/(?<![\p{L}\p{N}.])\$?\d+(?:\.\d+)?\$?(?![\p{L}\p{N}])/u', ' ', $text) ?? $text; // lone numbers, not "ps5" or "g435"

        $tokens = self::tokens($text);
        $phrases = self::phrases();
        $stop = self::stop();
        foreach ($ignore as $w) {
            $stop[self::normalize($w)] ??= self::isArabic($w) ? 'ar' : 'en';
        }
        $own = array_flip(self::ownWords());
        $catalog = array_flip($catalogWords);
        $known = $own + array_flip(array_keys($stop)) + $catalog;

        // Typos: an unknown English word of 4+ letters becomes the nearest known word (same first letter, 1 edit; 2 for
        // long words) when there is exactly one best: the assistant's own words first, then the catalog's.
        foreach ($tokens as $i => $t) {
            if (self::isArabic($t) || mb_strlen($t) < 4 || preg_match('/\d/', $t) || isset($known[$t]) || array_filter(self::forms($t), fn ($f) => isset($known[$f]))) {
                continue;
            }
            $fixed = self::nearest($t, $own) ?? self::nearest($t, $catalog);
            if ($fixed !== null) {
                $q['corrected'][$t] = $fixed;
                $tokens[$i] = $fixed;
            }
        }

        $count = count($tokens);
        for ($i = 0; $i < $count;) {
            $hit = null;
            for ($len = min(4, $count - $i); $len >= 1 && ! $hit; $len--) {
                $slice = array_slice($tokens, $i, $len);
                foreach (self::forms($slice[0]) as $first) {
                    $lasts = $len > 1 ? self::forms($slice[$len - 1]) : [null];
                    foreach ($lasts as $last) {
                        $words = $slice;
                        $words[0] = $first;
                        if ($last !== null) {
                            $words[$len - 1] = $last;
                        }
                        if (isset($phrases[$key = implode(' ', $words)])) {
                            $hit = [$phrases[$key], $len];
                            break 2;
                        }
                    }
                }
            }
            if ($hit) {
                foreach ($hit[0] as [$type, $key, $lang]) {
                    $q['english'] = $q['english'] || $lang === 'en';
                    // A feature ("red switch") is also something the product itself must have.
                    $phrase = implode(' ', array_slice($tokens, $i, $hit[1]));
                    foreach (self::KINDS[$key]['specific'] ?? [] as $s) {
                        if ($type === 'kind' && Lexicon::has($phrase, $s)) {
                            $q['words'][] = $s;
                        }
                    }
                    if ($type === 'kind') { // the shopper's own word: a name with it ranks first ("headset" over "airpods")
                        $said = self::isArabic($phrase) ? array_slice(self::KINDS[$key]['names'], 0, 1) : [$phrase, ...self::forms($phrase)];
                        array_push($q['said'], ...$said);
                        $q['gaming'] = $q['gaming'] || (bool) preg_match('/(?<![\p{L}])(?:gaming|gamer|العاب|جيمنج|جيمنغ)(?![\p{L}])/u', $phrase);
                    }
                    match ($type) {
                        'kind' => $q['kinds'][] = $key,
                        'platform' => $q['platforms'][] = $key,
                        default => $q[$type] = true,
                    };
                }
                $i += $hit[1];

                continue;
            }
            $t = $tokens[$i++];
            $isStop = array_values(array_filter(self::forms($t), fn ($f) => isset($stop[$f])));
            if ($isStop) {
                $q['english'] = $q['english'] || $stop[$isStop[0]] === 'en';
            } elseif (self::isArabic($t)) {
                $q['unknown']++;
            } elseif (mb_strlen($t) >= 2 || preg_match('/\d/', $t)) {
                $q['words'][] = $t; // a product word ("gta", "g435") says nothing about the language
            }
        }
        $q['kinds'] = array_values(array_unique($q['kinds']));
        $q['platforms'] = array_values(array_unique($q['platforms']));
        // "ps5" with "playstation" is just PS5.
        if (array_intersect($q['platforms'], ['ps4', 'ps5'])) {
            $q['platforms'] = array_values(array_diff($q['platforms'], ['playstation']));
        }
        // "game controller", "كرسي ألعاب": with another kind, "game" means gaming.
        if (in_array('games', $q['kinds'], true) && count($q['kinds']) > 1) {
            $q['kinds'] = array_values(array_diff($q['kinds'], ['games']));
            $q['gaming'] = true;
        }
        $q['words'] = array_values(array_unique(array_slice($q['words'], 0, 6)));
        $q['said'] = array_values(array_unique(array_filter($q['said'], fn ($s) => ! self::isArabic($s))));

        return $q;
    }

    /** The one known word nearest to $t, or null when none is near or two are equally near. */
    private static function nearest(string $t, array $known): ?string
    {
        $max = mb_strlen($t) >= 8 ? 2 : 1;
        $best = null;
        $bestD = $max + 1;
        $tie = false;
        foreach ($known as $w => $_) {
            $w = (string) $w;
            if ($w === '' || $w[0] !== $t[0] || abs(mb_strlen($w) - mb_strlen($t)) > $max || mb_strlen($w) < 4 || self::isArabic($w)) {
                continue;
            }
            $d = self::distance($t, $w, $max);
            if ($d < $bestD) {
                [$best, $bestD, $tie] = [$w, $d, false];
            } elseif ($d === $bestD && $w !== $best && ! in_array($best, self::forms($w), true) && ! in_array($w, self::forms((string) $best), true)) {
                $tie = true;
            }
        }

        return $best !== null && ! $tie ? $best : null;
    }

    /** Edit distance with adjacent swaps (optimal string alignment), stopping early past $max. */
    public static function distance(string $a, string $b, int $max = 2): int
    {
        $a = mb_str_split($a);
        $b = mb_str_split($b);
        $n = count($a);
        $m = count($b);
        $d = [];
        for ($i = 0; $i <= $n; $i++) {
            $d[$i][0] = $i;
        }
        for ($j = 0; $j <= $m; $j++) {
            $d[0][$j] = $j;
        }
        for ($i = 1; $i <= $n; $i++) {
            $rowMin = PHP_INT_MAX;
            for ($j = 1; $j <= $m; $j++) {
                $cost = $a[$i - 1] === $b[$j - 1] ? 0 : 1;
                $d[$i][$j] = min($d[$i - 1][$j] + 1, $d[$i][$j - 1] + 1, $d[$i - 1][$j - 1] + $cost);
                if ($i > 1 && $j > 1 && $a[$i - 1] === $b[$j - 2] && $a[$i - 2] === $b[$j - 1]) {
                    $d[$i][$j] = min($d[$i][$j], $d[$i - 2][$j - 2] + 1);
                }
                $rowMin = min($rowMin, $d[$i][$j]);
            }
            if ($rowMin > $max) {
                return $max + 1;
            }
        }

        return $d[$n][$m];
    }
}
