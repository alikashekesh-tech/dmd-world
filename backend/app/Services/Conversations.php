<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use App\Models\User;
use App\Notifications\StoreReplied;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Buyer ↔ store conversations. Every message updates its conversation under a row lock, so the "last message" and
 * the read state can't drift when the buyer and the owner write at the same time. Read state is the id of the last
 * message each side has seen.
 */
class Conversations
{
    /** Starts a conversation (or continues the one about that order: there is one per order). */
    public function start(User $buyer, ?Order $order, ?string $subject, string $body): Conversation
    {
        if ($order && $order->user_id !== $buyer->id) {
            throw new ApiException(404, 'NOT_FOUND', 'Order not found.'); // never confirm someone else's order exists
        }
        $conversation = $order ? Conversation::where('order_id', $order->id)->first() : null;
        if (! $conversation) {
            try {
                $conversation = (new Conversation)->forceFill([
                    'user_id' => $buyer->id, 'order_id' => $order?->id,
                    'subject' => $order ? "Order #{$order->number}" : ($subject ?: 'Question for DMD World'),
                ]);
                $conversation->save();
            } catch (UniqueConstraintViolationException) {
                $conversation = Conversation::where('order_id', $order->id)->firstOrFail(); // another tab opened it first
            }
        }
        $this->post($conversation, 'buyer', $body, buyer: $buyer);

        return $conversation->refresh();
    }

    /** Owner → buyer: a new conversation, optionally about one of that buyer's orders. */
    public function startFromStore(Admin $by, User $buyer, ?Order $order, ?string $subject, string $body): Conversation
    {
        if ($order && $order->user_id !== $buyer->id) {
            throw new ApiException(422, 'ORDER_NOT_THIS_BUYER', 'That order belongs to someone else.', ['order_id' => ['That order belongs to someone else.']]);
        }
        $conversation = $order ? Conversation::where('order_id', $order->id)->first() : null;
        if (! $conversation) {
            $conversation = (new Conversation)->forceFill([
                'user_id' => $buyer->id, 'order_id' => $order?->id,
                'subject' => $order ? "Order #{$order->number}" : ($subject ?: 'A message from DMD World'),
            ]);
            $conversation->save();
        }
        $this->post($conversation, 'admin', $body, admin: $by);

        return $conversation->refresh();
    }

    /** Adds a message. The sender has, by writing, read everything before it. */
    public function post(Conversation $conversation, string $sender, string $body, ?User $buyer = null, ?Admin $admin = null): Message
    {
        $message = DB::transaction(function () use ($conversation, $sender, $body, $buyer, $admin) {
            $locked = Conversation::lockForUpdate()->findOrFail($conversation->id);
            $message = (new Message)->forceFill([
                'conversation_id' => $locked->id, 'sender_type' => $sender, 'body' => $body,
                'user_id' => $sender === 'buyer' ? $buyer?->id : null, 'admin_id' => $sender === 'admin' ? $admin?->id : null,
            ]);
            $message->save();
            $now = now();
            $locked->forceFill(['last_message_at' => $now] + match ($sender) {
                'buyer' => ['last_buyer_message_id' => $message->id, 'buyer_read_id' => $message->id, 'buyer_read_at' => $now],
                'admin' => ['last_admin_message_id' => $message->id, 'admin_read_id' => $message->id, 'admin_read_at' => $now],
                default => [],
            })->save();
            $conversation->setRawAttributes($locked->getAttributes(), true);

            return $message->refresh();
        }, 3);

        if ($sender === 'buyer') {
            Activity::record('message.received', "{$buyer?->fullName()} wrote: {$conversation->subject}", $conversation, null, $buyer);
        } elseif ($sender === 'admin') {
            Activity::record('message.sent', "Replied to {$conversation->user?->fullName()}: {$conversation->subject}", $conversation, $admin);
            DB::afterCommit(function () use ($conversation, $message) {
                try {
                    $conversation->user?->notify(new StoreReplied($conversation, $message));
                } catch (Throwable $e) {
                    Log::warning("Reply email for conversation {$conversation->id} failed: {$e->getMessage()}"); // the message itself is saved
                }
            });
        }

        return $message;
    }

    /** Marks everything up to now as seen by one side ('buyer' or 'admin'). */
    public function markRead(Conversation $conversation, string $side): void
    {
        $last = $side === 'buyer' ? $conversation->last_admin_message_id : $conversation->last_buyer_message_id;
        $seen = $side === 'buyer' ? $conversation->buyer_read_id : $conversation->admin_read_id;
        if ($last !== null && $last > (int) $seen) {
            // Only ever moves forward: a slow request can't mark a newer message as unread again.
            Conversation::whereKey($conversation->id)
                ->whereRaw("COALESCE({$side}_read_id, 0) < ?", [$last])
                ->update(["{$side}_read_id" => $last, "{$side}_read_at" => now()]);
            $conversation->refresh();
        }
    }

    /** The owner flags a conversation to come back to. */
    public function markUnreadForAdmin(Conversation $conversation): void
    {
        $conversation->forceFill(['admin_read_id' => null, 'admin_read_at' => null])->save();
    }
}
