<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How a home page banner is drawn. Only adds nullable columns: existing banners keep showing exactly as before
 * (no mobile image: the main one is used; no focal point: centred; no overlay choice: the soft default).
 *   image_mobile_url  a separate, taller image for phones (an upload or an https:// address)
 *   focal_point       the part of the image to keep in view when it is cropped, as "x% y%" (e.g. "50% 30%")
 *   overlay           how much the image is darkened behind the text: none | soft | strong
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('banners', function (Blueprint $table) {
            $table->string('image_mobile_url', 2048)->nullable()->after('image_url');
            $table->string('focal_point', 16)->nullable()->after('image_mobile_url');
            $table->string('overlay', 10)->nullable()->after('focal_point');
        });
    }

    public function down(): void
    {
        Schema::table('banners', function (Blueprint $table) {
            $table->dropColumn(['image_mobile_url', 'focal_point', 'overlay']);
        });
    }
};
