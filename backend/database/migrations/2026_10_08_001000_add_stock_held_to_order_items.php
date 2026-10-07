<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * order_items.stock_held: how many units of this line are currently taken out of stock for the order. Placing (or
 * reopening) an order sets it; cancelling or refunding returns exactly that many and sets it to 0. So stock is only
 * ever returned for units really taken, and never twice, whatever the order's path through its statuses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedInteger('stock_held')->default(0)->after('quantity');
        });
        $this->backfill();
    }

    /** What existing order lines hold today (public so the test can check it on its own data). */
    public function backfill(): void
    {

        // Orders placed in this store (they have an idempotency key): what the stock ledger says each line still holds
        // (taken at the order or a reopening, minus what cancellations returned). One line per product per order.
        DB::statement('
            UPDATE order_items oi
            JOIN orders o ON o.id = oi.order_id AND o.idempotency_hash IS NOT NULL
            JOIN (SELECT order_id, product_id, -SUM(quantity_change) AS held FROM inventory_movements
                  WHERE order_id IS NOT NULL GROUP BY order_id, product_id) m ON m.order_id = oi.order_id AND m.product_id = oi.product_id
            SET oi.stock_held = GREATEST(0, LEAST(oi.quantity, m.held))
        ');

        // Orders imported from WooCommerce left no ledger lines here. WooCommerce takes stock once an order is processing,
        // on hold or completed (and returns it on cancel), and the imported stock counts already reflect that.
        DB::statement("
            UPDATE order_items oi
            JOIN orders o ON o.id = oi.order_id AND o.idempotency_hash IS NULL AND o.status IN ('processing', 'on_hold', 'completed')
            JOIN products p ON p.id = oi.product_id AND p.track_stock = 1
            SET oi.stock_held = oi.quantity
        ");
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('stock_held');
        });
    }
};
