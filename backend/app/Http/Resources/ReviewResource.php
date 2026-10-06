<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** An approved review as anyone sees it on a product page: no email, no account id. Text is plain, never HTML. */
class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'rating' => $this->rating,
            'title' => $this->title,
            'body' => $this->body,
            'author' => $this->author_name,
            'verified_purchase' => $this->is_verified_purchase,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
