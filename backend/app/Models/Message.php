<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One message in a conversation, from the buyer, the owner or the system. Plain text; never edited. */
class Message extends Model
{
    public const UPDATED_AT = null;

    public const SENDERS = ['buyer', 'admin', 'system'];

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['conversation_id' => 'integer', 'user_id' => 'integer', 'admin_id' => 'integer', 'created_at' => 'datetime'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(Admin::class);
    }
}
