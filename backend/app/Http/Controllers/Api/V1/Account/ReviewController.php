<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Http\Controllers\Controller;
use App\Http\Requests\Account\ReviewRequest;
use App\Http\Resources\Account\ReviewResource;
use App\Services\ReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/** The signed-in buyer's own reviews. Another buyer's review is never found (404), whatever id is sent. */
class ReviewController extends Controller
{
    public function __construct(private ReviewService $reviews) {}

    /** ?product= narrows to one product (the product page asks whether you've reviewed it). */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate(['product' => ['nullable', 'integer', 'min:1']]);
        $mine = $request->user()->reviews()->with(['product' => fn ($q) => $q->select('id', 'name', 'status', 'deleted_at'), 'product.images:id,product_id,url,position'])
            ->when($v['product'] ?? null, fn ($q, $id) => $q->where('product_id', $id))
            ->latest('updated_at')->latest('id')->get();

        return ReviewResource::collection($mine);
    }

    public function store(ReviewRequest $request): JsonResponse
    {
        $review = $this->reviews->create($request->user(), (int) $request->validated('product_id'), $request->review());

        return (new ReviewResource($review->load('product')))->response()->setStatusCode(201);
    }

    public function update(ReviewRequest $request, int $id): ReviewResource
    {
        $review = $request->user()->reviews()->findOrFail($id);

        return new ReviewResource($this->reviews->update($review, $request->review())->load('product'));
    }

    public function destroy(Request $request, int $id): Response
    {
        $request->user()->reviews()->findOrFail($id)->delete();

        return response()->noContent();
    }
}
