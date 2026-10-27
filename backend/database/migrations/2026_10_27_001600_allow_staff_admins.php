<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Staff can sign in to the admin too. The owner stays unique: their row keeps `singleton` = 1 (unique, and the CHECK
 * still allows only 1), staff rows have NULL there, which neither the unique index nor the CHECK counts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admins', function (Blueprint $table) {
            $table->unsignedTinyInteger('singleton')->nullable()->default(1)->change();
        });
    }

    public function down(): void
    {
        DB::table('admins')->whereNull('singleton')->delete(); // staff accounts can't exist without the column allowing them
        Schema::table('admins', function (Blueprint $table) {
            $table->unsignedTinyInteger('singleton')->nullable(false)->default(1)->change();
        });
    }
};
