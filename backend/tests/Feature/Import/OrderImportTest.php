<?php

namespace Tests\Feature\Import;

use App\Models\Address;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/** The old store's customers and orders (fixtures: the emulator's customers and 76 orders of every status). */
class OrderImportTest extends TestCase
{
    use RefreshDatabase;

    private array $orders;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dmd.import.woocommerce' => ['url' => 'https://old-store.test', 'key' => 'ck_test', 'secret' => 'cs_test']]);
        $this->orders = $this->fixture('orders');
    }

    private function fixture(string $name): array
    {
        return json_decode(file_get_contents(base_path("tests/Fixtures/woocommerce/{$name}.json")), true);
    }

    private function import(): void
    {
        Http::swap(new Factory(app('events')));
        Http::fake([
            'old-store.test/wp-json/wc/v3/products/categories*' => Http::response($this->fixture('categories'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/products/reviews*' => Http::response([], 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/products*' => Http::response($this->fixture('products'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/customers*' => Http::response($this->fixture('customers'), 200, ['X-WP-TotalPages' => '1']),
            'old-store.test/wp-json/wc/v3/orders/*/notes*' => Http::response([]),
            'old-store.test/wp-json/wc/v3/orders*' => Http::response($this->orders, 200, ['X-WP-TotalPages' => '1']),
        ]);
        $this->artisan('dmd:import')->assertSuccessful();
    }

    public function test_customers_and_orders_arrive_with_their_ids_and_history(): void
    {
        $this->import();
        $stockMovements = InventoryMovement::where('reason', '!=', 'import')->count();

        $this->assertSame(71, User::count());
        $this->assertTrue(User::all()->every(fn (User $u) => $u->password === null), 'old passwords can’t be read: buyers choose one by reset');
        $this->assertGreaterThan(0, Address::where('is_default', true)->count());

        $this->assertSame(76, Order::count());
        $w = $this->orders[0];
        $o = Order::find($w['id']);
        $this->assertSame([(string) $w['number'], $w['status'] === 'on-hold' ? 'on_hold' : $w['status']], [$o->number, $o->status]);
        $this->assertSame(Money::cents($w['total']), Money::cents($o->total));
        $this->assertSame(count($w['line_items']), $o->items()->count());
        $this->assertSame($w['line_items'][0]['name'], $o->items()->first()->product_name);

        $guest = collect($this->orders)->first(fn ($x) => ! $x['customer_id']);
        $this->assertNull(Order::find($guest['id'])->user_id);
        $registered = collect($this->orders)->first(fn ($x) => $x['customer_id']);
        $this->assertSame($registered['customer_id'], Order::find($registered['id'])->user_id);
        $bacs = collect($this->orders)->first(fn ($x) => $x['payment_method'] === 'bacs');
        $this->assertSame('bank_transfer', Order::find($bacs['id'])->payment_method);

        $this->assertSame($stockMovements, InventoryMovement::where('reason', '!=', 'import')->count(), 'old orders don’t touch today’s stock');
        $this->assertTrue(Order::all()->every(fn (Order $x) => Money::cents($x->total) === Money::cents($x->subtotal) - Money::cents($x->discount_total) + Money::cents($x->shipping_total)));
    }

    public function test_an_imported_customer_resets_their_password_and_sees_their_old_orders(): void
    {
        Notification::fake();
        $this->import();
        $w = collect($this->orders)->first(fn ($x) => $x['customer_id']);
        $user = User::find($w['customer_id']);

        $this->client()->post('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });
        $browser = $this->client();
        $browser->post('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'Fresh-Start-1!', 'password_confirmation' => 'Fresh-Start-1!'])->assertOk();

        $mine = array_column($browser->get('/api/v1/orders?page=1')->json('data'), 'id');
        $this->assertContains($w['id'], $mine);
        $this->assertSame(Order::where('user_id', $user->id)->count(), $browser->get('/api/v1/orders')->json('meta.total'));
    }

    public function test_importing_again_updates_instead_of_duplicating(): void
    {
        $this->import();
        $counts = [User::count(), Order::count(), OrderItem::count(), Address::count()];

        $this->orders[0]['status'] = 'refunded';
        $this->import();

        $this->assertSame($counts, [User::count(), Order::count(), OrderItem::count(), Address::count()]);
        $this->assertSame(['refunded', 'refunded'], [Order::find($this->orders[0]['id'])->status, Order::find($this->orders[0]['id'])->payment_status]);
    }

    public function test_paid_imported_orders_count_as_sales(): void
    {
        $this->import();
        $sold = OrderItem::whereHas('order', fn ($q) => $q->whereIn('status', Order::PAID))->whereNotNull('product_id')->selectRaw('product_id, sum(quantity) as n')->groupBy('product_id')->orderByDesc('n')->first();

        $catalog = collect($this->client()->get('/api/v1/catalog')->json('products'))->firstWhere('id', $sold->product_id);
        $this->assertSame((int) $sold->n, $catalog['units_sold']);
        $this->assertTrue(Product::whereKey($sold->product_id)->exists());
    }
}
