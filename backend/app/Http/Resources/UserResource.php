<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A buyer as the buyer sees themself. Never includes the password hash or remember token. */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'email_verified' => $this->email_verified_at !== null,
            'marketing_opt_in' => (bool) $this->marketing_opt_in,
            'member_since' => $this->created_at?->toIso8601String(),
        ];
    }
}
