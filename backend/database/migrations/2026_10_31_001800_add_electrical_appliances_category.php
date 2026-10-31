<?php

use App\Services\Catalog;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the top-level category "Electrical Appliances" (the storefront lists it under More Categories, products or not).
 * Data only, and additive: it never touches another row. It runs on a store that already has its catalog (an empty
 * database, before the import or in tests, is left as it is) and only when no category or brand uses the address
 * yet, so running it again changes nothing. The owner manages it in Admin › Categories like any other.
 */
return new class extends Migration
{
    private const SLUG = 'electrical-appliances';

    public function up(): void
    {
        if (! DB::table('categories')->exists()) {
            return;
        }
        $taken = DB::table('categories')->whereNull('parent_id')->whereNull('brand_id')->where('slug', self::SLUG)->exists()
            || DB::table('brands')->where('slug', self::SLUG)->exists();
        if ($taken) {
            return;
        }
        $now = now();
        DB::table('categories')->insert([
            'name' => 'Electrical Appliances', 'slug' => self::SLUG, 'is_visible' => true,
            'position' => (int) DB::table('categories')->whereNull('parent_id')->whereNull('brand_id')->max('position') + 1,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        Catalog::bust();
    }

    /** Removes it again only while nothing uses it: no products, sub-categories, offers, coupons or home page picks. */
    public function down(): void
    {
        $id = DB::table('categories')->whereNull('parent_id')->whereNull('brand_id')->where('slug', self::SLUG)->value('id');
        $used = fn () => DB::table('category_product')->where('category_id', $id)->exists()
            || DB::table('categories')->where('parent_id', $id)->exists()
            || DB::table('offer_targets')->where('target_type', 'category')->where('target_id', $id)->exists()
            || DB::table('coupon_targets')->where('target_type', 'category')->where('target_id', $id)->exists()
            || DB::table('homepage_items')->where('item_type', 'category')->where('item_id', $id)->exists();
        if (! $id || $used()) {
            return;
        }
        DB::table('categories')->where('id', $id)->delete();
        Catalog::bust();
    }
};
