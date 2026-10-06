<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ProductResource;
use App\Models\Activity;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Services\Inventory;
use App\Services\ProductQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/** Stock screen: levels, stocktakes and adjustments, and the history behind every number. */
class InventoryController extends Controller
{
    public function __construct(private Inventory $inventory) {}

    /** ?level=out|low|in|untracked&q=: sold-out first, then running low. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate(['level' => ['nullable', 'in:out,low,in,untracked'], 'q' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $q = Product::query()->with(['images:id,product_id,url,alt,position', 'brand:id,name'])
            ->withCount(['stockAlerts as waiting' => fn ($a) => $a->whereNull('notified_at')]);
        if (! empty($v['level'])) {
            ProductQuery::stockLevel($q, $v['level']);
        }
        if (! empty($v['q'])) {
            ProductQuery::search($q, $v['q']);
        }
        $q->orderByRaw('CASE WHEN track_stock = 0 THEN 3 WHEN stock_quantity <= 0 THEN 0 ELSE 1 END')->orderBy('stock_quantity')->orderBy('name');

        $counts = [];
        foreach (['out', 'low', 'in', 'untracked'] as $level) {
            $counts[$level] = tap(Product::query(), fn ($c) => ProductQuery::stockLevel($c, $level))->count();
        }

        return ProductResource::collection($q->paginate($v['per_page'] ?? 30)->withQueryString())->additional(['meta' => ['counts' => $counts]]);
    }

    /**
     * { stock_quantity } sets an exact count (stocktake); { adjust } adds or removes (restock: +5, damaged: -1);
     * { track_stock, low_stock_threshold, stock_status } change how the product is stocked. { note } explains why.
     */
    public function update(Request $request, Product $product): ProductResource
    {
        $v = $request->validate([
            'stock_quantity' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'adjust' => ['sometimes', 'integer', 'between:-1000000,1000000', 'not_in:0'],
            'reason' => ['sometimes', 'in:adjustment,restock'],
            'track_stock' => ['sometimes', 'boolean'],
            'low_stock_threshold' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000'],
            'stock_status' => ['sometimes', 'in:in_stock,out_of_stock'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        if (isset($v['stock_quantity'], $v['adjust'])) {
            throw new ApiException(422, 'ONE_CHANGE', 'Either set the stock or adjust it, not both.');
        }
        $admin = $request->user('admin');

        DB::transaction(function () use ($v, $product, $admin) {
            $settings = array_intersect_key($v, array_flip(['track_stock', 'low_stock_threshold', 'stock_status']));
            if ($settings) {
                $product->forceFill($settings)->save();
                Activity::record('stock.settings', "Changed how {$product->name} is stocked", $product, $admin);
            }
            if (isset($v['stock_quantity'])) {
                $this->inventory->set($product, $v['stock_quantity'], 'adjustment', $admin, $v['note'] ?? null);
            } elseif (isset($v['adjust'])) {
                $this->inventory->adjust($product, $v['adjust'], $v['reason'] ?? ($v['adjust'] > 0 ? 'restock' : 'adjustment'), $admin, $v['note'] ?? null);
            }
        });

        return new ProductResource($product->refresh()->load(['images:id,product_id,url,alt,position', 'brand:id,name']));
    }

    public function movements(Request $request, Product $product): JsonResponse
    {
        $page = InventoryMovement::where('product_id', $product->id)->with('admin:id,name')->latest('id')->paginate(min(100, (int) $request->query('per_page', 30)));

        return response()->json([
            'data' => $page->getCollection()->map(fn (InventoryMovement $m) => [
                'id' => $m->id, 'change' => $m->quantity_change, 'after' => $m->quantity_after, 'reason' => $m->reason,
                'order_id' => $m->order_id, 'by' => $m->admin?->name, 'note' => $m->note, 'at' => $m->created_at?->toIso8601String(),
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }
}
