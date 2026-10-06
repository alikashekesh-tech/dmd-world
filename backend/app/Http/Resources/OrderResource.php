<?php

namespace App\Http\Resources;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** An order as its buyer (or the guest with its private link) sees it. The owner's private notes are never included. */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $money = fn ($v) => Money::json(Money::cents($v));

        return [
            'id' => $this->id,
            'number' => $this->number,
            'status' => $this->status,
            'placed_at' => ($this->placed_at ?? $this->created_at)?->toIso8601String(),
            'currency' => $this->currency,
            'subtotal' => $money($this->subtotal),
            'discount_total' => $money($this->discount_total),
            'shipping_total' => $money($this->shipping_total),
            'total' => $money($this->total),
            'coupon_code' => $this->coupon_code,
            'payment_method' => $this->payment_method,
            'payment_method_label' => Order::PAYMENT_METHODS[$this->payment_method] ?? $this->payment_method,
            'payment_status' => $this->payment_status,
            'delivery_method' => $this->delivery_method,
            'delivery_method_label' => Order::DELIVERY_METHODS[$this->delivery_method] ?? $this->delivery_method,
            'contact' => ['first_name' => $this->first_name, 'last_name' => $this->last_name, 'email' => $this->email, 'phone' => $this->phone],
            'address' => $this->delivery_method === 'delivery' ? [
                'country' => $this->ship_country, 'city' => $this->ship_city, 'area' => $this->ship_area, 'street' => $this->ship_street,
                'building' => $this->ship_building, 'floor' => $this->ship_floor, 'notes' => $this->ship_notes, 'line' => $this->addressLine(),
            ] : null,
            'customer_note' => $this->customer_note,
            'items' => $this->items->map(fn ($i) => [
                'product_id' => $i->product_id, 'name' => $i->product_name, 'sku' => $i->sku, 'image_url' => $i->image_url,
                'unit_price' => $money($i->unit_price), 'regular_price' => $money($i->regular_price), 'quantity' => $i->quantity,
                'line_subtotal' => $money($i->line_subtotal), 'line_discount' => $money($i->line_discount), 'line_total' => $money($i->line_total),
            ])->values(),
            // Status changes only: when it was placed, confirmed, completed or cancelled.
            'timeline' => $this->whenLoaded('history', fn () => $this->history->whereNotNull('to_status')->map(fn ($h) => ['status' => $h->to_status, 'at' => $h->created_at?->toIso8601String()])->values()),
            'cancellable' => $this->cancellableByBuyer(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,
        ];
    }
}
