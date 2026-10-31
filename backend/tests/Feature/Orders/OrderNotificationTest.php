<?php

namespace Tests\Feature\Orders;

use App\Models\Order;
use App\Models\OutboundMessage;
use App\Models\Product;
use App\Notifications\NewOrderForOwner;
use App\Notifications\OrderPlaced;
use App\Notifications\OrderUpdate;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Fakes\FakeMessenger;
use Tests\TestCase;

/**
 * What the buyer and the owner hear about an order: the buyer by email at each step the owner takes (and by WhatsApp
 * only if they asked and a provider is set up), the owner on their private number. Nothing goes to the public contact
 * number, and nothing is reported as sent that wasn't.
 */
class OrderNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function place(string $payment = 'cod', bool $phoneUpdates = false, string $delivery = 'pickup'): array
    {
        $p = Product::factory()->create(['regular_price' => '40.00']);

        return $this->client()->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Rami', 'last_name' => 'Aoun', 'email' => 'rami@example.com', 'phone' => '+961 71 555 666'],
            'delivery_method' => $delivery, 'payment_method' => $payment, 'updates_by_phone' => $phoneUpdates,
            'address' => $delivery === 'delivery' ? ['city' => 'Beirut', 'street' => 'Hamra Street'] : null,
        ])->assertCreated()->json('data');
    }

    private function events(): array
    {
        return Notification::sentNotifications()[AnonymousNotifiable::class] ?? [];
    }

    /** @return list<string> the order-update events emailed, in order */
    private function updates(): array
    {
        $sent = [];
        foreach (Notification::sentNotifications() as $byId) {
            foreach ($byId as $byClass) {
                foreach ($byClass[OrderUpdate::class] ?? [] as $n) {
                    $sent[] = $n['notification']->event;
                }
            }
        }

        return $sent;
    }

    public function test_the_buyer_is_emailed_at_each_step_the_owner_takes(): void
    {
        $order = $this->place('cod', delivery: 'delivery');
        $owner = $this->owner();
        $owner->post("/api/v1/admin/orders/{$order['id']}/dispatch")->assertStatus(409)->assertJsonPath('error.code', 'NOT_DISPATCHABLE');
        $owner->put("/api/v1/admin/orders/{$order['id']}/status", ['status' => 'processing'])->assertOk();
        $owner->post("/api/v1/admin/orders/{$order['id']}/dispatch")->assertOk()->assertJsonPath('data.dispatched_at', fn ($at) => $at !== null);
        $owner->post("/api/v1/admin/orders/{$order['id']}/dispatch")->assertOk(); // twice: told once
        $owner->put("/api/v1/admin/orders/{$order['id']}/status", ['status' => 'completed'])->assertOk();

        $this->assertSame(['confirmed', 'dispatched', 'completed'], $this->updates());
        Notification::assertSentOnDemand(OrderUpdate::class, fn ($n, $c, $to) => $to->routes['mail'] === 'rami@example.com');
        $this->assertSame(0, OutboundMessage::count(), 'no WhatsApp provider: nothing is sent by phone');
    }

    public function test_a_whish_order_says_payment_is_awaited_and_the_buyer_hears_when_it_arrives(): void
    {
        $order = $this->place('whish');
        Notification::assertSentOnDemand(OrderPlaced::class, function (OrderPlaced $n) {
            $lines = implode("\n", $n->toMail(new AnonymousNotifiable)->introLines);

            return str_contains($lines, 'Payment: DMD sends you the Whish Money payment details');
        });
        $this->owner()->put("/api/v1/admin/orders/{$order['id']}/payment", ['payment_status' => 'paid'])->assertOk();
        $this->assertSame(['payment_received'], $this->updates());
    }

    public function test_cash_on_delivery_collected_at_completion_sends_no_separate_payment_email(): void
    {
        $order = $this->place('cod');
        $owner = $this->owner();
        $owner->put("/api/v1/admin/orders/{$order['id']}/status", ['status' => 'completed'])->assertOk();
        $this->assertSame(['completed'], $this->updates());
        Notification::assertSentOnDemand(OrderPlaced::class, fn (OrderPlaced $n) => ! str_contains(implode("\n", $n->toMail(new AnonymousNotifiable)->introLines), 'Payment:'));
    }

    public function test_the_owner_can_switch_customer_updates_off_and_a_buyer_cancelling_is_not_emailed_about_it(): void
    {
        $p = Product::factory()->create();
        $guest = $this->client();
        $placed = $guest->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Rami', 'last_name' => 'Aoun', 'email' => 'rami@example.com', 'phone' => '+961 71 555 666'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->json();
        $guest->post("/api/v1/orders/{$placed['data']['id']}/cancel", ['token' => $placed['meta']['guest_token']])->assertOk();
        $this->assertSame([], $this->updates(), 'the buyer cancelled it themselves');

        $mine = $this->place();
        StoreSettings::put(['notify_customers_status' => false]);
        $owner = $this->owner();
        $owner->put("/api/v1/admin/orders/{$mine['id']}/status", ['status' => 'processing'])->assertOk();
        $owner->put("/api/v1/admin/orders/{$mine['id']}/status", ['status' => 'cancelled', 'note' => 'Out of stock'])->assertOk();
        $this->assertSame([], $this->updates());
    }

    public function test_the_owners_private_number_hears_about_new_orders_only_through_a_provider(): void
    {
        $owner = $this->owner();
        $owner->put('/api/v1/admin/settings', ['order_notification_phone' => '76 111 222', 'order_notification_email' => 'orders@dmd.test'])->assertOk()
            ->assertJsonPath('data.order_notification_phone', '+96176111222')->assertJsonPath('meta.messaging.whatsapp', false);
        $this->assertNotContains('order_notification_phone', StoreSettings::PUBLIC, 'the private number never reaches the storefront');
        $this->assertArrayNotHasKey('order_notification_phone', $this->client()->get('/api/v1/catalog')->json('settings') ?? []);

        $this->place();
        Notification::assertSentOnDemand(NewOrderForOwner::class, fn ($n, $c, $to) => $to->routes['mail'] === 'orders@dmd.test');
        $this->assertSame(0, OutboundMessage::count(), 'no provider: no text, and none pretended');

        $fake = FakeMessenger::install(['whatsapp']);
        $this->assertTrue($this->client()->get('/api/v1/checkout/options')->json('data.phone_updates'));
        $order = $this->place('cod', phoneUpdates: true);
        $this->assertSame(['+96176111222', '+961 71 555 666'], array_column($fake->sent, 'to'), 'the owner, then the buyer who asked');
        $this->assertStringContainsString("order #{$order['number']}", $fake->sent[0]['text']);
        $this->assertNotContains(StoreSettings::get('contact_phone'), array_column($fake->sent, 'to'), 'the public number is never messaged');
        $this->assertTrue(Order::find($order['id'])->updates_by_phone);

        $owner->put("/api/v1/admin/orders/{$order['id']}/status", ['status' => 'processing'])->assertOk();
        $this->assertStringContainsString('is confirmed', end($fake->sent)['text']);
        $this->assertSame(3, OutboundMessage::where('status', 'sent')->count());
    }
}
