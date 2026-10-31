<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** One WhatsApp/SMS text the store tried to send, and what became of it (sent, failed, not_configured). */
class OutboundMessage extends Model
{
    protected $guarded = ['*'];

    public function about(): MorphTo
    {
        return $this->morphTo();
    }
}
