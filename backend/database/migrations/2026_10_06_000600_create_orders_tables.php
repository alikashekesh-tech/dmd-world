<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An order is a record of what happened: who bought what, at which prices, delivered where. Everything the
        // order needs is copied in (contact, address, product names and prices), so later edits to an account,
        // an address or a product never change an order that was already placed.
        // Imported orders keep their old ids (and numbers); new ones start at 1,000,000.
        Schema::create('orders', function (Blueprint $table) {
            $table->id()->from(1000000);
            $table->string('number', 20)->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // null: a guest checkout
            $table->string('status', 20)->default('pending');
            $table->char('currency', 3)->default('USD');
            $table->decimal('subtotal', 10, 2);
            $table->decimal('discount_total', 10, 2)->default(0);
            $table->decimal('shipping_total', 10, 2)->default(0);
            $table->decimal('total', 10, 2);
            $table->string('payment_method', 20)->default('cod'); // cod | bank_transfer
            $table->string('payment_status', 20)->default('unpaid'); // unpaid | paid | refunded
            $table->string('delivery_method', 20)->default('delivery'); // delivery | pickup
            $table->string('first_name', 60);
            $table->string('last_name', 60);
            $table->string('email');
            $table->string('phone', 30);
            $table->char('ship_country', 2)->nullable();
            $table->string('ship_city', 80)->nullable();
            $table->string('ship_area', 80)->nullable();
            $table->string('ship_street', 160)->nullable();
            $table->string('ship_building', 80)->nullable();
            $table->string('ship_floor', 20)->nullable();
            $table->string('ship_notes', 300)->nullable();
            $table->text('customer_note')->nullable();
            $table->string('coupon_code', 60)->nullable();
            // A guest opens their order with a private token; only its hash is stored.
            $table->char('guest_token_hash', 64)->nullable()->unique();
            // "Place order" sent twice (double tap, dropped connection) finds the first order instead of making another.
            $table->char('idempotency_hash', 64)->nullable()->unique();
            $table->timestamp('placed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 300)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'placed_at']);
            $table->index(['status', 'placed_at']);
            $table->index('email');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_status_valid CHECK (status IN ('pending', 'processing', 'on_hold', 'completed', 'cancelled', 'refunded', 'failed'))");
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_valid CHECK (payment_status IN ('unpaid', 'paid', 'refunded'))");
            DB::statement('ALTER TABLE orders ADD CONSTRAINT orders_money_valid CHECK (subtotal >= 0 AND discount_total >= 0 AND shipping_total >= 0 AND total >= 0 AND total = subtotal - discount_total + shipping_total)');
        }

        // The lines of an order, with the product's name, SKU, image and prices as they were when it was bought.
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name', 200);
            $table->string('sku', 64)->nullable();
            $table->string('image_url', 2048)->nullable();
            $table->decimal('unit_price', 10, 2);
            $table->decimal('regular_price', 10, 2);
            $table->unsignedInteger('quantity');
            $table->decimal('line_subtotal', 10, 2);
            $table->decimal('line_discount', 10, 2)->default(0);
            $table->decimal('line_total', 10, 2);
            $table->index('product_id');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0)');
        }

        // Every status change (and the owner's private notes on the order), who made it and when.
        Schema::create('order_status_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20)->nullable();
            $table->string('actor', 10); // buyer | admin | system
            $table->foreignId('admin_id')->nullable()->constrained('admins')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['order_id', 'created_at']);
        });

        // Stock movements caused by an order now point at it.
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropForeign(['order_id']);
        });
        Schema::dropIfExists('order_status_history');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
