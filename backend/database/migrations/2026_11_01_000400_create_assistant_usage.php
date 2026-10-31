<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The shopping assistant's usage, one row per day: how many questions, how many found products, and (once an AI
 * provider is approved and connected) its requests, tokens and estimated cost. Counts only: no question text, no
 * visitor data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_usage', function (Blueprint $table) {
            $table->id();
            $table->date('day')->unique();
            $table->unsignedInteger('questions')->default(0);
            $table->unsignedInteger('answered')->default(0); // products or store facts found
            $table->unsignedInteger('unanswered')->default(0); // handed to a person
            $table->unsignedInteger('ai_requests')->default(0);
            $table->unsignedInteger('ai_failures')->default(0);
            $table->unsignedBigInteger('ai_input_tokens')->default(0);
            $table->unsignedBigInteger('ai_output_tokens')->default(0);
            $table->decimal('ai_cost_usd', 10, 4)->default(0); // estimated from the provider's reported tokens and its prices
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_usage');
    }
};
