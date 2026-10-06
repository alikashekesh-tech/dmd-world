<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BrandRequest;
use App\Http\Requests\Admin\ReorderRequest;
use App\Http\Resources\Admin\BrandResource;
use App\Models\Brand;
use App\Models\Order;
use App\Models\Product;
use App\Services\BrandService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** The owner's brand management. Writes go through BrandService; the storefront reads the same rows. */
class BrandController extends Controller
{
    public function __construct(private BrandService $brands) {}

    /** ?archived=only lists the archive; ?archived=with lists everything. */
    public function index(Request $request): JsonResponse
    {
        $query = Brand::query()->withCount('categories')->orderBy('position')->orderBy('name');
        match ($request->query('archived')) {
            'only' => $query->onlyTrashed(),
            'with' => $query->withTrashed(),
            default => null,
        };

        // Products of each brand and what they sold in the last 90 days (paid orders): two grouped queries.
        $products = Product::query()->whereNotNull('brand_id')->groupBy('brand_id')->selectRaw('brand_id, COUNT(*) AS n')->pluck('n', 'brand_id');
        $sales = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')->join('products', 'products.id', '=', 'order_items.product_id')
            ->whereIn('orders.status', Order::PAID)->where('orders.placed_at', '>=', now()->subDays(90))->whereNotNull('products.brand_id')
            ->groupBy('products.brand_id')->selectRaw('products.brand_id, SUM(order_items.quantity) AS units, SUM(order_items.line_total) AS revenue')->get()->keyBy('brand_id');
        $list = BrandResource::collection($query->get())->resolve();

        return response()->json(['data' => array_map(fn ($b) => $b + [
            'products_count' => (int) ($products[$b['id']] ?? 0),
            'units_90d' => (int) ($sales[$b['id']]->units ?? 0),
            'revenue_90d' => Money::json(Money::cents($sales[$b['id']]->revenue ?? 0)),
        ], $list), 'meta' => ['total' => Brand::count(), 'archived' => Brand::onlyTrashed()->count()]]);
    }

    public function show(Brand $brand): BrandResource
    {
        return new BrandResource($brand->loadCount('categories'));
    }

    public function store(BrandRequest $request): JsonResponse
    {
        return (new BrandResource($this->brands->create($request->validated(), $request->user('admin'))->loadCount('categories')))->response()->setStatusCode(201);
    }

    public function update(BrandRequest $request, Brand $brand): BrandResource
    {
        return new BrandResource($this->brands->update($brand, $request->validated(), $request->user('admin'))->loadCount('categories'));
    }

    public function destroy(Request $request, Brand $brand): Response
    {
        $this->brands->archive($brand, $request->user('admin'));

        return response()->noContent();
    }

    public function restore(Request $request, int $id): BrandResource
    {
        return new BrandResource($this->brands->restore(Brand::onlyTrashed()->findOrFail($id), $request->user('admin'))->loadCount('categories'));
    }

    public function forceDestroy(Request $request, int $id): Response
    {
        $this->brands->destroy(Brand::withTrashed()->findOrFail($id), $request->user('admin'));

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request): Response
    {
        $this->brands->reorder($request->validated('ids'), $request->user('admin'));

        return response()->noContent();
    }
}
