<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A checkout the customer started and agreed to be reminded about. Only kept with their consent; the reminder links
 * back with the private token, and the row is closed once they order (recovered) or withdraw it.
 */
class CheckoutRecovery extends Model
{
    protected $guarded = ['*'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer', 'items' => 'array', 'subtotal' => 'decimal:2', 'reminders_sent' => 'integer',
            'consented_at' => 'datetime', 'last_activity_at' => 'datetime', 'reminded_at' => 'datetime', 'opened_at' => 'datetime',
            'recovered_order_id' => 'integer', 'recovered_at' => 'datetime', 'closed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'recovered_order_id');
    }

    /** Still open: not ordered and not withdrawn. */
    public function scopeOpen($query)
    {
        return $query->whereNull('recovered_at')->whereNull('closed_at');
    }

    public function state(): string
    {
        return match (true) {
            $this->recovered_at !== null => 'recovered',
            $this->closed_at !== null => 'closed',
            $this->reminders_sent > 0 => 'reminded',
            default => 'open',
        };
    }
}
