<?php

namespace Tests\Feature\Import;

use App\Models\Order;
use App\Models\Product;
use App\Services\Inventory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** dmd:verify-import: every record of the old store is checked against MySQL before the old store is switched off. */
class VerifyImportTest extends TestCase
{
    use FakesOldStore, RefreshDatabase;

    private function verify()
    {
        $this->fakeOldStore();

        return $this->artisan('dmd:verify-import');
    }

    public function test_a_complete_import_verifies_and_a_missing_record_fails(): void
    {
        $this->importOldStore();
        $this->verify()->expectsOutputToContain('Every record of the old store is in MySQL.')->assertSuccessful();

        $order = Order::query()->orderBy('id')->first();
        $order->items()->delete();
        $order->history()->delete();
        $order->delete();
        $this->verify()->expectsOutputToContain("order {$order->id}")->assertFailed();
    }

    public function test_changes_made_in_the_new_system_since_are_not_mismatches(): void
    {
        $this->importOldStore();
        $p = Product::query()->where('track_stock', true)->where('stock_quantity', '>', 0)->firstOrFail();
        app(Inventory::class)->adjust($p, -1, 'order'); // sold in the new shop after the import

        $this->verify()->expectsOutputToContain('Every record of the old store is in MySQL.')->assertSuccessful();
    }
}
