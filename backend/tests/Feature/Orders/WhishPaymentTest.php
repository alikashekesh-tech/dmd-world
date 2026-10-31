<?php

namespace Tests\Feature\Orders;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Whish Money: chosen at checkout and paid outside the site (no gateway). The order waits, unpaid, until DMD sees the
 * payment and marks it paid; nothing marks it paid on its own, and only an admin can.
 */
class WhishPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function order(Product $p, string $payment = 'whish'): \Illuminate\Testing\TestResponse
    {
        return $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Rima', 'last_name' => 'Haddad', 'email' => 'rima@example.com', 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => $payment,
        ]);
    }

    public function test_checkout_offers_whish_money_with_its_note(): void
    {
        $methods = collect($this->client()->get('/api/v1/checkout/options')->assertOk()->json('data.payment_methods'));
        $this->assertSame(['cod', 'bank_transfer', 'whish'], $methods->pluck('id')->all(), 'the existing methods stay, Whish is added');
        $whish = $methods->firstWhere('id', 'whish');
        $this->assertSame('Whish Money', $whish['title']);
        $this->assertStringContainsString('Whish Money payment details', $whish['description']);
    }

    public function test_a_whish_order_waits_unpaid_until_an_admin_marks_it_paid(): void
    {
        $p = Product::factory()->create(['regular_price' => '30.00']);
        $r = $this->order($p)->assertCreated()
            ->assertJsonPath('data.payment_method', 'whish')->assertJsonPath('data.payment_method_label', 'Whish Money')->assertJsonPath('data.payment_status', 'unpaid');
        $id = $r->json('data.id');

        $owner = $this->owner();
        // Completing the order doesn't mark a Whish payment as received (only cash on delivery is collected then).
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'processing'])->assertOk();
        $owner->put("/api/v1/admin/orders/{$id}/status", ['status' => 'completed'])->assertOk();
        $this->assertSame('unpaid', Order::find($id)->payment_status);

        // Nobody but an admin can change it.
        $this->client()->put("/api/v1/admin/orders/{$id}/payment", ['payment_status' => 'paid'])->assertUnauthorized();
        $this->assertSame('unpaid', Order::find($id)->payment_status);

        $owner->put("/api/v1/admin/orders/{$id}/payment", ['payment_status' => 'paid'])->assertOk()->assertJsonPath('data.payment_status', 'paid');
        $owner->put("/api/v1/admin/orders/{$id}/payment", ['payment_status' => 'approved'])->assertStatus(422);
        $this->assertSame('paid', Order::find($id)->payment_status);
    }

    public function test_the_owner_can_switch_whish_off_and_checkout_then_refuses_it(): void
    {
        $owner = $this->owner();
        $owner->put('/api/v1/admin/settings', ['payment_methods' => ['cod', 'bank_transfer'], 'whish_note' => 'Pay by Whish to 70 903 900'])->assertOk();
        $this->assertNotContains('whish', collect($this->client()->get('/api/v1/checkout/options')->json('data.payment_methods'))->pluck('id')->all());
        $this->order(Product::factory()->create())->assertStatus(422);

        $owner->put('/api/v1/admin/settings', ['payment_methods' => ['cod', 'whish']])->assertOk();
        $whish = collect($this->client()->get('/api/v1/checkout/options')->json('data.payment_methods'))->firstWhere('id', 'whish');
        $this->assertSame('Pay by Whish to 70 903 900', $whish['description'], 'the owner’s own note');
    }
}
