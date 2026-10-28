<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Live chat on the storefront. A chat is a conversation like a buyer's messages (same inbox, same replies), with
 * `channel` = 'chat'. Guests can chat too: their conversation has no user, just the name (and optional email) they
 * gave, and their browser holds a private key whose SHA-256 is `chat_token_hash` (the key itself is never stored).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('channel', 10)->default('message')->after('order_id'); // message | chat
            $table->string('guest_name', 80)->nullable()->after('channel');
            $table->string('guest_email')->nullable()->after('guest_name');
            $table->char('chat_token_hash', 64)->nullable()->unique()->after('guest_email');
        });
    }

    public function down(): void
    {
        DB::table('conversations')->whereNull('user_id')->delete(); // guest chats can't exist without a nullable user
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique(['chat_token_hash']);
            $table->dropColumn(['channel', 'guest_name', 'guest_email', 'chat_token_hash']);
            $table->dropForeign(['user_id']);
        });
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
