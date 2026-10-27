<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A product can have its own delivery price (a TV costs more to bring than a game). Empty means the store's delivery
 * price from Settings. An order is delivered once, so it pays the highest delivery price among its products.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('delivery_fee', 8, 2)->nullable()->after('sale_ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('delivery_fee');
        });
    }
};
