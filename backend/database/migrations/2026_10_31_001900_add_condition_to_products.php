<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Second-hand products sold by DMD (Buy Used). A product with a condition is used: like_new, excellent, good or fair,
 * with an optional note on its state ("light scratches on the lid, box included"). No condition = new, so every
 * existing product stays exactly as it is. Additive only: two nullable columns, no data changed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'condition')) {
                $table->string('condition', 12)->nullable()->after('type');
                $table->string('condition_note', 500)->nullable()->after('condition');
                $table->index(['condition', 'status']);
            }
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE products ADD CONSTRAINT products_condition_valid CHECK (`condition` IS NULL OR `condition` IN ('like_new', 'excellent', 'good', 'fair'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE products DROP CHECK products_condition_valid');
        }
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['condition', 'status']);
            $table->dropColumn(['condition', 'condition_note']);
        });
    }
};
