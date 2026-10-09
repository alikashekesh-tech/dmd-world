<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Product variations. A product is either simple (one price, one stock count: every product so far) or variable: it
 * has attributes (Colour: Black, White; Size: S, M) and one variant per combination it is sold in, each with its own
 * SKU, price, sale price, stock and on/off switch. A variable product's own row keeps a summary of its variants (the
 * lowest price, the total stock) so listings, sorting, filters and stock alerts keep working unchanged; the variants
 * are what the cart, checkout and orders use. Additive only: existing products become "simple" and keep everything.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('type', 10)->default('simple')->after('sku'); // simple | variable
            // The attributes a variable product is sold in, in display order: [{"name": "Colour", "values": ["Black", "White"]}].
            $table->json('variation_attributes')->nullable()->after('type');
        });

        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('sku', 64)->nullable()->unique();
            $table->json('options'); // {"Colour": "Black", "Size": "M"}: one value for each of the product's attributes
            // The combination in a canonical form (sha1 of the lowercased, sorted options), so the same combination
            // can't be sold twice. Unique among live variants only: a removed variant keeps its row (orders and stock
            // history point at it) without blocking that combination from being added again.
            $table->char('options_key', 40);
            $table->char('live_options_key', 40)->nullable()->storedAs('IF(deleted_at IS NULL, options_key, NULL)');
            $table->decimal('regular_price', 10, 2);
            $table->decimal('sale_price', 10, 2)->nullable();
            // Stock works as for a simple product: when tracked, stock_quantity is the one authoritative number and only
            // changes through Inventory (with a stock history line); when not, stock_status says if it can be bought.
            $table->boolean('track_stock')->default(true);
            $table->unsignedInteger('stock_quantity')->default(0);
            $table->string('stock_status', 20)->default('in_stock');
            $table->boolean('is_active')->default(true); // switched off: shown as unavailable, can't be bought
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['product_id', 'live_options_key']);
            $table->index(['product_id', 'deleted_at', 'position']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE products ADD CONSTRAINT products_type_valid CHECK (type IN ('simple', 'variable'))");
            DB::statement('ALTER TABLE product_variants ADD CONSTRAINT product_variants_sale_below_regular CHECK (sale_price IS NULL OR sale_price < regular_price)');
            DB::statement('ALTER TABLE product_variants ADD CONSTRAINT product_variants_price_positive CHECK (regular_price > 0 AND (sale_price IS NULL OR sale_price >= 0))');
            DB::statement("ALTER TABLE product_variants ADD CONSTRAINT product_variants_stock_status_valid CHECK (stock_status IN ('in_stock', 'out_of_stock'))");
        }

        // An order line keeps the variant it was for, and a copy of its options as they were sold ("Colour: Black").
        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('variant_id')->nullable()->after('product_id')->constrained('product_variants')->nullOnDelete();
            $table->json('variant_options')->nullable()->after('sku'); // [{"name": "Colour", "value": "Black"}]
        });

        // A variant's stock changes are recorded like a product's, with the variant they were for.
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->foreignId('variant_id')->nullable()->after('product_id')->constrained('product_variants')->nullOnDelete();
            $table->index(['variant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('variant_id');
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('variant_id');
            $table->dropColumn('variant_options');
        });
        Schema::dropIfExists('product_variants');
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE products DROP CHECK products_type_valid');
        }
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['type', 'variation_attributes']);
        });
    }
};
