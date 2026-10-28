<?php

namespace Tests\Feature\Community;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Product;
use App\Models\User;
use App\Notifications\StoreReplied;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\SpaClient;
use Tests\TestCase;

/** Buyer ↔ store conversations: only the buyer and the owner can read them, with unread state on both sides. */
class MessagingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function order(SpaClient $buyer): array
    {
        return $buyer->post('/api/v1/orders', [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => Product::factory()->create()->id, 'quantity' => 1]],
            'contact' => ['first_name' => 'Nadim', 'last_name' => 'Saad', 'email' => 'nadim@example.com', 'phone' => '+961 3 222 333'],
            'delivery_method' => 'pickup', 'payment_method' => 'cod', 'note' => 'Please call before you come.',
        ])->assertCreated()->json('data');
    }

    public function test_a_buyer_asks_about_an_order_and_the_owner_replies(): void
    {
        $user = User::factory()->create();
        $buyer = $this->buyer($user);
        $order = $this->order($buyer);
        $owner = $this->owner();

        $c = $buyer->post('/api/v1/account/conversations', ['order_id' => $order['id'], 'body' => 'Can you deliver after 6pm?'])->assertCreated();
        $id = $c->json('data.id');
        $c->assertJsonPath('data.subject', "Order #{$order['number']}")->assertJsonPath('data.order.id', $order['id'])
            ->assertJsonPath('data.messages.0.from', 'you')->assertJsonPath('data.unread', false);
        // Writing about the same order again continues the same conversation.
        $this->assertSame($id, $buyer->post('/api/v1/account/conversations', ['order_id' => $order['id'], 'body' => 'Or Saturday morning.'])->assertCreated()->json('data.id'));
        $this->assertSame(1, Conversation::count());

        // The owner sees it as unread until they open it.
        $inbox = $owner->get('/api/v1/admin/conversations')->assertOk();
        $inbox->assertJsonPath('meta.unread', 1)->assertJsonPath('data.0.unread', true)->assertJsonPath('data.0.customer.email', $user->email)
            ->assertJsonPath('data.0.order.customer_note', 'Please call before you come.')->assertJsonPath('data.0.last_message.excerpt', 'Or Saturday morning.');
        $owner->get("/api/v1/admin/conversations/{$id}")->assertOk()->assertJsonCount(2, 'data.messages')->assertJsonPath('data.unread', false);
        $this->assertSame(0, $owner->get('/api/v1/admin/conversations?unread=1')->json('meta.unread'));

        // The owner replies: the buyer gets an email and an unread badge.
        $buyer->get('/api/v1/account/conversations/unread')->assertOk()->assertJson(['unread' => 0]);
        $owner->post("/api/v1/admin/conversations/{$id}/messages", ['body' => 'Sure, we deliver until 9pm.'])->assertOk()
            ->assertJsonPath('data.messages.2.from', 'admin')->assertJsonPath('data.messages.2.admin', 'DMD World')->assertJsonPath('data.seen_by_customer', false);
        Notification::assertSentTo($user, StoreReplied::class, fn ($n) => $n->message->body === 'Sure, we deliver until 9pm.');
        $buyer->get('/api/v1/account/conversations/unread')->assertJson(['unread' => 1]);
        $buyer->get('/api/v1/account/conversations')->assertJsonPath('data.0.unread', true)->assertJsonPath('data.0.last_message.from', 'store')->assertJsonPath('meta.unread', 1);

        // The buyer opens it: read, in order, with "you" and "store" (never the owner's account).
        $thread = $buyer->get("/api/v1/account/conversations/{$id}")->assertOk();
        $this->assertSame(['you', 'you', 'store'], array_column($thread->json('data.messages'), 'from'));
        $this->assertArrayNotHasKey('admin', $thread->json('data.messages.2'));
        $buyer->get('/api/v1/account/conversations/unread')->assertJson(['unread' => 0]);
        $owner->get('/api/v1/admin/conversations')->assertJsonPath('data.0.seen_by_customer', true);

        // A reply in the same second as a read is still unread (read state is by message id, not by clock).
        $owner->post("/api/v1/admin/conversations/{$id}/messages", ['body' => 'See you then!'])->assertOk();
        $buyer->get('/api/v1/account/conversations/unread')->assertJson(['unread' => 1]);
    }

    public function test_buyers_never_see_each_others_conversations(): void
    {
        $alice = $this->buyer();
        $bob = $this->buyer();
        $aliceOrder = $this->order($alice);
        $id = $alice->post('/api/v1/account/conversations', ['order_id' => $aliceOrder['id'], 'body' => 'Private question about my order.'])->json('data.id');

        $bob->get("/api/v1/account/conversations/{$id}")->assertNotFound();
        $bob->post("/api/v1/account/conversations/{$id}/messages", ['body' => 'Sneaking in a message.'])->assertNotFound();
        $bob->post('/api/v1/account/conversations', ['order_id' => $aliceOrder['id'], 'body' => 'About your order…'])->assertNotFound();
        $bob->get("/api/v1/account/conversations?order={$aliceOrder['id']}")->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame([], $bob->get('/api/v1/account/conversations')->json('data'));
        $this->assertSame(1, Message::count());

        $this->client()->get('/api/v1/account/conversations')->assertUnauthorized();
        $this->client()->post('/api/v1/account/conversations', ['body' => 'Hello from a guest'])->assertUnauthorized();
        $alice->get('/api/v1/admin/conversations')->assertUnauthorized();
        $alice->post("/api/v1/admin/conversations/{$id}/messages", ['body' => 'Pretending to be the store'])->assertUnauthorized();
        $this->assertSame(0, Message::where('sender_type', 'admin')->count());
    }

    public function test_general_questions_and_owner_initiated_conversations(): void
    {
        $user = User::factory()->create();
        $buyer = $this->buyer($user);
        $owner = $this->owner();

        $q = $buyer->post('/api/v1/account/conversations', ['subject' => 'Do you repair controllers?', 'body' => 'My PS5 controller drifts.'])->assertCreated();
        $q->assertJsonPath('data.subject', 'Do you repair controllers?')->assertJsonPath('data.order', null);
        $buyer->post('/api/v1/account/conversations', ['body' => 'Another general question here.'])->assertCreated()->assertJsonPath('data.subject', 'Question for DMD World');
        $this->assertSame(2, Conversation::count(), 'general questions are separate conversations');

        $order = $this->order($buyer);
        $started = $owner->post('/api/v1/admin/conversations', ['user_id' => $user->id, 'order_id' => $order['id'], 'body' => 'Your order is ready for pickup.'])->assertCreated();
        $started->assertJsonPath('data.messages.0.from', 'admin');
        $owner->post('/api/v1/admin/conversations', ['user_id' => User::factory()->create()->id, 'order_id' => $order['id'], 'body' => 'Wrong buyer for this order'])->assertStatus(422);
        $owner->post('/api/v1/admin/conversations', ['user_id' => 987654321, 'body' => 'Nobody'])->assertStatus(422);
        $this->assertSame(1, $buyer->get('/api/v1/account/conversations/unread')->json('unread'));

        // The owner can flag a conversation to come back to.
        $cid = $q->json('data.id');
        $owner->get("/api/v1/admin/conversations/{$cid}")->assertOk();
        $owner->post("/api/v1/admin/conversations/{$cid}/unread")->assertOk()->assertJsonPath('data.unread', true);
    }

    public function test_messages_are_validated_and_kept_as_plain_text(): void
    {
        $buyer = $this->buyer();
        $buyer->post('/api/v1/account/conversations', ['body' => ''])->assertStatus(422)->assertJsonPath('error.fields.body.0', 'Write a message first.');
        $buyer->post('/api/v1/account/conversations', ['body' => " \u{0000}\u{200B} "])->assertStatus(422);
        $buyer->post('/api/v1/account/conversations', ['body' => str_repeat('x', 2001)])->assertStatus(422);
        $buyer->post('/api/v1/account/conversations', ['order_id' => 987654321, 'body' => 'Order that does not exist'])->assertNotFound();

        $html = '<img src=x onerror="alert(1)"> hi';
        $r = $buyer->post('/api/v1/account/conversations', ['body' => $html])->assertCreated();
        $r->assertJsonPath('data.messages.0.body', $html);
        $this->assertSame($html, Message::first()->body);
    }
}
