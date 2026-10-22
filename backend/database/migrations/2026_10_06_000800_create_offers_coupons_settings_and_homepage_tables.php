<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 9: store settings, offers (discounts that never overwrite a product's own prices), coupons with their
 * redemptions, and what the storefront home shows (section order and visibility, hand-picked products and
 * categories, banners).
 */
return new class extends Migration
{
    public function up(): void
    {
        // The owner's settings; code defaults apply to any key not stored (App\Services\StoreSettings).
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 64)->primary();
            $table->json('value');
            $table->foreignId('updated_by')->nullable()->constrained('admins')->nullOnDelete();
            $table->timestamps();
        });

        // A store-wide discount on chosen products and/or categories, for a period. Prices are computed from it
        // (App\Services\Pricing); products keep their own regular and sale prices untouched.
        Schema::create('offers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('label', 40)->nullable(); // short storefront text, e.g. "Back to school"
            $table->string('discount_type', 10); // percent | fixed
            $table->decimal('discount_value', 10, 2);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('admins')->nullOnDelete();
            $table->timestamps();
            $table->index(['is_active', 'starts_at', 'ends_at']);
        });

        // What the owner picked: products and categories (a category covers everything below it).
        Schema::create('offer_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('offer_id')->constrained()->cascadeOnDelete();
            $table->string('target_type', 10); // product | category
            $table->unsignedBigInteger('target_id');
            $table->unique(['offer_id', 'target_type', 'target_id']);
            $table->index(['target_type', 'target_id']);
        });

        // Derived from offer_targets and the category tree: each picked category plus every category below it, so
        // SQL (price sorting and filters) can find a product's offers through category_product. Rebuilt whenever an
        // offer's targets or the tree change; never edited by hand.
        Schema::create('offer_categories', function (Blueprint $table) {
            $table->foreignId('offer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->primary(['offer_id', 'category_id']);
            $table->index('category_id');
        });

        // Coupons keep their WooCommerce ids; new ones start at 100000. Codes are stored in capitals.
        Schema::create('coupons', function (Blueprint $table) {
            $table->id()->from(100000);
            $table->string('code', 60)->unique();
            $table->string('description', 255)->nullable();
            $table->string('discount_type', 15); // percent | fixed_cart | fixed_product
            $table->decimal('amount', 10, 2);
            $table->decimal('minimum_spend', 10, 2)->nullable();
            $table->decimal('maximum_spend', 10, 2)->nullable();
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('usage_limit_per_customer')->nullable();
            $table->unsignedInteger('imported_uses')->default(0); // uses in the old store with no imported order to point at
            $table->boolean('exclude_sale_items')->default(false);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // Products and categories a coupon is limited to (or excluded from).
        Schema::create('coupon_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->string('target_type', 10); // product | category
            $table->unsignedBigInteger('target_id');
            $table->boolean('is_excluded')->default(false);
            $table->unique(['coupon_id', 'target_type', 'target_id']);
        });

        // One row per order that used a coupon: the source of usage counts (cancelled and failed orders don't count).
        Schema::create('coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email', 254);
            $table->decimal('discount', 10, 2);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['coupon_id', 'user_id']);
            $table->index(['coupon_id', 'email']);
        });

        // The storefront home: its sections in order, each shown or hidden by the owner.
        Schema::create('homepage_sections', function (Blueprint $table) {
            $table->string('key', 32)->primary();
            $table->unsignedSmallInteger('position');
            $table->boolean('is_visible')->default(true);
            $table->timestamps();
        });
        $now = now();
        $sections = ['hero', 'banners', 'recently_viewed', 'platforms', 'price_drops', 'budget', 'world', 'ask_us', 'continue'];
        DB::table('homepage_sections')->insert(array_map(fn ($key, $i) => ['key' => $key, 'position' => $i + 1, 'is_visible' => true, 'created_at' => $now, 'updated_at' => $now], $sections, array_keys($sections)));

        // Hand-picked products (price_drops) and categories (world) for a section, in order. Empty: chosen automatically.
        Schema::create('homepage_items', function (Blueprint $table) {
            $table->id();
            $table->string('section_key', 32);
            $table->foreign('section_key')->references('key')->on('homepage_sections')->cascadeOnDelete();
            $table->string('item_type', 10); // product | category
            $table->unsignedBigInteger('item_id');
            $table->unsignedSmallInteger('position');
            $table->unique(['section_key', 'item_type', 'item_id']);
        });

        // Promotional banners on the home page, and the announcement line at the top of every page.
        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->string('placement', 16); // home | announcement
            $table->string('title', 120);
            $table->string('text', 300)->nullable();
            $table->string('link_url', 500)->nullable(); // a storefront path (/shop?…) or an https:// address
            $table->string('link_label', 40)->nullable();
            $table->string('image_url', 2048)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
            $table->index(['placement', 'is_active', 'position']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE offers ADD CONSTRAINT offers_type_valid CHECK (discount_type IN ('percent', 'fixed'))");
            DB::statement("ALTER TABLE offers ADD CONSTRAINT offers_value_valid CHECK (discount_value > 0 AND (discount_type <> 'percent' OR discount_value < 100))");
            DB::statement('ALTER TABLE offers ADD CONSTRAINT offers_dates_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)');
            DB::statement("ALTER TABLE offer_targets ADD CONSTRAINT offer_targets_type_valid CHECK (target_type IN ('product', 'category'))");
            DB::statement("ALTER TABLE coupons ADD CONSTRAINT coupons_type_valid CHECK (discount_type IN ('percent', 'fixed_cart', 'fixed_product'))");
            DB::statement("ALTER TABLE coupons ADD CONSTRAINT coupons_amount_valid CHECK (amount > 0 AND (discount_type <> 'percent' OR amount <= 100))");
            DB::statement('ALTER TABLE coupons ADD CONSTRAINT coupons_spend_valid CHECK (minimum_spend IS NULL OR maximum_spend IS NULL OR maximum_spend >= minimum_spend)');
            DB::statement("ALTER TABLE coupon_targets ADD CONSTRAINT coupon_targets_type_valid CHECK (target_type IN ('product', 'category'))");
            DB::statement('ALTER TABLE coupon_redemptions ADD CONSTRAINT coupon_redemptions_discount_valid CHECK (discount >= 0)');
            DB::statement("ALTER TABLE homepage_items ADD CONSTRAINT homepage_items_type_valid CHECK (item_type IN ('product', 'category'))");
            DB::statement("ALTER TABLE banners ADD CONSTRAINT banners_placement_valid CHECK (placement IN ('home', 'announcement'))");
            DB::statement('ALTER TABLE banners ADD CONSTRAINT banners_dates_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('banners');
        Schema::dropIfExists('homepage_items');
        Schema::dropIfExists('homepage_sections');
        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('coupon_targets');
        Schema::dropIfExists('coupons');
        Schema::dropIfExists('offer_categories');
        Schema::dropIfExists('offer_targets');
        Schema::dropIfExists('offers');
        Schema::dropIfExists('settings');
    }
};
