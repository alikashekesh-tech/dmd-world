<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A buyer's saved delivery addresses (fields that fit Lebanese addresses: area, building, floor).
        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 40)->nullable(); // "Home", "Work"
            $table->string('first_name', 60);
            $table->string('last_name', 60);
            $table->string('phone', 30);
            $table->char('country', 2)->default('LB');
            $table->string('city', 80);
            $table->string('area', 80)->nullable();
            $table->string('street', 160);
            $table->string('building', 80)->nullable();
            $table->string('floor', 20)->nullable();
            $table->string('notes', 300)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            // At most one default address per buyer, enforced by MySQL: this column holds the buyer's id only on
            // the default row (NULL elsewhere), and a unique index allows any number of NULLs.
            $table->unsignedBigInteger('default_for')->nullable()->virtualAs('IF(is_default, user_id, NULL)');
            $table->unique('default_for', 'addresses_one_default_per_user');
            $table->index(['user_id', 'is_default']);
        });

        // A buyer's saved products: one row per buyer and product (the primary key makes a duplicate impossible).
        Schema::create('wishlist_items', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->primary(['user_id', 'product_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wishlist_items');
        Schema::dropIfExists('addresses');
    }
};
