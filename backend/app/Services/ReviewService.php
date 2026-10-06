<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * Writing, editing and moderating reviews. A buyer has at most one review per product (a unique index, so two
 * simultaneous submits can't both land). Anything a buyer writes or rewrites waits for the owner before it is shown.
 */
class ReviewService
{
    /** @param array{rating: int, title: string, body: string} $data */
    public function create(User $user, int $productId, array $data): Review
    {
        if (! StoreSettings::get('reviews_enabled')) {
            throw new ApiException(403, 'REVIEWS_DISABLED', 'Reviews are switched off for this store.');
        }
        $product = Product::published()->find($productId);
        if (! $product) {
            throw new ApiException(404, 'NOT_FOUND', 'That product isn’t available.');
        }
        if ($user->reviews()->where('product_id', $product->id)->exists()) {
            throw $this->duplicate();
        }
        $verified = $this->boughtIt($user, $product->id);
        if (! $verified && StoreSettings::get('reviews_require_purchase')) {
            throw new ApiException(403, 'NOT_VERIFIED', 'Only buyers who received this product can review it.');
        }

        try {
            $review = (new Review)->forceFill([
                'product_id' => $product->id, 'user_id' => $user->id, 'author_name' => Review::displayName($user),
                'rating' => $data['rating'], 'title' => $data['title'], 'body' => $data['body'],
                'status' => 'pending', 'is_verified_purchase' => $verified,
            ]);
            $review->save();
        } catch (UniqueConstraintViolationException) {
            throw $this->duplicate(); // the same buyer's other tab got there first
        }
        Activity::record('review.created', "{$review->author_name} reviewed {$product->name} ({$review->rating}★), waiting for approval", $review, null, $user);

        return $review->refresh();
    }

    /** A buyer rewrites their own review. It waits for the owner again (a spam review stays spam). */
    public function update(Review $review, array $data): Review
    {
        $review->forceFill([
            'rating' => $data['rating'], 'title' => $data['title'], 'body' => $data['body'],
            'is_verified_purchase' => $review->user ? $this->boughtIt($review->user, $review->product_id) : $review->is_verified_purchase,
        ]);
        if ($review->isDirty(['rating', 'title', 'body']) && $review->status !== 'spam') {
            $review->forceFill(['status' => 'pending', 'moderated_by' => null, 'moderated_at' => null]);
        }
        $review->save();

        return $review;
    }

    public function moderate(Review $review, string $status, Admin $by): Review
    {
        if ($review->status !== $status) {
            $review->forceFill(['status' => $status, 'moderated_by' => $by->id, 'moderated_at' => now()])->save();
            $verb = ['approved' => 'Approved', 'rejected' => 'Rejected', 'spam' => 'Marked as spam', 'pending' => 'Unpublished'][$status];
            Activity::record('review.'.$status, "{$verb} {$review->author_name}’s review of {$review->product?->name}", $review, $by);
        }

        return $review;
    }

    /** Whether the buyer has a paid order containing the product: that review is marked "Verified purchase". */
    public function boughtIt(User $user, int $productId): bool
    {
        return OrderItem::query()->where('product_id', $productId)
            ->whereHas('order', fn ($q) => $q->where('user_id', $user->id)->whereIn('status', Order::PAID))
            ->exists();
    }

    private function duplicate(): ApiException
    {
        return new ApiException(409, 'ALREADY_REVIEWED', 'You’ve already reviewed this product. You can edit your review instead.');
    }
}
