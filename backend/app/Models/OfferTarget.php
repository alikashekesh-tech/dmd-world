<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A product or category an offer covers (a category covers everything below it). */
class OfferTarget extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['offer_id' => 'integer', 'target_id' => 'integer'];
    }
}
