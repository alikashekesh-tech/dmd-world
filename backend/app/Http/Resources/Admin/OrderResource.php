<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\OrderResource as BuyerOrder;
use App\Models\Order;
use Illuminate\Http\Request;

/** The owner's view of an order: everything the buyer sees, plus the account, private notes and allowed next steps. */
class OrderResource extends BuyerOrder
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'customer_name' => $this->customerName(),
            'user_id' => $this->user_id,
            'is_guest' => $this->user_id === null,
            'item_count' => $this->relationLoaded('items') ? (int) $this->items->sum('quantity') : null,
            'next_statuses' => Order::TRANSITIONS[$this->status] ?? [],
            'history' => $this->whenLoaded('history', fn () => $this->history->map(fn ($h) => [
                'from' => $h->from_status, 'to' => $h->to_status, 'actor' => $h->actor, 'by' => $h->admin?->name, 'note' => $h->note, 'at' => $h->created_at?->toIso8601String(),
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
