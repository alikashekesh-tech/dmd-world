<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Abandoned checkouts the customer agreed to be reminded about (only then is anything kept), outgoing WhatsApp/SMS
 * messages and their result, and on orders: when it left for delivery (or was ready to collect) and whether the buyer
 * asked for updates by phone. Additive only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checkout_recoveries', function (Blueprint $table) {
            $table->id();
            $table->char('token', 40)->unique(); // the private recovery link
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('first_name', 80)->nullable();
            $table->string('email', 254)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('channel', 10)->default('email'); // email | whatsapp | sms
            $table->json('items'); // [{product_id, variant_id, quantity}]: no prices, they're worked out again when used
            $table->decimal('subtotal', 10, 2)->default(0); // at the last save, for the owner's overview
            $table->timestamp('consented_at');
            $table->timestamp('last_activity_at');
            $table->unsignedTinyInteger('reminders_sent')->default(0);
            $table->timestamp('reminded_at')->nullable();
            $table->timestamp('opened_at')->nullable(); // the recovery link was used
            $table->foreignId('recovered_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->timestamp('recovered_at')->nullable();
            $table->timestamp('closed_at')->nullable(); // withdrawn by the customer, or emptied
            $table->timestamps();
            $table->index(['recovered_at', 'closed_at', 'reminders_sent', 'last_activity_at'], 'checkout_recoveries_due_index');
            $table->index('email');
        });

        Schema::create('outbound_messages', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 10); // whatsapp | sms
            $table->string('to', 30);
            $table->string('purpose', 40); // back_in_stock | checkout_reminder | order_update | new_order
            $table->nullableMorphs('about');
            $table->string('status', 20); // sent | failed | not_configured
            $table->string('error', 300)->nullable();
            $table->timestamps();
            $table->index(['purpose', 'status', 'created_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'dispatched_at')) {
                $table->timestamp('dispatched_at')->nullable()->after('completed_at'); // out for delivery, or ready to collect
            }
            if (! Schema::hasColumn('orders', 'updates_by_phone')) {
                $table->boolean('updates_by_phone')->default(false)->after('phone'); // the buyer asked for WhatsApp/SMS updates
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['dispatched_at', 'updates_by_phone']);
        });
        Schema::dropIfExists('outbound_messages');
        Schema::dropIfExists('checkout_recoveries');
    }
};
