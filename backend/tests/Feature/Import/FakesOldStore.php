<?php

namespace Tests\Feature\Import;

use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * A fake old WooCommerce store answering every endpoint the import reads, from the fixtures (emulator data).
 * Any request it doesn't know fails the test instead of leaving the machine.
 */
trait FakesOldStore
{
    protected function fixture(string $name): array
    {
        return json_decode(file_get_contents(base_path("tests/Fixtures/woocommerce/{$name}.json")), true);
    }

    /** @param array<string, array> $data fixture name → data to serve instead (e.g. edited orders) */
    protected function fakeOldStore(array $data = []): void
    {
        config(['dmd.import.woocommerce' => ['url' => 'https://old-store.test', 'key' => 'ck_test', 'secret' => 'cs_test']]);
        $get = fn (string $name) => $data[$name] ?? $this->fixture($name);
        $list = fn (string $name) => Http::response($get($name), 200, ['X-WP-TotalPages' => '1']);
        $settings = $get('settings');
        $coupons = collect($get('coupons'));
        $notes = $get('order-notes');

        Http::swap(new Factory(app('events')));
        Http::preventStrayRequests();
        $base = 'old-store.test/wp-json/wc/v3/';
        Http::fake([
            $base.'products/categories*' => $list('categories'),
            $base.'products/reviews*' => $list('reviews'),
            $base.'products*' => $list('products'),
            $base.'customers*' => $list('customers'),
            $base.'orders/*/notes*' => fn (Request $r) => Http::response($notes[Str::between($r->url(), '/orders/', '/notes')] ?? []),
            $base.'orders*' => $list('orders'),
            $base.'coupons*' => fn (Request $r) => Http::response(str_contains($r->url(), 'status=trash')
                ? $coupons->where('status', 'trash')->values()->all()
                : $coupons->where('status', '!=', 'trash')->values()->all(), 200, ['X-WP-TotalPages' => '1']),
            $base.'settings/*' => fn (Request $r) => Http::response($settings[Str::afterLast(Str::before($r->url(), '?'), '/')] ?? [], 200),
        ]);
    }

    protected function importOldStore(array $data = [], array $only = []): void
    {
        $this->fakeOldStore($data);
        $this->artisan('dmd:import', $only ? ['--only' => $only] : [])->assertSuccessful();
    }
}
