<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One stored store setting (JSON value). Read through App\Services\StoreSettings, which applies the defaults. */
class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['value' => 'json'];
    }
}
