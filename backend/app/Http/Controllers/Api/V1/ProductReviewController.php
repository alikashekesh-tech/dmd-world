<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReviewResource;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** A product's approved reviews and their summary, for everyone. Pending, rejected and spam reviews never appear. */
class ProductReviewController extends Controller
{
    public function index(Request $request, int $id): AnonymousResourceCollection
    {
        $v = $request->validate([
            'sort' => ['nullable', Rule::in(['newest', 'highest', 'lowest'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $product = Product::published()->findOrFail($id);
        $approved = Review::approved()->where('product_id', $product->id);

        $byStars = (clone $approved)->selectRaw('rating, COUNT(*) AS n, SUM(is_verified_purchase) AS verified')->groupBy('rating')->get()->keyBy('rating');
        $count = (int) $byStars->sum('n');
        $sum = $byStars->sum(fn ($row) => $row->rating * $row->n);

        $page = match ($v['sort'] ?? 'newest') {
            'highest' => $approved->orderByDesc('rating')->latest('id'),
            'lowest' => $approved->orderBy('rating')->latest('id'),
            default => $approved->latest('created_at')->latest('id'),
        };

        return ReviewResource::collection($page->paginate($v['per_page'] ?? 10)->withQueryString())->additional(['meta' => ['summary' => [
            'average' => $count ? round($sum / $count, 1) : 0,
            'count' => $count,
            'verified' => (int) $byStars->sum('verified'),
            'breakdown' => array_map(fn ($stars) => ['stars' => $stars, 'count' => (int) ($byStars[$stars]->n ?? 0)], [5, 4, 3, 2, 1]),
        ]]]);
    }
}
