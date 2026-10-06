<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 8: product reviews, buyer ↔ store conversations, and back-in-stock alerts.
 * Reviews and messages are stored as plain text (never HTML); every API answer serves them as JSON strings.
 */
return new class extends Migration
{
    public function up(): void
    {
        // One review per buyer per product. Imported reviews keep their WooCommerce ids; new ones start at 100000.
        Schema::create('reviews', function (Blueprint $table) {
            $table->id()->from(100000);
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('author_name', 80);
            $table->string('author_email', 254)->nullable(); // only for imported reviews with no matching account; owner-only
            $table->unsignedTinyInteger('rating');
            $table->string('title', 120)->nullable();
            $table->text('body');
            $table->string('status', 10)->default('pending'); // pending | approved | rejected | spam
            $table->boolean('is_verified_purchase')->default(false);
            $table->foreignId('moderated_by')->nullable()->constrained('admins')->nullOnDelete();
            $table->timestamp('moderated_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'product_id']);
            $table->index(['product_id', 'status', 'created_at']);
            $table->index(['status', 'created_at']);
        });

        // A conversation between one buyer and the store, optionally about one of their orders (one per order).
        // Read state is the id of the last message each side has seen: ids only grow, so a reply can never be
        // missed because it arrived in the same second as a read.
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->string('subject', 150);
            $table->timestamp('last_message_at')->nullable();
            $table->unsignedBigInteger('last_buyer_message_id')->nullable();
            $table->unsignedBigInteger('last_admin_message_id')->nullable();
            $table->unsignedBigInteger('buyer_read_id')->nullable();
            $table->unsignedBigInteger('admin_read_id')->nullable();
            $table->timestamp('buyer_read_at')->nullable();
            $table->timestamp('admin_read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'last_message_at']);
            $table->index('last_message_at');
        });

        // Imported messages keep their WooCommerce order-note ids; new ones start at 1000000.
        Schema::create('messages', function (Blueprint $table) {
            $table->id()->from(1000000);
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->string('sender_type', 10); // buyer | admin | system
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('admin_id')->nullable()->constrained('admins')->nullOnDelete();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['conversation_id', 'created_at', 'id']);
        });

        // A signed-in buyer waiting for a sold-out product. notified_at is set once the email has gone.
        Schema::create('stock_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'product_id']);
            $table->index(['product_id', 'notified_at']);
        });

        // Order notes imported from the old store keep their note id, so importing again updates them.
        Schema::table('order_status_history', function (Blueprint $table) {
            $table->unsignedBigInteger('legacy_note_id')->nullable()->unique()->after('note');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE reviews ADD CONSTRAINT reviews_rating_valid CHECK (rating BETWEEN 1 AND 5)');
            DB::statement("ALTER TABLE reviews ADD CONSTRAINT reviews_status_valid CHECK (status IN ('pending', 'approved', 'rejected', 'spam'))");
            DB::statement("ALTER TABLE messages ADD CONSTRAINT messages_sender_valid CHECK (sender_type IN ('buyer', 'admin', 'system'))");
        }
    }

    public function down(): void
    {
        Schema::table('order_status_history', function (Blueprint $table) {
            $table->dropUnique(['legacy_note_id']);
            $table->dropColumn('legacy_note_id');
        });
        Schema::dropIfExists('stock_alerts');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('reviews');
    }
};
