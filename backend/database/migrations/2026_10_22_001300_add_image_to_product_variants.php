<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A variant can show one of its product's gallery images ("the white one"). It keeps the image's address, not its row:
 * the gallery is rewritten on every save, and an address that has left the gallery is cleared on the next save.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->string('image_url', 2048)->nullable()->after('options_key');
        });
    }

    public function down(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->dropColumn('image_url');
        });
    }
};
