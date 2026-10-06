<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One of a buyer's saved delivery addresses. Always reached through the signed-in buyer ($user->addresses()). */
#[Fillable(['label', 'first_name', 'last_name', 'phone', 'country', 'city', 'area', 'street', 'building', 'floor', 'notes'])]
#[Hidden(['default_for'])]
class Address extends Model
{
    use HasFactory;

    public const MAX_PER_BUYER = 10;

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'user_id' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** One line for lists and order confirmations. */
    public function oneLine(): string
    {
        return implode(', ', array_filter([$this->street, $this->building ? "Bldg {$this->building}" : null, $this->floor ? "Floor {$this->floor}" : null, $this->area, $this->city]));
    }
}
