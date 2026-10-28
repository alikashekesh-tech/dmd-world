<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * Someone who can sign in to /api/v1/admin: the store owner (exactly one, `singleton` = 1, see the admins migrations)
 * or a member of staff the owner added (`singleton` NULL). Staff can run the shop; only the owner can change the
 * store settings and manage staff.
 */
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
        return static::query()->where('singleton', 1)->first();
    }

    public function isOwner(): bool
    {
        return (int) $this->singleton === 1;
    }

    public function scopeStaff(Builder $query): void
    {
        $query->whereNull('singleton');
    }
}
