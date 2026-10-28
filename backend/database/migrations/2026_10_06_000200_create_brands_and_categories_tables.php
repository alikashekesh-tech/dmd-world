<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Who makes a product (Razer, HyperX…). Archiving (soft delete) hides a brand without losing it.
        // Ids: records imported from the old store keep their WooCommerce ids (URLs, carts and saved lists use them);
        // records created here start at 100000, so the two ranges never collide.
        Schema::create('brands', function (Blueprint $table) {
            $table->id()->from(100000);
            $table->string('name', 80);
            $table->string('slug', 80)->unique();
            $table->text('description')->nullable();
            $table->string('logo_url', 2048)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['is_active', 'position']);
        });

        // What a product is, as a tree (PlayStation › PS5 › Games › Used). A category may belong to a brand: that is
        // one of the brand's product lines (Razer › Mouse), listed on the brand's page.
        Schema::create('categories', function (Blueprint $table) {
            $table->id()->from(100000);
            $table->foreignId('parent_id')->nullable()->constrained('categories')->restrictOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->restrictOnDelete();
            $table->string('name', 80);
            $table->string('slug', 80);
            $table->text('description')->nullable();
            $table->string('image_url', 2048)->nullable();
            // Presentation hints for the storefront's artwork (which illustration, which accent colour).
            $table->string('icon', 40)->nullable();
            $table->char('accent_color', 7)->nullable();
            $table->boolean('is_visible')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            // Siblings (same parent, same brand) can't share a slug, so every storefront URL points at one category.
            // MySQL treats NULLs as distinct in unique indexes, hence the stored keys.
            $table->unsignedBigInteger('parent_key')->storedAs('IFNULL(parent_id, 0)');
            $table->unsignedBigInteger('brand_key')->storedAs('IFNULL(brand_id, 0)');
            $table->unique(['parent_key', 'brand_key', 'slug'], 'categories_sibling_slug_unique');
            $table->index(['parent_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
        Schema::dropIfExists('brands');
    }
};
