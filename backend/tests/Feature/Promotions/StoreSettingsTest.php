<?php

namespace Tests\Feature\Promotions;

use App\Models\Product;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/** The owner's store settings, stored in MySQL, and everything that reads them. */
class StoreSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_owner_reads_defaults_and_changes_only_what_is_sent(): void
    {
        $owner = $this->owner();
        $owner->get('/api/v1/admin/settings')->assertOk()->assertJsonPath('data.low_stock_threshold', 2)->assertJsonPath('data.payment_methods', ['cod', 'bank_transfer']);

        $owner->put('/api/v1/admin/settings', ['contact_phone' => '+961 1 234 567', 'low_stock_threshold' => 5])->assertOk()
            ->assertJsonPath('data.contact_phone', '+961 1 234 567')->assertJsonPath('data.low_stock_threshold', 5)->assertJsonPath('data.store_name', 'DMD World');
        $this->assertSame(['contact_phone', 'low_stock_threshold'], Setting::orderBy('key')->pluck('key')->all(), 'only the changed keys are stored');

        $owner->put('/api/v1/admin/settings', ['secret_mode' => true])->assertStatus(422)->assertJsonPath('error.code', 'UNKNOWN_SETTING');
        $owner->put('/api/v1/admin/settings', ['contact_email' => 'not-an-email'])->assertStatus(422);
        $owner->put('/api/v1/admin/settings', ['payment_methods' => []])->assertStatus(422);
        $owner->put('/api/v1/admin/settings', ['payment_methods' => ['bitcoin']])->assertStatus(422);
        $owner->put('/api/v1/admin/settings', ['low_stock_threshold' => -1])->assertStatus(422);
        $owner->put('/api/v1/admin/settings', ['reviews_enabled' => null])->assertStatus(422);

        $this->buyer()->put('/api/v1/admin/settings', ['store_name' => 'Hacked'])->assertUnauthorized();
        $this->client()->get('/api/v1/admin/settings')->assertUnauthorized();
    }

    public function test_the_storefront_follows_the_settings(): void
    {
        Notification::fake();
        $owner = $this->owner();
        $p = Product::factory()->stock(4)->create();
        $catalog = fn () => $this->client()->get('/api/v1/catalog')->json();

        $this->assertSame('in_stock', collect($catalog()['products'])->firstWhere('id', $p->id)['availability']);
        $owner->put('/api/v1/admin/settings', ['low_stock_threshold' => 4, 'contact_email' => 'hello@dmdworld.store', 'payment_methods' => ['cod']])->assertOk();

        $now = $catalog();
        $this->assertSame('low_stock', collect($now['products'])->firstWhere('id', $p->id)['availability']);
        $this->assertSame(['store_name' => 'DMD World', 'contact_phone' => '+961 70 903 900', 'contact_email' => 'hello@dmdworld.store', 'reviews_enabled' => true, 'coupons_enabled' => true], $now['store']);
        $this->assertArrayNotHasKey('daily_revenue_target', $now['store'], 'owner-only settings stay private');

        $this->assertSame(['cod'], array_column($this->client()->get('/api/v1/checkout/options')->json('data.payment_methods'), 'id'));
        $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'bank_transfer',
        ])->assertStatus(422)->assertJsonValidationErrors('payment_method', 'error.fields');
    }

    public function test_reviews_can_require_a_purchase_or_be_switched_off(): void
    {
        $p = Product::factory()->create();
        $owner = $this->owner();
        $review = fn () => $this->buyer()->post('/api/v1/account/reviews', ['product_id' => $p->id, 'rating' => 4, 'title' => 'Pretty good', 'body' => 'Does what it says on the box.']);

        $owner->put('/api/v1/admin/settings', ['reviews_require_purchase' => true])->assertOk();
        $review()->assertForbidden()->assertJsonPath('error.code', 'NOT_VERIFIED');
        $owner->put('/api/v1/admin/settings', ['reviews_require_purchase' => false, 'reviews_enabled' => false])->assertOk();
        $review()->assertForbidden()->assertJsonPath('error.code', 'REVIEWS_DISABLED');
        $owner->put('/api/v1/admin/settings', ['reviews_enabled' => true])->assertOk();
        $review()->assertCreated();
    }
}
