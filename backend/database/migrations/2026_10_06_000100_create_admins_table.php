<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The store owner. DMD World has exactly one: `singleton` is always 1 and unique, so MySQL itself refuses a
        // second row. Created and reset with `php artisan dmd:owner`, never seeded with a password.
        Schema::create('admins', function (Blueprint $table) {
            $table->id();
            $table->unsignedTinyInteger('singleton')->default(1)->unique();
            $table->string('name', 80);
            $table->string('email')->unique();
            $table->string('password');
            $table->rememberToken();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE admins ADD CONSTRAINT admins_one_owner CHECK (singleton = 1)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('admins');
    }
};
