<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A placed order. Created only by Checkout (and the import); its money fields are worked out by the server, never
 * taken from the browser, and its customer/address/product details are copies taken at the time of purchase.
 * Nothing is mass-assignable: every write is explicit.
 */
#[Hidden(['guest_token_hash', 'idempotency_hash'])]
class Order extends Model
{
    public const STATUSES = ['pending', 'processing', 'on_hold', 'completed', 'cancelled', 'refunded', 'failed'];

    /** Orders that count as sales (revenue, best sellers, verified buyers). */
    public const PAID = ['processing', 'completed', 'on_hold'];

    /** Where the owner may move an order from each status. */
    public const TRANSITIONS = [
        'pending' => ['processing', 'on_hold', 'completed', 'cancelled'],
        'on_hold' => ['processing', 'completed', 'cancelled'],
        'processing' => ['on_hold', 'completed', 'cancelled'],
        'completed' => ['refunded'],
        'cancelled' => ['pending', 'processing'],
        'refunded' => [],
        'failed' => ['pending', 'cancelled'],
    ];

    public const PAYMENT_METHODS = ['cod' => 'Cash on delivery', 'bank_transfer' => 'Direct bank transfer'];

    public const DELIVERY_METHODS = ['delivery' => 'Delivery', 'pickup' => 'Pick up from store'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2', 'discount_total' => 'decimal:2', 'shipping_total' => 'decimal:2', 'total' => 'decimal:2',
            'placed_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime', 'user_id' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(OrderStatusEvent::class)->orderBy('id');
    }

    public function scopePaid(Builder $query): void
    {
        $query->whereIn('status', self::PAID);
    }

    /** Buyers may cancel only while DMD hasn't confirmed the order yet. */
    public function cancellableByBuyer(): bool
    {
        return $this->status === 'pending';
    }

    public function customerName(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function addressLine(): string
    {
        return implode(', ', array_filter([$this->ship_street, $this->ship_building ? "Bldg {$this->ship_building}" : null, $this->ship_floor ? "Floor {$this->ship_floor}" : null, $this->ship_area, $this->ship_city]));
    }
}
