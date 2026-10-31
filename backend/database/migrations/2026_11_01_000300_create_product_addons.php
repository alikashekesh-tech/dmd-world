<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Recommended add-ons: products the owner suggests with another (a controller with a console), in order. Additive. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_addons', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->primary(['product_id', 'addon_id']);
            $table->index('addon_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_addons');
    }
};
