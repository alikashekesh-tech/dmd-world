<?php

namespace App\Http\Resources\Account;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/** A conversation as its buyer sees it: "you" and "DMD World", never the owner's account details. */
class ConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $from = fn ($m) => match ($m->sender_type) {
            'buyer' => 'you',
            'admin' => 'store',
            default => 'system',
        };
        $order = $this->relationLoaded('order') ? $this->order : null;

        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'order' => $order ? ['id' => $order->id, 'number' => $order->number, 'status' => $order->status, 'placed_at' => $order->placed_at?->toIso8601String()] : null,
            'unread' => $this->unreadForBuyer(),
            'last_message_at' => $this->last_message_at?->toIso8601String(),
            'last_message' => $this->whenLoaded('latestMessage', fn () => $this->latestMessage ? [
                'from' => $from($this->latestMessage),
                'excerpt' => Str::limit($this->latestMessage->body, 140),
                'created_at' => $this->latestMessage->created_at?->toIso8601String(),
            ] : null),
            'messages' => $this->whenLoaded('messages', fn () => $this->messages->map(fn ($m) => [
                'id' => $m->id, 'from' => $from($m), 'body' => $m->body, 'created_at' => $m->created_at?->toIso8601String(),
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
