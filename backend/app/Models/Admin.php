<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Foundation\Auth\User as Authenticatable;

/** The store owner: the only account that can use /api/v1/admin. There is exactly one (see the admins migration). */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'singleton'])]
class Admin extends Authenticatable
{
    protected function casts(): array
    {
        return [
            'last_login_at' => 'datetime',
            'notifications_seen_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public static function owner(): ?self
    {
        return static::query()->first();
    }
}
