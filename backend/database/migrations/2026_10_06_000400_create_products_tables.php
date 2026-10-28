<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per product: the single source for its name, prices, stock and status everywhere it appears.
        // Imported products keep their WooCommerce ids (storefront URLs /product/<id>, saved carts and wishlists);
        // products created here start at 1,000,000.
        Schema::create('products', function (Blueprint $table) {
            $table->id()->from(1000000);
            $table->foreignId('brand_id')->nullable()->constrained('brands')->restrictOnDelete();
            $table->string('name', 200);
            $table->string('slug', 220)->unique();
            $table->string('sku', 64)->nullable()->unique();
            $table->text('short_description')->nullable();
            $table->mediumText('description')->nullable();
            // Money is DECIMAL, never floating point. The sale price is the product's own reduction (with optional
            // dates); store-wide offers are separate records applied when prices are calculated.
            $table->decimal('regular_price', 10, 2);
            $table->decimal('sale_price', 10, 2)->nullable();
            $table->timestamp('sale_starts_at')->nullable();
            $table->timestamp('sale_ends_at')->nullable();
            $table->string('status', 20)->default('draft'); // draft | published (archived = soft deleted)
            $table->boolean('is_featured')->default(false);
            // Inventory: when tracked, stock_quantity is the one authoritative number (availability follows from it);
            // when not tracked, stock_status says whether it can be bought.
            $table->boolean('track_stock')->default(true);
            $table->unsignedInteger('stock_quantity')->default(0);
            $table->unsignedSmallInteger('low_stock_threshold')->nullable(); // null: the store default
            $table->string('stock_status', 20)->default('in_stock'); // in_stock | out_of_stock (untracked only)
            $table->decimal('weight_kg', 8, 3)->nullable();
            $table->decimal('length_cm', 8, 2)->nullable();
            $table->decimal('width_cm', 8, 2)->nullable();
            $table->decimal('height_cm', 8, 2)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'deleted_at', 'published_at']);
            $table->index(['is_featured', 'status']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE products ADD CONSTRAINT products_sale_below_regular CHECK (sale_price IS NULL OR sale_price < regular_price)');
            DB::statement('ALTER TABLE products ADD CONSTRAINT products_price_positive CHECK (regular_price > 0 AND (sale_price IS NULL OR sale_price >= 0))');
            DB::statement("ALTER TABLE products ADD CONSTRAINT products_status_valid CHECK (status IN ('draft', 'published'))");
            DB::statement("ALTER TABLE products ADD CONSTRAINT products_stock_status_valid CHECK (stock_status IN ('in_stock', 'out_of_stock'))");
        }

        // A product can sit in several categories (e.g. "PS4 › Games › New" and "New Offers"); one is its primary
        // category (breadcrumbs, "type" filter).
        Schema::create('category_product', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->primary(['product_id', 'category_id']);
            $table->index('category_id');
        });

        // Ordered images; the first one (position 0) is the product's main image.
        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('url', 2048);
            $table->string('alt', 200)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->index(['product_id', 'position']);
        });

        // Specification rows ("Connectivity: Wireless"): real rows, one name per product.
        Schema::create('product_specifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('value', 500);
            $table->unsignedSmallInteger('position')->default(0);
            $table->unique(['product_id', 'name']);
        });

        // Every change to a tracked product's stock, with the result: an audit trail for the one stock number.
        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity_change');
            $table->unsignedInteger('quantity_after');
            $table->string('reason', 20); // adjustment | restock | order | cancellation | import
            $table->unsignedBigInteger('order_id')->nullable(); // linked to orders in Phase 7
            $table->foreignId('admin_id')->nullable()->constrained('admins')->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('product_specifications');
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('category_product');
        Schema::dropIfExists('products');
    }
};
