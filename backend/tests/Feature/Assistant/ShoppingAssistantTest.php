<?php

namespace Tests\Feature\Assistant;

use App\Models\AssistantUsage;
use App\Models\Brand;
use App\Models\Product;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Fakes\FakeAssistantProvider;
use Tests\TestCase;

/**
 * The shopping assistant answers from the store's own data only: real products, prices and stock from MySQL, and the
 * store's own settings. Anything else goes to a person. Without an approved AI provider and budget nothing is called.
 */
class ShoppingAssistantTest extends TestCase
{
    use RefreshDatabase;

    private function ask(string $message, ?string $ip = null)
    {
        return $this->client($ip)->post('/api/v1/assistant', ['message' => $message]);
    }

    private function catalog(): array
    {
        $megavolt = Brand::create(['name' => 'Megavolt', 'slug' => 'megavolt', 'is_active' => true]);

        return [
            'chair' => Product::factory()->create(['name' => 'Megavolt Gaming Chair', 'brand_id' => $megavolt->id, 'regular_price' => '150.00']),
            'throne' => Product::factory()->create(['name' => 'Throne Gaming Chair XL', 'regular_price' => '320.00']),
            'headset' => Product::factory()->stock(0)->create(['name' => 'Marvo HG9015 Headset', 'regular_price' => '25.00']),
            'draft' => Product::factory()->draft()->create(['name' => 'Secret Chair Prototype', 'regular_price' => '10.00']),
            'mouse' => Product::factory()->onSale('12.00')->create(['name' => 'Marvo M291 Mouse', 'regular_price' => '15.00']),
        ];
    }

    public function test_it_answers_with_real_products_prices_and_stock_only(): void
    {
        $p = $this->catalog();
        $r = $this->ask('Do you have a gaming chair under $200?')->assertOk()->json('data');
        $this->assertSame(['en', 'catalog', false], [$r['locale'], $r['source'], $r['handoff']]);
        $this->assertSame([$p['chair']->id], array_column($r['products'], 'id'), 'only what matches, within the price asked, published');
        $this->assertSame([150, '/product/'.$p['chair']->id], [$r['products'][0]['price'], $r['products'][0]['url']]);
        $this->assertStringContainsString('Megavolt Gaming Chair: $150 (in stock)', $r['reply']);

        // A desk filed under "Chairs and Tables" isn't a chair when chairs match by name.
        $tables = \App\Models\Category::create(['name' => 'Chairs and Tables', 'slug' => 'chairs-and-tables', 'is_visible' => true]);
        Product::factory()->create(['name' => 'Marvo Gaming Desk', 'regular_price' => '120.00'])->categories()->attach($tables->id, ['is_primary' => true]);
        $chairs = $this->ask('chairs')->json('data.products');
        $this->assertEqualsCanonicalizing([$p['chair']->id, $p['throne']->id], array_column($chairs, 'id'), 'a draft is never shown');

        $headset = $this->ask('headset')->json('data');
        $this->assertStringContainsString('Marvo HG9015 Headset: $25 (sold out)', $headset['reply']);
        $sale = $this->ask('any mouse on sale?')->json('data');
        $this->assertSame([$p['mouse']->id], array_column($sale['products'], 'id'));
        $this->assertSame([12, 15, true], [$sale['products'][0]['price'], $sale['products'][0]['regular_price'], $sale['products'][0]['on_sale']]);
    }

    public function test_arabic_questions_get_arabic_answers(): void
    {
        $p = $this->catalog();
        $r = $this->ask('هل عندكم كرسي أقل من ٢٠٠ دولار؟')->assertOk()->json('data');
        $this->assertSame('ar', $r['locale']);
        $this->assertSame([$p['chair']->id], array_column($r['products'], 'id'));
        $this->assertStringContainsString('إليك ما وجدته', $r['reply']);
        $this->assertStringContainsString('(متوفر)', $r['reply']);
    }

    public function test_store_questions_use_the_owners_settings_and_the_rest_goes_to_a_person(): void
    {
        StoreSettings::put(['delivery_fee' => 5, 'payment_methods' => ['cod', 'whish']]);
        $this->assertStringContainsString('Delivery is $5 anywhere in Lebanon', $this->ask('how much is delivery?')->json('data.reply'));
        $pay = $this->ask('how can I pay?')->json('data.reply');
        $this->assertStringContainsString('Cash on delivery, Whish Money', $pay);
        $this->assertStringNotContainsString('bank', strtolower($pay));
        $this->assertStringContainsString('+961 70 903 900', $this->ask('what is your phone number')->json('data.reply'));

        $returns = $this->ask('Can I return a keyboard?')->json('data');
        $this->assertTrue($returns['handoff']);
        $this->assertSame([], $returns['products']);
        $this->assertStringContainsString('live chat or on WhatsApp', $returns['reply']);

        $nothing = $this->ask('quantum toaster')->json('data');
        $this->assertTrue($nothing['handoff']);
        $this->assertStringContainsString('couldn’t find that in our store', $nothing['reply']);
    }

    public function test_usage_is_counted_without_keeping_questions_and_shown_to_the_owner_only(): void
    {
        $this->catalog();
        $this->ask('chair');
        $this->ask('my order is late');
        $day = AssistantUsage::sole();
        $this->assertSame([2, 1, 1, 0], [$day->questions, $day->answered, $day->unanswered, $day->ai_requests]);
        $this->assertSame(['id', 'day', 'questions', 'answered', 'unanswered', 'ai_requests', 'ai_failures', 'ai_input_tokens', 'ai_output_tokens', 'ai_cost_usd', 'created_at', 'updated_at'], array_keys($day->getAttributes()), 'counts only');

        $a = $this->owner()->get('/api/v1/admin/analytics')->assertOk()->json('data');
        $this->assertSame([2, 1, false, false], [$a['assistant']['totals']['questions'], $a['assistant']['totals']['unanswered'], $a['assistant']['ai_connected'], $a['ga4']['connected']]);
        $this->client()->get('/api/v1/admin/analytics')->assertUnauthorized();
    }

    public function test_an_ai_provider_is_used_only_within_a_set_budget_and_period(): void
    {
        $this->catalog();
        $ai = FakeAssistantProvider::install();
        $this->assertSame('catalog', $this->ask('chair')->json('data.source'), 'no budget set: never called');
        StoreSettings::put(['assistant_ai_budget_usd' => 0.5]);
        $this->assertSame('catalog', $this->ask('chair')->json('data.source'), 'no period set: the meaning of the budget is not assumed');
        $this->assertCount(0, $ai->calls);

        StoreSettings::put(['assistant_ai_budget_period' => 'day']);
        $r = $this->ask('chair under 200')->json('data');
        $this->assertSame(['ai', 'Worded by the AI from 1 products.'], [$r['source'], $r['reply']]);
        $this->assertSame('Megavolt Gaming Chair', $ai->calls[0]['facts']['products'][0]['name'], 'the AI is given the store facts');
        $this->assertSame([1200, 150], [(int) AssistantUsage::sole()->ai_input_tokens, (int) AssistantUsage::sole()->ai_output_tokens]);

        $this->ask('chair'); // 0.50 spent: the budget is used up
        $this->assertSame('catalog', $this->ask('chair')->json('data.source'));
        $this->assertCount(2, $ai->calls);
        $this->assertSame(0.5, $this->owner()->get('/api/v1/admin/analytics')->json('data.assistant.budget.spent_usd'));
        $this->assertCount(0, $this->ask('return policy')->json('data.products'));
        $this->assertCount(2, $ai->calls, 'a question for a person never goes to the AI');
    }

    public function test_a_failing_provider_falls_back_to_the_catalog_answer(): void
    {
        $this->catalog();
        FakeAssistantProvider::install(failing: true);
        StoreSettings::put(['assistant_ai_budget_usd' => 5, 'assistant_ai_budget_period' => 'month']);
        $r = $this->ask('chair under 200')->assertOk()->json('data');
        $this->assertSame('catalog', $r['source']);
        $this->assertStringContainsString('Megavolt Gaming Chair: $150', $r['reply']);
        $this->assertSame(1, (int) AssistantUsage::sole()->ai_failures);
    }

    public function test_it_can_be_switched_off_is_rate_limited_and_checks_input(): void
    {
        $this->ask('')->assertStatus(422);
        $this->ask(str_repeat('a', 301))->assertStatus(422);
        foreach (range(1, 10) as $i) {
            $this->ask('chair', '10.9.9.9')->assertOk();
        }
        $this->ask('chair', '10.9.9.9')->assertStatus(429);

        StoreSettings::put(['assistant_enabled' => false]);
        $this->ask('chair')->assertNotFound();
        $this->assertFalse($this->client()->get('/api/v1/catalog')->json('store.assistant_enabled'));
    }
}
