<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ReviewResource;
use App\Models\Activity;
use App\Models\Review;
use App\Services\ReviewService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** Review moderation: approve, reject, mark as spam, put back to pending, or delete for good. */
class ReviewController extends Controller
{
    public function __construct(private ReviewService $reviews) {}

    /** ?status=&q=(title, text, author, product)&product=&rating=&per_page= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'status' => ['nullable', Rule::in(Review::STATUSES)], 'q' => ['nullable', 'string', 'max:100'],
            'product' => ['nullable', 'integer'], 'rating' => ['nullable', 'integer', 'between:1,5'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = Review::query()->with(['product:id,name,status,deleted_at', 'product.images:id,product_id,url,position', 'user:id,first_name,last_name,email', 'moderator:id,name'])->latest('created_at')->latest('id');
        $q->when($v['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($v['product'] ?? null, fn ($q, $id) => $q->where('product_id', $id))
            ->when($v['rating'] ?? null, fn ($q, $r) => $q->where('rating', $r));
        if (! empty($v['q'])) {
            $like = '%'.addcslashes(trim($v['q']), '%_\\').'%';
            $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('body', 'like', $like)->orWhere('author_name', 'like', $like)
                ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $like)));
        }
        $counts = Review::query()->selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');

        return ReviewResource::collection($q->paginate($v['per_page'] ?? 20)->withQueryString())->additional(['meta' => [
            'counts' => collect(Review::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)])->put('all', (int) $counts->sum()),
        ]]);
    }

    public function show(Review $review): ReviewResource
    {
        return new ReviewResource($review->load(['product', 'user', 'moderator']));
    }

    public function update(Request $request, Review $review): ReviewResource
    {
        $v = $request->validate(['status' => ['required', Rule::in(Review::STATUSES)]]);
        $this->reviews->moderate($review, $v['status'], $request->user('admin'));

        return new ReviewResource($review->load(['product', 'user', 'moderator']));
    }

    public function destroy(Request $request, Review $review): Response
    {
        Activity::record('review.deleted', "Deleted {$review->author_name}’s review of {$review->product?->name}", null, $request->user('admin'));
        $review->delete();

        return response()->noContent();
    }
}
