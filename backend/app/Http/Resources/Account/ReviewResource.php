<?php

namespace App\Http\Resources\Account;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** One of the signed-in buyer's own reviews, with its moderation status. */
class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $product = $this->relationLoaded('product') ? $this->product : null;

        return [
            'id' => $this->id,
            'product_id' => $this->product_id,
            'product' => $product ? [
                'id' => $product->id, 'name' => $product->name,
                'image' => $product->relationLoaded('images') ? $product->images->first()?->url : null,
                'available' => $product->isPublished(),
            ] : null,
            'rating' => $this->rating,
            'title' => $this->title,
            'body' => $this->body,
            'author' => $this->author_name,
            'status' => $this->status,
            'verified_purchase' => $this->is_verified_purchase,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
