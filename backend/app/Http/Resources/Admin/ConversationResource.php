<?php

namespace App\Http\Resources\Admin;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/** A conversation for the owner's inbox. */
class ConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $order = $this->relationLoaded('order') ? $this->order : null;
        $user = $this->relationLoaded('user') ? $this->user : null;

        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'customer' => $user ? ['id' => $user->id, 'name' => $user->fullName(), 'email' => $user->email, 'phone' => $user->phone] : null,
            'order' => $order ? [
                'id' => $order->id, 'number' => $order->number, 'status' => $order->status, 'total' => Money::json(Money::cents($order->total)),
                'placed_at' => $order->placed_at?->toIso8601String(), 'customer_note' => $order->customer_note,
            ] : null,
            'unread' => $this->unreadForAdmin(),
            'seen_by_customer' => ! $this->unreadForBuyer(),
            'last_message_at' => $this->last_message_at?->toIso8601String(),
            'last_message' => $this->whenLoaded('latestMessage', fn () => $this->latestMessage ? [
                'from' => $this->latestMessage->sender_type,
                'excerpt' => Str::limit($this->latestMessage->body, 140),
                'created_at' => $this->latestMessage->created_at?->toIso8601String(),
            ] : null),
            'messages' => $this->whenLoaded('messages', fn () => $this->messages->map(fn ($m) => [
                'id' => $m->id, 'from' => $m->sender_type, 'admin' => $m->relationLoaded('admin') ? $m->admin?->name : null,
                'body' => $m->body, 'created_at' => $m->created_at?->toIso8601String(),
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
