<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A hand-picked product or category for a home page section, in order. */
class HomepageItem extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['item_id' => 'integer', 'position' => 'integer'];
    }
}
