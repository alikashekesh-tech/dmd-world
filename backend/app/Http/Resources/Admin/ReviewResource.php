<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A review for moderation: everything, including who wrote it and who moderated it. */
class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product' => $this->whenLoaded('product', fn () => $this->product ? ['id' => $this->product->id, 'name' => $this->product->name, 'available' => $this->product->isPublished(),
                'image' => $this->product->relationLoaded('images') ? $this->product->images->first()?->url : null] : null),
            'customer' => $this->whenLoaded('user', fn () => $this->user ? ['id' => $this->user->id, 'name' => $this->user->fullName(), 'email' => $this->user->email] : null),
            'author' => $this->author_name,
            'author_email' => $this->user_id ? null : $this->author_email,
            'rating' => $this->rating,
            'title' => $this->title,
            'body' => $this->body,
            'status' => $this->status,
            'verified_purchase' => $this->is_verified_purchase,
            'moderated_by' => $this->whenLoaded('moderator', fn () => $this->moderator?->name),
            'moderated_at' => $this->moderated_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
