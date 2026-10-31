<?php

namespace Tests\Feature\Orders;

use App\Models\CheckoutRecovery;
use App\Models\OutboundMessage;
use App\Models\Product;
use App\Notifications\CheckoutReminder;
use App\Services\StoreSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Fakes\FakeMessenger;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * Abandoned checkout recovery: only for customers who tick "remind me", only when the owner switched it on, one
 * reminder after the owner's delay (never two), never after they order, and the link restores the items only.
 */
class CheckoutRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function enable(int $minutes = 60): void
    {
        StoreSettings::put(['checkout_reminders_enabled' => true, 'checkout_reminder_delay_minutes' => $minutes]);
    }

    private function save(SpaClient $browser, Product $p, array $extra = []): string
    {
        return $browser->put('/api/v1/checkout/recovery', $extra + [
            'items' => [['product_id' => $p->id, 'quantity' => 2]], 'first_name' => 'Maya', 'channel' => 'email',
            'email' => 'maya@example.com', 'consent' => true,
        ])->assertOk()->json('data.token');
    }

    private function order(SpaClient $browser, Product $p, ?string $token = null, string $email = 'maya@example.com'): array
    {
        return $browser->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 2]],
            'contact' => ['first_name' => 'Maya', 'last_name' => 'Khoury', 'email' => $email, 'phone' => '+961 70 123 456'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod', 'recovery_token' => $token,
        ])->assertCreated()->json('data');
    }

    public function test_off_by_default_and_nothing_is_kept_without_consent(): void
    {
        $p = Product::factory()->create();
        $this->assertFalse($this->client()->get('/api/v1/checkout/options')->json('data.reminders'));
        $this->client()->put('/api/v1/checkout/recovery', ['items' => [['product_id' => $p->id, 'quantity' => 1]], 'channel' => 'email', 'email' => 'a@example.com', 'consent' => true])
            ->assertStatus(409)->assertJsonPath('error.code', 'REMINDERS_OFF');

        $this->enable();
        $this->assertTrue($this->client()->get('/api/v1/checkout/options')->json('data.reminders'));
        $this->client()->put('/api/v1/checkout/recovery', ['items' => [['product_id' => $p->id, 'quantity' => 1]], 'channel' => 'email', 'email' => 'a@example.com'])
            ->assertStatus(422)->assertJsonValidationErrors('consent', 'error.fields');
        $this->assertSame(0, CheckoutRecovery::count());
    }

    public function test_one_reminder_goes_after_the_delay_and_the_link_restores_the_items(): void
    {
        $this->enable(60);
        $p = Product::factory()->create(['name' => 'Redragon Keyboard']);
        $browser = $this->client();
        $token = $this->save($browser, $p);
        $this->assertSame($token, $this->save($browser, $p, ['token' => $token, 'items' => [['product_id' => $p->id, 'quantity' => 3]]]), 'the same checkout, updated');
        $this->assertSame(1, CheckoutRecovery::count());
        // As the browser sends it: the fields it doesn't use are null.
        $this->client()->put('/api/v1/checkout/recovery', ['token' => null, 'channel' => 'email', 'first_name' => 'Ola', 'email' => 'ola@example.com', 'phone' => null, 'consent' => true,
            'items' => [['product_id' => $p->id, 'variant_id' => null, 'quantity' => 1]]])->assertOk();
        CheckoutRecovery::where('email', 'ola@example.com')->delete();

        $this->travel(30)->minutes();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        Notification::assertNothingSent();

        $this->travel(31)->minutes();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        Notification::assertSentOnDemandTimes(CheckoutReminder::class, 1);
        Notification::assertSentOnDemand(CheckoutReminder::class, fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'maya@example.com'
            && $n->names === ['Redragon Keyboard'] && str_ends_with($n->url, "/cart?recover={$token}"));

        // The link gives back what was in the checkout, and nothing about the customer.
        $restored = $this->client()->get("/api/v1/checkout/recovery/{$token}")->assertOk()->json('data');
        $this->assertSame(['items'], array_keys($restored));
        $this->assertEquals([['product_id' => $p->id, 'variant_id' => null, 'quantity' => 3]], $restored['items']);

        // Ordering with it counts as recovered, and the owner sees it.
        $order = $this->order($browser, $p, $token);
        $this->client()->get("/api/v1/checkout/recovery/{$token}")->assertStatus(410);
        $list = $this->owner()->get('/api/v1/admin/checkout-recoveries')->assertOk();
        $this->assertSame(['recovered', $order['id']], [$list->json('data.0.state'), $list->json('data.0.order.id')]);
        $this->assertSame([1, 1, 1], [$list->json('meta.stats.saved'), $list->json('meta.stats.reminded'), $list->json('meta.stats.recovered_after_reminder')]);
        $this->assertEquals($order['total'], $list->json('meta.stats.recovered_revenue'));
    }

    public function test_no_reminder_after_the_customer_orders_or_withdraws(): void
    {
        $this->enable(15);
        $p = Product::factory()->create();
        $this->save($this->client(), $p); // saved in one browser
        $this->order($this->client(), $p, null, 'MAYA@example.com'); // ordered from another, same email
        $withdrawn = $this->save($this->client(), $p, ['email' => 'nour@example.com']);
        $this->client()->delete("/api/v1/checkout/recovery/{$withdrawn}")->assertNoContent();
        $this->assertNull(CheckoutRecovery::where('token', $withdrawn)->value('email'), 'a withdrawn checkout keeps no contact details');

        $this->travel(2)->hours();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        Notification::assertNotSentTo(new AnonymousNotifiable, CheckoutReminder::class);
        Notification::assertSentOnDemandTimes(CheckoutReminder::class, 0);
    }

    public function test_one_email_address_gets_at_most_one_reminder_however_many_checkouts_name_it(): void
    {
        $this->enable(15);
        $p = Product::factory()->create();
        $first = $this->save($this->client(), $p, ['email' => 'target@example.com']);
        $second = $this->save($this->client(), $p, ['email' => 'TARGET@example.com']);
        $this->assertNotSame($first, $second, 'someone else typing the same email never gets the first checkout’s link');
        $this->assertSame(1, CheckoutRecovery::query()->open()->count(), 'the older one waiting is replaced');
        $this->client()->get("/api/v1/checkout/recovery/{$first}")->assertNotFound();

        $this->travel(1)->hours();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->save($this->client(), $p, ['email' => 'target@example.com']); // a new one after the reminder went
        $this->travel(1)->hours();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        Notification::assertSentOnDemandTimes(CheckoutReminder::class, 1);
    }

    public function test_switching_it_off_stops_reminders_and_old_details_are_erased(): void
    {
        $this->enable(15);
        $p = Product::factory()->create();
        $this->save($this->client(), $p);
        StoreSettings::put(['checkout_reminders_enabled' => false]);
        $this->travel(1)->hours();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        Notification::assertSentOnDemandTimes(CheckoutReminder::class, 0);

        $this->travel(31)->days();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->assertSame([null, null], [CheckoutRecovery::sole()->email, CheckoutRecovery::sole()->first_name]);
    }

    public function test_a_whatsapp_reminder_waits_for_a_provider_and_then_goes_once(): void
    {
        $this->enable(15);
        $p = Product::factory()->create();
        $this->save($this->client(), $p, ['channel' => 'whatsapp', 'email' => null, 'phone' => '03 123 456']);
        $this->assertSame('+9613123456', CheckoutRecovery::sole()->phone);

        $this->travel(1)->hours();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->assertSame([0, 0], [CheckoutRecovery::sole()->reminders_sent, OutboundMessage::count()], 'no provider: nothing sent, nothing marked sent');

        $fake = FakeMessenger::install(['whatsapp']);
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->artisan('dmd:checkout-reminders')->assertSuccessful();
        $this->assertCount(1, $fake->sent);
        $this->assertSame(['+9613123456', 'checkout_reminder', 'sent'], [$fake->sent[0]['to'], OutboundMessage::sole()->purpose, OutboundMessage::sole()->status]);
    }

    public function test_only_the_owner_sees_abandoned_checkouts(): void
    {
        $this->client()->get('/api/v1/admin/checkout-recoveries')->assertUnauthorized();
        $this->buyer()->get('/api/v1/admin/checkout-recoveries')->assertUnauthorized();
    }
}
