<?php

namespace Tests\Feature\Community;

use App\Models\Conversation;
use App\Models\User;
use App\Notifications\StoreReplied;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LiveChatTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_chats_and_the_store_replies_in_the_same_chat(): void
    {
        Notification::fake();
        $guest = $this->client();
        $guest->get('/api/v1/chat')->assertOk()->assertJsonPath('data.started', false);

        $guest->post('/api/v1/chat/messages', ['body' => 'Does the PS5 pad work on PC?'])->assertStatus(422)->assertJsonPath('error.fields.name.0', 'Tell us your name so we know who we’re talking to.');
        $first = $guest->post('/api/v1/chat/messages', ['name' => 'Rami', 'email' => 'rami@example.com', 'body' => 'Does the PS5 pad work on PC?'])->assertCreated();
        $token = $first->json('meta.token');
        $this->assertSame(48, strlen($token));
        $this->assertSame('you', $first->json('data.messages.0.from'));
        $chat = Conversation::sole();
        $this->assertSame(['chat', null, 'Rami', 'rami@example.com'], [$chat->channel, $chat->user_id, $chat->guest_name, $chat->guest_email]);
        $this->assertSame(hash('sha256', $token), $chat->chat_token_hash, 'only the hash of the key is kept');

        // The store sees it as a live chat from a guest, and answers.
        $owner = $this->owner();
        $owner->get('/api/v1/admin/conversations')->assertJsonPath('data.0.channel', 'chat')->assertJsonPath('data.0.customer.guest', true)
            ->assertJsonPath('data.0.customer.name', 'Rami')->assertJsonPath('meta.unread', 1);
        $owner->post("/api/v1/admin/conversations/{$chat->id}/messages", ['body' => 'Yes, with a USB-C cable.'])->assertOk();
        Notification::assertSentTo(new AnonymousNotifiable, StoreReplied::class, fn ($n, $c, $to) => $to->routes['mail'] === 'rami@example.com');

        // The guest's bubble (with its key) gets the reply; without the key nobody sees the chat.
        $withKey = fn (string $uri) => $guest->get($uri, ['X-Chat-Token' => $token]);
        $withKey('/api/v1/chat')->assertJsonPath('data.unread', true)->assertJsonCount(2, 'data.messages')->assertJsonPath('data.messages.1.from', 'store');
        $after = $first->json('data.messages.0.id');
        $withKey("/api/v1/chat?after={$after}&read=1")->assertJsonCount(1, 'data.messages')->assertJsonPath('data.messages.0.body', 'Yes, with a USB-C cable.');
        $withKey('/api/v1/chat')->assertJsonPath('data.unread', false);
        $this->client()->get('/api/v1/chat', ['X-Chat-Token' => str_repeat('x', 48)])->assertJsonPath('data.started', false);

        $guest->post('/api/v1/chat/messages', ['body' => 'Thanks!'], ['X-Chat-Token' => $token])->assertOk();
        $this->assertSame(1, Conversation::count(), 'the key continues the same chat');
        $this->assertSame(3, $chat->messages()->count());
    }

    public function test_a_signed_in_buyer_chats_as_themselves(): void
    {
        $user = User::factory()->create(['first_name' => 'Lina']);
        $buyer = $this->buyer($user);
        $buyer->post('/api/v1/chat/messages', ['body' => 'Is the Edge in stock?'])->assertCreated()->assertJsonMissingPath('meta.token');
        $buyer->post('/api/v1/chat/messages', ['body' => 'In white?'])->assertOk();

        $chat = Conversation::sole();
        $this->assertSame([$user->id, 'chat', null], [$chat->user_id, $chat->channel, $chat->chat_token_hash]);
        $buyer->get('/api/v1/chat')->assertJsonCount(2, 'data.messages')->assertJsonPath('data.name', $user->fullName());
        // It's also in their account's messages, like any conversation.
        $buyer->get('/api/v1/account/conversations')->assertJsonPath('data.0.id', $chat->id);
    }
}
