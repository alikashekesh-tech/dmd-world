<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 10: indexes for the dashboard's date-range queries, and the owner's notification state (notifications are
 * computed from the data; only "seen up to" and dismissals are stored).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Every dashboard window filters orders by date first (all statuses), then by status.
        Schema::table('orders', function (Blueprint $table) {
            $table->index('placed_at');
        });
        Schema::table('admins', function (Blueprint $table) {
            $table->timestamp('notifications_seen_at')->nullable()->after('last_login_at');
        });
        Schema::create('dismissed_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('admins')->cascadeOnDelete();
            $table->string('notification_key', 80);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['admin_id', 'notification_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dismissed_notifications');
        Schema::table('admins', fn (Blueprint $table) => $table->dropColumn('notifications_seen_at'));
        Schema::table('orders', fn (Blueprint $table) => $table->dropIndex(['placed_at']));
    }
};
