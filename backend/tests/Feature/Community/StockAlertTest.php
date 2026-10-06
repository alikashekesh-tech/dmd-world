<?php

namespace Tests\Feature\Community;

use App\Models\Product;
use App\Models\StockAlert;
use App\Models\User;
use App\Notifications\BackInStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Back-in-stock alerts: a buyer follows a sold-out product and gets one email when it can be bought again. */
class StockAlertTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_waiting_buyers_get_one_email_when_the_owner_restocks(): void
    {
        $p = Product::factory()->stock(0)->create();
        [$rana, $karim] = User::factory()->count(2)->create();
        $this->buyer($rana)->post('/api/v1/account/stock-alerts', ['product_id' => $p->id])->assertCreated()->assertJsonPath('data.0.product_id', $p->id);
        $this->buyer($karim)->post('/api/v1/account/stock-alerts', ['product_id' => $p->id])->assertCreated();
        $owner = $this->owner();

        $this->assertSame([['product_id' => $p->id, 'name' => $p->name, 'waiting' => 2]], collect($owner->get('/api/v1/admin/stock-alerts')->json('data'))->map(fn ($r) => Arr::only($r, ['product_id', 'name', 'waiting']))->all());

        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => 5])->assertOk();
        Notification::assertSentTo([$rana, $karim], BackInStock::class, fn ($n) => $n->product->is($p));
        Notification::assertCount(2);
        $this->assertSame(0, StockAlert::whereNull('notified_at')->count());
        $this->assertSame([], $owner->get('/api/v1/admin/stock-alerts')->json('data'));

        // More stock, or selling out and coming back, doesn't email the same people again unless they ask.
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['adjust' => 3, 'reason' => 'restock'])->assertOk();
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => 0])->assertOk();
        $owner->put("/api/v1/admin/inventory/{$p->id}", ['stock_quantity' => 2])->assertOk();
        Notification::assertCount(2);

        // The account shows when the email went.
        $this->assertNotNull($this->buyer($rana)->get('/api/v1/account/stock-alerts')->json('data.0.notified_at'));
    }

    public function test_a_cancelled_order_that_returns_the_last_unit_emails_the_waiting_buyer(): void
    {
        $p = Product::factory()->stock(1)->create();
        $guest = $this->client();
        $order = $guest->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $p->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod',
        ])->assertCreated()->json();
        $this->assertSame(0, $p->fresh()->stock_quantity);

        $waiting = User::factory()->create();
        $this->buyer($waiting)->post('/api/v1/account/stock-alerts', ['product_id' => $p->id])->assertCreated();
        Notification::assertNothingSentTo($waiting);

        $guest->post("/api/v1/orders/{$order['data']['id']}/cancel", ['token' => $order['meta']['guest_token']])->assertOk();
        Notification::assertSentTo($waiting, BackInStock::class);
    }

    public function test_a_buyer_follows_only_sold_out_published_products_and_manages_their_own_list(): void
    {
        $out = Product::factory()->stock(0)->create();
        $buyer = $this->buyer();
        $other = $this->buyer();

        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => Product::factory()->create()->id])->assertStatus(409)->assertJsonPath('error.code', 'IN_STOCK');
        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => Product::factory()->draft()->stock(0)->create()->id])->assertNotFound();
        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => 987654321])->assertNotFound();
        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => $out->id])->assertCreated();
        $buyer->post('/api/v1/account/stock-alerts', ['product_id' => $out->id])->assertCreated(); // twice is harmless
        $this->assertSame(1, StockAlert::count());

        $this->assertSame([], $other->get('/api/v1/account/stock-alerts')->json('data'));
        $other->delete("/api/v1/account/stock-alerts/{$out->id}")->assertNoContent(); // only removes Bob's own (none)
        $this->assertSame(1, StockAlert::count());
        $buyer->delete("/api/v1/account/stock-alerts/{$out->id}")->assertNoContent();
        $this->assertSame(0, StockAlert::count());
        $this->client()->get('/api/v1/account/stock-alerts')->assertUnauthorized();
    }

    public function test_publishing_a_product_or_untracked_stock_coming_back_also_counts(): void
    {
        $p = Product::factory()->create(['track_stock' => false, 'stock_status' => 'out_of_stock']);
        $buyer = User::factory()->create();
        $this->buyer($buyer)->post('/api/v1/account/stock-alerts', ['product_id' => $p->id])->assertCreated();

        $this->owner()->put("/api/v1/admin/inventory/{$p->id}", ['stock_status' => 'in_stock'])->assertOk();
        Notification::assertSentTo($buyer, BackInStock::class);
    }

    public function test_the_scheduled_run_sends_what_is_still_waiting(): void
    {
        $p = Product::factory()->stock(0)->create();
        $buyer = User::factory()->create();
        $this->buyer($buyer)->post('/api/v1/account/stock-alerts', ['product_id' => $p->id])->assertCreated();
        // Stock that arrived without going through a save (e.g. a direct database fix): the scheduled run catches it.
        Product::whereKey($p->id)->update(['stock_quantity' => 4]);
        (new StockAlert)->forceFill(['user_id' => User::factory()->create()->id, 'product_id' => $p->id, 'notified_at' => now()->subDays(100)])->save();

        $this->artisan('dmd:stock-alerts')->expectsOutputToContain('Sent 1 back-in-stock email(s); pruned 1 old alert(s).')->assertSuccessful();
        Notification::assertSentTo($buyer, BackInStock::class);
        $this->artisan('dmd:stock-alerts')->expectsOutputToContain('Sent 0')->assertSuccessful();
    }
}
