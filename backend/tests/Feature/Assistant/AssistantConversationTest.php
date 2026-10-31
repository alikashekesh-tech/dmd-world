<?php

namespace Tests\Feature\Assistant;

use App\Http\Resources\ProductResource;
use App\Models\AssistantUsage;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * How the shopping assistant talks: greetings, gaming words and their synonyms, typos, questions too broad to answer
 * (it asks), follow-ups that use the previous answer, ranking, Arabic, and what it says when nothing matches. Every
 * product it names comes from the catalog with its real price, stock and link.
 */
class AssistantConversationTest extends TestCase
{
    use RefreshDatabase;

    private array $p = [];

    private function ask(string $message, ?array $context = null)
    {
        return $this->client()->post('/api/v1/assistant', array_filter(['message' => $message, 'context' => $context], fn ($v) => $v !== null))->assertOk()->json('data');
    }

    private function ids(array $answer): array
    {
        return array_column($answer['products'], 'id');
    }

    private function cat(string $name, string $slug, ?Category $parent = null): Category
    {
        return Category::create(['name' => $name, 'slug' => $slug, 'parent_id' => $parent?->id, 'is_visible' => true]);
    }

    private function product(string $key, string $name, string $price, array $cats = [], array $extra = []): Product
    {
        $p = Product::factory()->create(['name' => $name, 'regular_price' => $price] + $extra);
        foreach ($cats as $i => $c) {
            $p->categories()->attach($c->id, ['is_primary' => $i === 0]);
        }

        return $this->p[$key] = $p;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $ps = $this->cat('PlayStation', 'playstation');
        $ps4 = $this->cat('PS4', 'ps4', $ps);
        $ps5 = $this->cat('PS5', 'ps5', $ps);
        $ps4Games = $this->cat('Games', 'games', $ps4);
        $ps4New = $this->cat('New', 'new', $ps4Games);
        $ps5Games = $this->cat('Games', 'games', $ps5);
        $ps4Acc = $this->cat('Accessories', 'accessories', $ps4);
        $switch = $this->cat('Nintendo Switch', 'nintendo-switch');
        $switchGames = $this->cat('Games', 'games', $switch);
        $xbox = $this->cat('Xbox', 'xbox');
        $controllers = $this->cat('Controllers', 'controllers');
        $other = $this->cat('Other', 'other');
        $figures = $this->cat('Action Figures', 'action-figures', $other);
        $laptops = $this->cat('Laptops', 'laptops');
        $laptopsList = $this->cat('Laptops', 'laptops', $laptops);
        $coolers = $this->cat('Laptop Coolers', 'laptop-coolers', $laptops);
        $headphones = $this->cat('Headphones', 'headphones');
        $mouse = $this->cat('Mouse', 'mouse');
        $pads = $this->cat('Mouse Pads', 'mouse-pads');
        $keyboards = $this->cat('Keyboards', 'keyboards');

        $this->product('gta', 'PS4 GTA V', '20.00', [$ps4New, $ps4Games]);
        $this->product('tekken', 'PS4 Tekken 7', '15.00', [$ps4Games]);
        $this->product('spiderman', 'PS5 Spider-Man 2', '60.00', [$ps5Games]);
        $this->product('mario', 'Mario Kart 8 Deluxe', '48.00', [$switchGames]);
        $this->product('mug', 'Game of Thrones Mug', '18.00', [$figures]);
        $this->product('ps4pad', 'Megavolt PS4 Controller', '12.00', [$controllers, $ps4Acc]);
        $this->product('xboxpad', 'Xbox Series Controller White', '60.00', [$controllers, $xbox]);
        $this->product('joycon', 'Nintendo Switch Joy-Con Pair', '30.00', [$controllers]);
        $this->product('cloud', 'HyperX Cloud II Gaming Headset', '55.00', [$headphones]);
        $this->product('k9', 'Onikuma K9 Gaming Headphones', '25.00', [$headphones], ['description' => '<p>Wired headset with a noise cancelling microphone.</p>']);
        $this->product('deathadder', 'Razer DeathAdder Essential Mouse', '19.00', [$mouse]);
        $this->product('pad', 'Razer Mouse Pad Large', '5.00', [$pads]);
        $this->product('fantech', 'Fantech MK886 Mechanical Keyboard', '28.00', [$keyboards]);
        $this->product('z11', 'E-YOOSO Z11 RGB', '40.00', [], ['description' => 'A wireless keyboard with red switches and a detachable cable.']);
        $this->product('hp', 'HP Fortis Laptop', '350.00', [$laptopsList, $laptops]);
        $this->product('fan', 'Marvo FN-41 Laptop Fan', '28.00', [$laptops, $coolers]);
        $this->product('chair', 'Megavolt Gaming Chair', '105.00');
        $this->product('soldout', 'PS5 Ratchet & Clank', '45.00', [$ps5Games], ['stock_quantity' => 0]);
    }

    public function test_greetings_in_english_and_arabic(): void
    {
        $hi = $this->ask('hi');
        $this->assertSame(['social', 'en', [], false], [$hi['kind'], $hi['locale'], $hi['products'], $hi['handoff']]);
        $this->assertStringContainsString('shopping assistant', $hi['reply']);
        $this->assertContains('PS5 games', $hi['suggestions']);
        $this->assertStringContainsString('doing well', $this->ask('Hello, how are you?')['reply']);

        $ar = $this->ask('مرحبا');
        $this->assertSame(['social', 'ar'], [$ar['kind'], $ar['locale']]);
        $this->assertStringContainsString('أهلاً وسهلاً', $ar['reply']);
        $this->assertSame('ar', $this->ask('السلام عليكم')['locale']);
        $this->assertStringContainsString('على الرحب والسعة', $this->ask('شكراً')['reply']);
        $this->assertStringContainsString('You’re welcome', $this->ask('thanks!')['reply']);

        // A greeting with a question answers the question.
        $both = $this->ask('Hello! do you have headsets?');
        $this->assertStringStartsWith('Hi there!', $both['reply']);
        $this->assertEqualsCanonicalizing([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($both));
        $day = AssistantUsage::sole();
        $this->assertSame([7, 7, 0], [(int) $day->questions, (int) $day->answered, (int) $day->unanswered], 'greetings count as answered');
    }

    public function test_game_finds_real_games_and_asks_which_console(): void
    {
        $r = $this->ask('game');
        $games = [$this->p['gta']->id, $this->p['tekken']->id, $this->p['spiderman']->id, $this->p['mario']->id, $this->p['soldout']->id];
        $this->assertSame('clarify', $r['kind']);
        $this->assertEmpty(array_diff($this->ids($r), $games), 'only games: never the Game of Thrones mug');
        $this->assertNotContains($this->p['mug']->id, $this->ids($r));
        $this->assertStringContainsString('Which console are they for', $r['reply']);
        $this->assertEqualsCanonicalizing(['PS4', 'PS5', 'Nintendo Switch'], $r['suggestions']);
        $this->assertFalse($r['handoff']);

        // Too broad to search at all: it asks what kind of thing.
        $g = $this->ask('gaming');
        $this->assertSame(['clarify', []], [$g['kind'], $g['products']]);
        $this->assertStringContainsString('games, a controller, a headset', $g['reply']);
        $this->assertNotEmpty($g['suggestions']);
    }

    public function test_follow_ups_use_the_previous_answer(): void
    {
        $r = $this->ask('games');
        $ps4 = $this->ask('ps4', $r['context']);
        $this->assertEqualsCanonicalizing([$this->p['gta']->id, $this->p['tekken']->id], $this->ids($ps4));
        $this->assertSame('products', $ps4['kind']);
        $this->assertStringContainsString('PS4 games', $ps4['reply']);

        $cheap = $this->ask('cheaper', $ps4['context']);
        $this->assertSame([$this->p['tekken']->id, $this->p['gta']->id], $this->ids($cheap), 'cheapest first');
        $this->assertStringContainsString('lowest prices', $cheap['reply']);

        // "and controllers?" keeps the console; headsets are a new subject.
        $pads = $this->ask('and controllers?', $ps4['context']);
        $this->assertSame([$this->p['ps4pad']->id], $this->ids($pads));
        $this->assertEqualsCanonicalizing([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($this->ask('headsets', $ps4['context'])));
        // Asking for games again is broader, not "PS4 games" again; a greeting starts afresh.
        $this->assertSame('clarify', $this->ask('do you have games?', $ps4['context'])['kind']);
        $this->assertSame('clarify', $this->ask('hello! games?', $ps4['context'])['kind']);
        // Words that match nothing in the last subject are a new question, not "flux capacitor among PS4 games".
        $unrelated = $this->ask('flux capacitor', $ps4['context']);
        $this->assertSame(['none', [], true], [$unrelated['kind'], $unrelated['products'], $unrelated['handoff']]);
        $this->assertSame([$this->p['gta']->id], $this->ids($this->ask('gta', $r['context'])), 'a word that does match refines');

        // "Show more" pages through.
        foreach (range(1, 4) as $i) {
            $this->product("extra{$i}", "PS4 Racing Game {$i}", '10.00', [Category::where('slug', 'games')->whereHas('parent', fn ($q) => $q->where('slug', 'ps4'))->sole()]);
        }
        $first = $this->ask('ps4 games');
        $this->assertCount(4, $first['products']);
        $this->assertContains('Show more', $first['suggestions']);
        $more = $this->ask('show more', $first['context']);
        $this->assertCount(2, $more['products']);
        $this->assertEmpty(array_intersect($this->ids($first), $this->ids($more)));
        $this->assertStringContainsString('Here are more', $more['reply']);
    }

    public function test_common_typos_are_understood_without_unrelated_matches(): void
    {
        $chair = $this->ask('chiar');
        $this->assertSame([$this->p['chair']->id], $this->ids($chair));
        $this->assertStringContainsString('Showing results for “chair”', $chair['reply']);
        $this->assertEqualsCanonicalizing([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($this->ask('headphnes')));
        $this->assertSame([$this->p['xboxpad']->id], $this->ids($this->ask('controler for xbox')));
        $this->assertSame($this->p['fantech']->id, $this->ids($this->ask('keybord'))[0]);
        $this->assertEqualsCanonicalizing([$this->p['spiderman']->id, $this->p['soldout']->id], $this->ids($this->ask('gmaes for ps5')));
        $this->assertSame([$this->p['deathadder']->id], $this->ids($this->ask('mosue')));

        // Not near enough to anything: nothing is guessed.
        foreach (['house', 'quantum toaster', 'rocket'] as $q) {
            $r = $this->ask($q);
            $this->assertSame(['none', [], true], [$r['kind'], $r['products'], $r['handoff']], $q);
        }
    }

    public function test_gaming_synonyms_and_consoles(): void
    {
        $this->assertEqualsCanonicalizing([$this->p['ps4pad']->id, $this->p['xboxpad']->id, $this->p['joycon']->id], $this->ids($this->ask('joystick')));
        $this->assertSame([$this->p['joycon']->id], $this->ids($this->ask('gamepad for nintendo switch')));
        $this->assertSame([$this->p['xboxpad']->id], $this->ids($this->ask('xbox controller')));
        $this->assertEqualsCanonicalizing([$this->p['spiderman']->id, $this->p['soldout']->id], $this->ids($this->ask('PS5 games')));
        $this->assertEqualsCanonicalizing([$this->p['spiderman']->id, $this->p['soldout']->id], $this->ids($this->ask('playstation 5 video games')));
        $this->assertSame([$this->p['mario']->id], $this->ids($this->ask('video games for nintendo')));
        $this->assertEqualsCanonicalizing([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($this->ask('gaming headphones')));
        $laptop = $this->ask('gaming laptop');
        $this->assertSame([$this->p['hp']->id], $this->ids($laptop), 'a laptop fan is not a laptop');
        $this->assertStringContainsString('None of our laptops is sold as a gaming model', $laptop['reply']);
        $this->assertSame([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($this->ask('headset')), 'named "headset" first');
        $this->assertSame([$this->p['fan']->id], $this->ids($this->ask('laptop cooler')));
        $this->assertSame([$this->p['deathadder']->id], $this->ids($this->ask('mouse')), 'a mouse pad is not a mouse');
        $this->assertSame([$this->p['pad']->id], $this->ids($this->ask('mouse pad')));
        $this->assertSame([$this->p['chair']->id], $this->ids($this->ask('game chair')), '"game" before another kind means gaming');

        $console = $this->ask('controller');
        $this->assertSame('clarify', $console['kind']);
        $this->assertEqualsCanonicalizing(['PS4', 'Xbox', 'Nintendo Switch'], $console['suggestions']);

        // Nothing for that console: said plainly, with what there is.
        $none = $this->ask('ps5 controller');
        $this->assertStringContainsString('I didn’t find controllers for PS5', $none['reply']);
        $this->assertNotEmpty($none['products']);
    }

    public function test_relevance_names_first_then_categories_then_descriptions(): void
    {
        $keyboards = $this->ids($this->ask('keyboard'));
        $this->assertSame([$this->p['fantech']->id], $keyboards, 'named or filed as a keyboard beats a description');
        $this->assertSame([$this->p['z11']->id], $this->ids($this->ask('red switches')), 'found from its description');
        $this->assertSame([$this->p['k9']->id], $this->ids($this->ask('noise cancelling')));
        $this->assertSame([$this->p['deathadder']->id], $this->ids($this->ask('razer mouse')));
        $this->assertEqualsCanonicalizing([$this->p['deathadder']->id, $this->p['pad']->id], $this->ids($this->ask('razer')));
        $this->assertSame([$this->p['cloud']->id], $this->ids($this->ask('hyperx cloud headset')));

        $purple = $this->ask('purple headset');
        $this->assertStringContainsString('I couldn’t find “purple” among our headsets', $purple['reply']);
        $this->assertNotEmpty($purple['products']);

        // Limits that leave nothing: the closest real products, cheapest first.
        $cheap = $this->ask('chair under $50');
        $this->assertStringContainsString('I couldn’t find chairs under $50 right now. Here’s the closest we have:', $cheap['reply']);
        $this->assertSame([$this->p['chair']->id], $this->ids($cheap));
    }

    public function test_arabic_questions(): void
    {
        $r = $this->ask('هل عندكم سماعات؟');
        $this->assertSame('ar', $r['locale']);
        $this->assertEqualsCanonicalizing([$this->p['cloud']->id, $this->p['k9']->id], $this->ids($r));
        $this->assertStringContainsString('إليك ما وجدته في متجرنا من سماعات', $r['reply']);

        $this->assertSame([$this->p['xboxpad']->id], $this->ids($this->ask('بدي يد تحكم لاكس بوكس')));
        $this->assertEqualsCanonicalizing([$this->p['spiderman']->id, $this->p['soldout']->id], $this->ids($this->ask('العاب بلايستيشن ٥')));
        $this->assertSame([$this->p['chair']->id], $this->ids($this->ask('كرسي ألعاب')));
        $this->assertSame([$this->p['deathadder']->id], $this->ids($this->ask('ماوس')));
        $hello = $this->ask('مرحبا، عندكم كيبورد؟');
        $this->assertStringStartsWith('أهلاً بك!', $hello['reply']);
        $this->assertSame($this->p['fantech']->id, $this->ids($hello)[0]);

        $games = $this->ask('عندكم ألعاب؟');
        $this->assertSame(['clarify', 'ar'], [$games['kind'], $games['locale']]);
        $this->assertStringContainsString('لأي جهاز تريدها', $games['reply']);
        // A follow-up in Latin letters keeps the Arabic conversation in Arabic.
        $ps5 = $this->ask('ps5', $games['context']);
        $this->assertSame('ar', $ps5['locale']);
        $this->assertEqualsCanonicalizing([$this->p['spiderman']->id, $this->p['soldout']->id], $this->ids($ps5));
        $this->assertStringContainsString('(نفد من المخزون)', $ps5['reply']);

        $none = $this->ask('عندكم ثلاجة؟');
        $this->assertSame(['none', 'ar', true], [$none['kind'], $none['locale'], $none['handoff']]);
        $this->assertStringContainsString('لم أجد ذلك في متجرنا', $none['reply']);
    }

    public function test_answers_are_grounded_in_the_catalog_and_misses_are_helpful(): void
    {
        $r = $this->ask('PS5 games');
        $sold = collect($r['products'])->firstWhere('id', $this->p['soldout']->id);
        $real = (new ProductResource($this->p['soldout']->fresh()->load(['images', 'categories', 'variants', 'brand'])))->resolve();
        $this->assertSame([$real['price'], $real['availability'], '/product/'.$real['id']], [$sold['price'], $sold['availability'], $sold['url']]);
        $this->assertStringContainsString('PS5 Ratchet & Clank: $45 (sold out)', $r['reply']);
        $this->assertSame($this->p['spiderman']->id, $r['products'][0]['id'], 'in stock first');

        $monitor = $this->ask('gaming monitor');
        $this->assertSame(['none', [], true], [$monitor['kind'], $monitor['products'], $monitor['handoff']]);
        $this->assertStringContainsString('We don’t have any monitors in the store right now', $monitor['reply']);
        $this->assertStringContainsString('live chat or on WhatsApp', $monitor['reply']);
        $this->assertNotEmpty($monitor['suggestions']);

        $nothing = $this->ask('flux capacitor');
        $this->assertStringContainsString('We carry games, consoles, controllers', $nothing['reply']);

        // Store questions mid-conversation don't repeat the last search.
        $info = $this->ask('how much is delivery?', $r['context']);
        $this->assertSame(['info', []], [$info['kind'], $info['products']]);
    }

    public function test_the_context_from_the_browser_is_checked(): void
    {
        $forged = $this->ask('cheaper', ['kinds' => ['hacking', 'games'], 'words' => ['<script>', 'gta'], 'platforms' => ['ps4', 'gamecube'], 'offset' => 0, 'sale' => 'yes', 'locale' => 'en']);
        $this->assertSame([$this->p['gta']->id], $this->ids($forged), 'unknown kinds, consoles, bad words and non-boolean flags are dropped');
        $this->client()->post('/api/v1/assistant', ['message' => 'more', 'context' => ['offset' => 'lots']])->assertStatus(422);
        $this->client()->post('/api/v1/assistant', ['message' => 'more', 'context' => ['locale' => 'fr']])->assertStatus(422);
        $this->client()->post('/api/v1/assistant', ['message' => 'more', 'context' => ['words' => array_fill(0, 7, 'x')]])->assertStatus(422);
    }
}
