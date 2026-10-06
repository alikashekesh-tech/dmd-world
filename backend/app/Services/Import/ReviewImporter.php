<?php

namespace App\Services\Import;

use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use App\Support\Text;
use Illuminate\Support\Carbon;

/**
 * The old store's product reviews: same ids, ratings, approval state and dates. WooCommerce keeps the title inside
 * the text as "<strong>Title</strong>"; it becomes the title again, and the rest becomes plain text. A reviewer
 * whose email matches an imported customer is linked to that account (so it's "their" review); others keep their
 * email for the owner only. Run after products and customers; running it again updates the same reviews.
 */
final class ReviewImporter
{
    private const STATUS = ['approved' => 'approved', 'hold' => 'pending', 'spam' => 'spam', 'trash' => 'rejected'];

    private array $stats = ['reviews' => 0, 'linked to accounts' => 0, 'skipped' => 0];

    /** @var list<string> */
    public array $warnings = [];

    public function import(array $wooReviews): array
    {
        $products = Product::withTrashed()->pluck('id')->flip();
        $users = User::pluck('id', 'email');
        $taken = Review::whereNotNull('user_id')->get(['id', 'user_id', 'product_id'])->mapWithKeys(fn ($r) => ["{$r->user_id}:{$r->product_id}" => $r->id]);

        foreach ($wooReviews as $w) {
            $id = (int) ($w['id'] ?? 0);
            $productId = (int) ($w['product_id'] ?? 0);
            $status = self::STATUS[$w['status'] ?? ''] ?? null;
            $rating = (int) ($w['rating'] ?? 0);
            if (! $id || ! $status || ! $products->has($productId) || $rating < 1 || $rating > 5) {
                $this->skip($id, ! $products->has($productId) ? 'its product wasn’t imported' : 'no rating or unknown status');

                continue;
            }
            ['title' => $title, 'body' => $body] = self::split((string) ($w['review'] ?? ''));
            if ($body === '') {
                $this->skip($id, 'empty text');

                continue;
            }
            $email = User::normalizeEmail($w['reviewer_email'] ?? '');
            $userId = $users[$email] ?? null;
            // One review per buyer per product: a second one from the same account stays with its email only.
            if ($userId && ($taken["{$userId}:{$productId}"] ?? $id) !== $id) {
                $this->warnings[] = "Review {$id}: the same customer already reviewed this product; kept unlinked";
                $userId = null;
            }
            $created = Carbon::parse($w['date_created_gmt'] ?? $w['date_created'] ?? 'now', 'UTC');

            $review = Review::find($id) ?? new Review;
            $review->timestamps = false;
            $review->forceFill([
                'id' => $id,
                'product_id' => $productId,
                'user_id' => $userId,
                'author_name' => Text::line(Text::plain($w['reviewer'] ?? ''), 80) ?: 'DMD buyer',
                'author_email' => $userId ? null : ($email ?: null),
                'rating' => $rating,
                'title' => $title,
                'body' => $body,
                'status' => $status,
                'is_verified_purchase' => (bool) ($w['verified'] ?? false),
                'created_at' => $created,
                'updated_at' => $created,
            ])->save();
            $review->timestamps = true;
            if ($userId) {
                $taken["{$userId}:{$productId}"] = $id;
                $this->stats['linked to accounts']++;
            }
            $this->stats['reviews']++;
        }

        return $this->stats;
    }

    /** "<strong>Title</strong>\n\nText" (how the old storefront saved them) → title and plain text. */
    public static function split(string $html): array
    {
        if (preg_match('/^\s*(?:<p>\s*)?<strong>(.*?)<\/strong>\s*(?:<br\s*\/?>|<\/p>)?/is', $html, $m)) {
            $title = Text::line(Text::plain($m[1]), 120);

            return ['title' => $title !== '' ? $title : null, 'body' => Text::multiline(Text::plain(substr($html, strlen($m[0]))), 5000)];
        }

        return ['title' => null, 'body' => Text::multiline(Text::plain($html), 5000)];
    }

    private function skip(int $id, string $why): void
    {
        $this->stats['skipped']++;
        $this->warnings[] = "Skipped review {$id}: {$why}";
    }
}
