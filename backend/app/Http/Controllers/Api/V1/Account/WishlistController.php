<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * The signed-in buyer's wishlist, kept in MySQL (wishlist_items) so it follows them to every device. Saving twice
 * is harmless (one row per product). A product the owner hides or archives drops out of the list but isn't
 * forgotten: it comes back if the product returns. A deleted product is removed with it.
 */
class WishlistController extends Controller
{
    public const MAX = 200;

    public function index(Request $request): JsonResponse
    {
        $products = $request->user()->wishlist()->published()
            ->with(['images:id,product_id,url,position', 'categories:id'])
            ->orderByPivot('created_at', 'desc')->get();

        return response()->json([
            'data' => ProductResource::collection($products)->resolve(),
            'meta' => ['ids' => $products->pluck('id')->values()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $id = (int) $request->validate(['product_id' => ['required', 'integer', 'min:1']])['product_id'];
        if (! Product::published()->whereKey($id)->exists()) {
            throw new ApiException(404, 'NOT_FOUND', 'That product isn’t available.');
        }
        $user = $request->user();
        if (! $user->wishlist()->whereKey($id)->exists() && $user->wishlist()->count() >= self::MAX) {
            throw new ApiException(422, 'WISHLIST_FULL', 'Your wishlist can hold '.self::MAX.' products. Remove one first.');
        }
        $added = DB::table('wishlist_items')->insertOrIgnore(['user_id' => $user->id, 'product_id' => $id, 'created_at' => now()]);

        return response()->json(['added' => $added === 1, 'ids' => $this->ids($request)], $added === 1 ? 201 : 200);
    }

    public function destroy(Request $request, int $productId): Response
    {
        $request->user()->wishlist()->detach($productId);

        return response()->noContent();
    }

    /** Brings a guest's wishlist from this device into the account (on sign-in). Unknown or hidden products are skipped. */
    public function merge(Request $request): JsonResponse
    {
        $ids = $request->validate(['product_ids' => ['present', 'array', 'max:'.self::MAX], 'product_ids.*' => ['integer', 'min:1']])['product_ids'];
        $user = $request->user();
        $room = max(0, self::MAX - $user->wishlist()->count());
        $valid = Product::published()->whereIn('id', array_unique($ids))->limit($room)->pluck('id');
        DB::table('wishlist_items')->insertOrIgnore($valid->map(fn ($id) => ['user_id' => $user->id, 'product_id' => $id, 'created_at' => now()])->all());

        return response()->json(['ids' => $this->ids($request)]);
    }

    /** @return list<int> */
    private function ids(Request $request): array
    {
        return $request->user()->wishlist()->published()->orderByPivot('created_at', 'desc')->pluck('products.id')->all();
    }
}
