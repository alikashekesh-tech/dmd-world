<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Offers can now cover brands (products.brand_id) and the entire store, as well as products and categories. Only the
 * check on offer_targets.target_type changes: no columns, no data. Existing offers keep their product and category
 * targets exactly as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        try {
            DB::statement('ALTER TABLE offer_targets DROP CONSTRAINT offer_targets_type_valid');
        } catch (\Throwable) {
            try {
                DB::statement('ALTER TABLE offer_targets DROP CHECK offer_targets_type_valid');
            } catch (\Throwable) {
                // Constraint might not exist or driver already dropped it
            }
        }
        try {
            DB::statement("ALTER TABLE offer_targets ADD CONSTRAINT offer_targets_type_valid CHECK (target_type IN ('product', 'brand', 'category', 'store'))");
        } catch (\Throwable) {
            // Already added or not supported
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        // Going back would make brand and entire-store targets invalid: refuse rather than delete the owner's offers.
        $n = DB::table('offer_targets')->whereIn('target_type', ['brand', 'store'])->count();
        if ($n > 0) {
            throw new RuntimeException("{$n} offer target(s) cover a brand or the entire store. Change those offers to products or categories first.");
        }
        DB::statement('ALTER TABLE offer_targets DROP CHECK offer_targets_type_valid');
        DB::statement("ALTER TABLE offer_targets ADD CONSTRAINT offer_targets_type_valid CHECK (target_type IN ('product', 'category'))");
    }
};
