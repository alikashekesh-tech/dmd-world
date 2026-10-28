<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->isOwner() ? 'owner' : 'staff', // staff can't change store settings or manage staff
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            // The store's time zone: the admin shows and picks schedule times in it (stored in UTC).
            'store_timezone' => config('dmd.timezone'),
        ];
    }
}
