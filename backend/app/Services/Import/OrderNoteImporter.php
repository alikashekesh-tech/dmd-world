<?php

namespace App\Services\Import;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use App\Models\OrderStatusEvent;
use App\Support\Text;
use Illuminate\Support\Carbon;

/**
 * The old store's order notes, sorted into where they belong now:
 *   - "[Buyer message] …" notes (the old storefront's buyer messages) and notes to the customer (the owner's replies)
 *     become the order's conversation, when the order belongs to an account;
 *   - status-change notes and the owner's private notes become the order's history (never shown to the buyer).
 * Messages keep their note ids; history lines remember theirs, so running it again updates instead of duplicating.
 * Imported conversations count as read on both sides: they're history, not new mail.
 */
final class OrderNoteImporter
{
    public const BUYER_TAG = '[Buyer message] ';

    private array $stats = ['messages' => 0, 'conversations' => 0, 'history notes' => 0];

    /** @var list<string> */
    public array $warnings = [];

    /** @param array<int, list<array>> $notesByOrder order id → that order's WooCommerce notes */
    public function import(array $notesByOrder): array
    {
        foreach ($notesByOrder as $orderId => $notes) {
            $order = Order::find((int) $orderId);
            if (! $order) {
                continue;
            }
            $conversation = null;
            foreach ($notes as $n) {
                $id = (int) ($n['id'] ?? 0);
                $raw = (string) ($n['note'] ?? '');
                $at = Carbon::parse($n['date_created_gmt'] ?? $n['date_created'] ?? 'now', 'UTC');
                $fromBuyer = str_starts_with($raw, self::BUYER_TAG);
                $toBuyer = ! empty($n['customer_note']);
                $text = Text::multiline(Text::plain($fromBuyer ? substr($raw, strlen(self::BUYER_TAG)) : $raw), 5000);
                if (! $id || $text === '') {
                    continue;
                }

                if (($fromBuyer || $toBuyer) && $order->user_id) {
                    $conversation ??= $this->conversationFor($order, $at);
                    $message = Message::find($id) ?? new Message;
                    $message->forceFill([
                        'id' => $id, 'conversation_id' => $conversation->id, 'sender_type' => $fromBuyer ? 'buyer' : 'admin',
                        'user_id' => $fromBuyer ? $order->user_id : null, 'admin_id' => null, 'body' => mb_substr($text, 0, 2000), 'created_at' => $at,
                    ])->save();
                    $this->stats['messages']++;

                    continue;
                }

                // A guest's message or reply (no account to hold a conversation) is kept in the history, labelled.
                $note = match (true) {
                    $fromBuyer => 'Buyer wrote: '.$text,
                    $toBuyer => 'Sent to the buyer: '.$text,
                    default => $text,
                };
                $status = str_starts_with($raw, 'Order status changed');
                $event = OrderStatusEvent::where('legacy_note_id', $id)->first() ?? new OrderStatusEvent;
                $event->forceFill([
                    'order_id' => $order->id, 'from_status' => null, 'to_status' => null,
                    'actor' => $status || ($n['author'] ?? '') === 'system' ? 'system' : ($fromBuyer ? 'buyer' : 'admin'),
                    'admin_id' => null, 'note' => mb_substr($note, 0, 500), 'legacy_note_id' => $id, 'created_at' => $at,
                ])->save();
                $this->stats['history notes']++;
            }
            if ($conversation) {
                $this->summarise($conversation);
            }
        }

        return $this->stats;
    }

    private function conversationFor(Order $order, Carbon $at): Conversation
    {
        $conversation = Conversation::where('order_id', $order->id)->first();
        if (! $conversation) {
            $conversation = new Conversation;
            $conversation->timestamps = false;
            $conversation->forceFill(['user_id' => $order->user_id, 'order_id' => $order->id, 'subject' => "Order #{$order->number}", 'created_at' => $at, 'updated_at' => $at])->save();
            $conversation->timestamps = true;
            $this->stats['conversations']++;
        }

        return $conversation;
    }

    /** Recomputes the conversation's last message and marks the imported history as read on both sides. */
    private function summarise(Conversation $conversation): void
    {
        $buyer = Message::where('conversation_id', $conversation->id)->where('sender_type', 'buyer')->max('id');
        $admin = Message::where('conversation_id', $conversation->id)->where('sender_type', 'admin')->max('id');
        $conversation->forceFill([
            'last_message_at' => Message::where('conversation_id', $conversation->id)->max('created_at'),
            'last_buyer_message_id' => $buyer, 'last_admin_message_id' => $admin,
            'buyer_read_id' => max((int) $conversation->buyer_read_id, (int) $admin) ?: null,
            'admin_read_id' => max((int) $conversation->admin_read_id, (int) $buyer) ?: null,
        ])->save();
    }
}
