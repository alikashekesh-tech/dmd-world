<?php

namespace Tests\Feature\Community;

use App\Models\OutboundMessage;
use App\Models\StockAlert;
use App\Notifications\BackInStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Fakes\FakeMessenger;
use Tests\SpaClient;
use Tests\TestCase;

/**
 * "Notify me when it's available" from the product page: guests and buyers, by email or phone, for a product or one
 * variant of it, with consent. Nobody is told twice, a withdrawn request is never sent, and a phone request is only
 * sent through a configured provider; without one it waits for the owner, who sees the contact and answers by hand.
 */
class BackInStockRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** A chair sold in two colours, both sold out. */
    private function chair(SpaClient $owner): array
    {
        $p = $owner->post('/api/v1/admin/products', [
            'name' => 'Megavolt Gaming Chair', 'status' => 'published', 'type' => 'variable',
            'attributes' => [['name' => 'Colour', 'values' => ['Black', 'White']]],
            'variants' => [
                ['options' => ['Colour' => 'Black'], 'sku' => 'MV-BK', 'regular_price' => 150, 'stock_quantity' => 0],
                ['options' => ['Colour' => 'White'], 'sku' => 'MV-WH', 'regular_price' => 165, 'stock_quantity' => 0],
            ],
        ])->assertCreated()->json('data');
        $ids = collect($p['variants'])->mapWithKeys(fn ($v) => [$v['options']['Colour'] => $v['id']]);

        return [$p['id'], $ids['Black'], $ids['White']];
    }

    public function test_a_guest_asks_for_one_colour_and_is_emailed_once_only_when_that_colour_returns(): void
    {
        $owner = $this->owner();
        [$product, $black, $white] = $this->chair($owner);
        $guest = $this->client();

        $res = $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'email', 'email' => ' Lina@Example.com ', 'phone' => null, 'consent' => true])
            ->assertCreated()->assertJsonPath('data.variant_id', $white)->assertJsonPath('data.channel', 'email');
        $this->assertSame(40, strlen($res->json('data.token')));
        $this->assertSame(['token', 'product_id', 'variant_id', 'channel', 'created_at'], array_keys($res->json('data')), 'nothing but the request itself comes back');
        // The same request again is the same request, not a second email later.
        $this->assertSame($res->json('data.token'), $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'email', 'email' => 'lina@example.com', 'consent' => true])->json('data.token'));
        $this->assertSame(1, StockAlert::count());

        $owner->put("/api/v1/admin/inventory/variants/{$black}", ['stock_quantity' => 3])->assertOk();
        Notification::assertNothingSent(); // another colour coming back isn't what she asked for

        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['stock_quantity' => 2])->assertOk();
        Notification::assertSentOnDemand(BackInStock::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'lina@example.com' && $n->variant?->id === $white);
        Notification::assertCount(1);

        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['adjust' => 1])->assertOk();
        $this->artisan('dmd:stock-alerts')->assertSuccessful();
        Notification::assertCount(1);
    }

    public function test_a_request_needs_consent_a_contact_and_a_sold_out_choice(): void
    {
        $owner = $this->owner();
        [$product, $black] = $this->chair($owner);
        $guest = $this->client();

        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'channel' => 'email', 'email' => 'a@example.com'])->assertStatus(422)->assertJsonValidationErrors('consent', 'error.fields');
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'channel' => 'email', 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('email', 'error.fields');
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'channel' => 'whatsapp', 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('phone', 'error.fields');
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'channel' => 'whatsapp', 'phone' => 'call me', 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('phone', 'error.fields');
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'channel' => 'pigeon', 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('channel', 'error.fields');
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => 999999, 'channel' => 'email', 'email' => 'a@example.com', 'consent' => true])->assertNotFound();

        $owner->put("/api/v1/admin/inventory/variants/{$black}", ['stock_quantity' => 3])->assertOk();
        $guest->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $black, 'channel' => 'email', 'email' => 'a@example.com', 'consent' => true])
            ->assertStatus(409)->assertJsonPath('error.code', 'IN_STOCK');
        $this->assertSame(0, StockAlert::count());
    }

    public function test_a_whatsapp_request_waits_for_the_owner_while_no_provider_is_set_up(): void
    {
        $owner = $this->owner();
        [$product, , $white] = $this->chair($owner);
        $this->client()->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'whatsapp', 'phone' => '70 903 901', 'consent' => true])->assertCreated();
        $this->assertSame('+96170903901', StockAlert::sole()->phone, 'a Lebanese number without its code is stored in international form');

        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['stock_quantity' => 2])->assertOk();
        $this->assertNull(StockAlert::sole()->notified_at, 'nothing could be sent, so nothing is marked as sent');
        $this->assertSame(0, OutboundMessage::count());

        $list = $owner->get('/api/v1/admin/stock-alerts/requests')->assertOk();
        $row = $list->json('data.0');
        $this->assertSame(['whatsapp', '+96170903901', 'White', true], [$row['channel'], $row['contact'], $row['variant']['label'], $row['available_now']]);
        $this->assertStringStartsWith('https://wa.me/96170903901?text=', $row['whatsapp_url']);
        $this->assertFalse($list->json('meta.automatic.whatsapp'));

        $owner->post("/api/v1/admin/stock-alerts/{$row['id']}/contacted")->assertOk()->assertJsonPath('data.notified_by', 'admin');
        $this->assertSame([], $owner->get('/api/v1/admin/stock-alerts/requests')->json('data'));
        $this->assertCount(1, $owner->get('/api/v1/admin/stock-alerts/requests?status=notified')->json('data'));

        // Only the owner sees who asked.
        $this->client()->get('/api/v1/admin/stock-alerts/requests')->assertUnauthorized();
        $this->buyer()->get('/api/v1/admin/stock-alerts/requests')->assertUnauthorized();
    }

    public function test_with_a_provider_set_up_the_text_goes_once_and_its_outcome_is_recorded(): void
    {
        $fake = FakeMessenger::install(['whatsapp']);
        $owner = $this->owner();
        [$product, , $white] = $this->chair($owner);
        $this->client()->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'whatsapp', 'phone' => '+44 7700 900123', 'consent' => true])->assertCreated();

        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['stock_quantity' => 2])->assertOk();
        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['adjust' => 2])->assertOk();
        $this->artisan('dmd:stock-alerts')->assertSuccessful();

        $this->assertCount(1, $fake->sent);
        $this->assertSame(['whatsapp', '+447700900123'], [$fake->sent[0]['channel'], $fake->sent[0]['to']]);
        $this->assertStringContainsString('Megavolt Gaming Chair (White) is back in stock', $fake->sent[0]['text']);
        $this->assertSame(['sent', 'back_in_stock'], [OutboundMessage::sole()->status, OutboundMessage::sole()->purpose]);
        $this->assertSame('system', StockAlert::sole()->notified_by);
    }

    public function test_a_failed_text_is_recorded_and_tried_again_later(): void
    {
        FakeMessenger::install(['sms'], failing: true);
        $owner = $this->owner();
        [$product, , $white] = $this->chair($owner);
        $this->client()->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'sms', 'phone' => '+961 3 123 456', 'consent' => true])->assertCreated();

        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['stock_quantity' => 2])->assertOk();
        // Tried (perhaps by both the variant and the product coming back), recorded as failed, never as sent.
        $this->assertSame(['failed'], OutboundMessage::distinct()->pluck('status')->all());
        $this->assertNull(StockAlert::sole()->notified_at);

        $fake = FakeMessenger::install(['sms']);
        $this->artisan('dmd:stock-alerts')->assertSuccessful();
        $this->assertCount(1, $fake->sent);
        $this->assertNotNull(StockAlert::sole()->notified_at);
    }

    public function test_a_withdrawn_request_is_never_sent(): void
    {
        $owner = $this->owner();
        [$product, , $white] = $this->chair($owner);
        $token = $this->client()->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'email', 'email' => 'sami@example.com', 'consent' => true])->json('data.token');

        $this->client()->delete("/api/v1/stock-alerts/{$token}")->assertNoContent();
        $this->client()->delete('/api/v1/stock-alerts/'.str_repeat('a', 40))->assertNotFound();
        $owner->put("/api/v1/admin/inventory/variants/{$white}", ['stock_quantity' => 2])->assertOk();
        Notification::assertNothingSent();
        $this->assertSame([], $owner->get('/api/v1/admin/stock-alerts/requests')->json('data'));
    }

    public function test_a_signed_in_buyer_keeps_one_request_per_choice_and_sees_it_in_their_account(): void
    {
        $owner = $this->owner();
        [$product, $black, $white] = $this->chair($owner);
        $buyer = $this->buyer();

        $buyer->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'email', 'consent' => true])->assertCreated();
        $buyer->post('/api/v1/stock-alerts', ['product_id' => $product, 'variant_id' => $white, 'channel' => 'whatsapp', 'phone' => '+961 70 111 222', 'consent' => true])->assertCreated();
        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => $product, 'variant_id' => $black])->assertCreated();
        $this->assertSame(2, StockAlert::count(), 'a new channel replaces their request for the same colour');

        $mine = collect($buyer->get('/api/v1/account/stock-alerts')->json('data'))->sortBy('variant_id')->values();
        $this->assertSame([[$black, 'email'], [$white, 'whatsapp']], $mine->map(fn ($a) => [$a['variant_id'], $a['channel']])->all());

        $buyer->delete("/api/v1/account/stock-alerts/{$product}?variant_id={$black}")->assertNoContent();
        $this->assertSame([$white], array_column($buyer->get('/api/v1/account/stock-alerts')->json('data'), 'variant_id'));
    }
}
