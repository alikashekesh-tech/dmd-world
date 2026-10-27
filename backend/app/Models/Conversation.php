<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A conversation between one buyer and the store, optionally about one of the buyer's orders. A buyer only ever
 * reaches conversations through their own account ($user->conversations()); the owner sees all of them.
 * Live chat (`channel` = 'chat') uses the same conversations; a guest's chat has no user, only the name they gave
 * and the hash of the private key their browser keeps (see Conversations::chatFor()).
 */
class Conversation extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'order_id' => 'integer',
            'last_message_at' => 'datetime',
            'last_buyer_message_id' => 'integer',
            'last_admin_message_id' => 'integer',
            'buyer_read_id' => 'integer',
            'admin_read_id' => 'integer',
            'buyer_read_at' => 'datetime',
            'admin_read_at' => 'datetime',
        ];
    }

    public const CHAT = 'chat';

    /** Who the store is talking to: the account's name, or the name a guest gave in the chat. */
    public function customerName(): string
    {
        return $this->user?->fullName() ?: ($this->guest_name ?: 'A visitor');
    }

    public function isGuest(): bool
    {
        return $this->user_id === null;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at')->orderBy('id');
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany('id');
    }

    /** The store has written something the buyer hasn't opened yet. */
    public function unreadForBuyer(): bool
    {
        return $this->last_admin_message_id !== null && $this->last_admin_message_id > (int) $this->buyer_read_id;
    }

    /** The buyer has written something the owner hasn't opened yet. */
    public function unreadForAdmin(): bool
    {
        return $this->last_buyer_message_id !== null && $this->last_buyer_message_id > (int) $this->admin_read_id;
    }

    public function scopeUnreadForBuyer(Builder $query): void
    {
        $query->whereNotNull('last_admin_message_id')->whereRaw('last_admin_message_id > COALESCE(buyer_read_id, 0)');
    }

    public function scopeUnreadForAdmin(Builder $query): void
    {
        $query->whereNotNull('last_buyer_message_id')->whereRaw('last_buyer_message_id > COALESCE(admin_read_id, 0)');
    }
}
