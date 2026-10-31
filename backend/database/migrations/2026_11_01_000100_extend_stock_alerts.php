<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Back-in-stock requests for a variant (a sold-out colour or size), and from guests by email or phone (WhatsApp/SMS)
 * with their consent. A signed-in buyer still has one request per product and variant. Every request gets a token, so
 * its link can withdraw it. Additive: existing alerts keep working as product-wide email alerts.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The user foreign key keeps an index of its own once the (user, product) pair below is widened.
        Schema::table('stock_alerts', function (Blueprint $table) {
            $table->index('user_id', 'stock_alerts_user_id_index');
        });
        Schema::table('stock_alerts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'product_id']);
        });
        Schema::table('stock_alerts', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change(); // a guest asks by email or phone
            // No foreign key: MySQL won't build the stored key below on one with an ON DELETE action. Variants are only
            // ever soft-deleted (orders keep them), and deleting a product deletes its alerts through product_id.
            $table->unsignedBigInteger('variant_id')->nullable()->after('product_id');
            $table->unsignedBigInteger('variant_key')->storedAs('IFNULL(variant_id, 0)');
            $table->string('channel', 10)->default('email')->after('variant_key'); // email | whatsapp | sms
            $table->string('email', 254)->nullable()->after('channel');
            $table->string('phone', 30)->nullable()->after('email');
            $table->timestamp('consented_at')->nullable()->after('phone');
            $table->char('token', 40)->nullable()->unique()->after('consented_at');
            $table->timestamp('cancelled_at')->nullable()->after('notified_at');
            $table->string('notified_by', 10)->nullable()->after('cancelled_at'); // system | admin (contacted by hand)
            $table->unique(['user_id', 'product_id', 'variant_key'], 'stock_alerts_user_product_variant_unique');
            $table->index(['product_id', 'variant_id', 'notified_at', 'cancelled_at'], 'stock_alerts_waiting_index');
        });
    }

    public function down(): void
    {
        Schema::table('stock_alerts', function (Blueprint $table) {
            $table->dropUnique('stock_alerts_user_product_variant_unique');
            $table->dropIndex('stock_alerts_waiting_index');
            $table->dropColumn(['variant_id', 'variant_key', 'channel', 'email', 'phone', 'consented_at', 'token', 'cancelled_at', 'notified_by']);
        });
        // Guest requests have no user: user_id stays nullable rather than deleting them.
        Schema::table('stock_alerts', function (Blueprint $table) {
            $table->unique(['user_id', 'product_id']);
        });
    }
};
