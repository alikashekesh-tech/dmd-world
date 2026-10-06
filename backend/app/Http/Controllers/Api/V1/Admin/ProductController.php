<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ProductRequest;
use App\Http\Resources\Admin\ProductResource;
use App\Models\Product;
use App\Services\CategoryTree;
use App\Services\ProductQuery;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** The owner's product management. Writes go through ProductService; the storefront reads the same rows. */
class ProductController extends Controller
{
    public function __construct(private ProductService $products) {}

    /** ?q=&status=draft|published&category=&brand=&stock=out|low|in|untracked&featured=1&on_sale=1&archived=only|with&sort=&per_page= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'q' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'in:draft,published'], 'category' => ['nullable', 'integer'],
            'brand' => ['nullable', 'integer'], 'stock' => ['nullable', 'in:out,low,in,untracked'], 'featured' => ['nullable', 'boolean'],
            'on_sale' => ['nullable', 'boolean'], 'archived' => ['nullable', 'in:only,with'],
            'sort' => ['nullable', 'in:updated,newest,name,price_asc,price_desc,stock,best'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $tree = ProductResource::$tree = CategoryTree::load(true);
        $q = Product::query()->with(['images:id,product_id,url,alt,position', 'categories:id,name,parent_id,brand_id,slug', 'brand:id,name']);
        match ($v['archived'] ?? null) {
            'only' => $q->onlyTrashed(),
            'with' => $q->withTrashed(),
            default => null,
        };
        if (! empty($v['q'])) {
            ProductQuery::search($q, $v['q']);
        }
        if (! empty($v['status'])) {
            $q->where('status', $v['status']);
        }
        if (! empty($v['category'])) {
            ProductQuery::inCategory($q, (int) $v['category'], $tree);
        }
        if (! empty($v['brand'])) {
            $q->where('brand_id', $v['brand']);
        }
        if (! empty($v['stock'])) {
            ProductQuery::stockLevel($q, $v['stock']);
        }
        if ($request->boolean('featured')) {
            $q->where('is_featured', true);
        }
        if ($request->boolean('on_sale')) {
            ProductQuery::onSale($q);
        }
        ProductQuery::sort($q, $v['sort'] ?? 'updated');

        $counts = Product::query()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return ProductResource::collection($q->paginate($v['per_page'] ?? 25)->withQueryString())->additional(['meta' => [
            'counts' => ['all' => (int) $counts->sum(), 'published' => (int) ($counts['published'] ?? 0), 'draft' => (int) ($counts['draft'] ?? 0), 'archived' => Product::onlyTrashed()->count()],
        ]]);
    }

    public function show(Product $product): ProductResource
    {
        return $this->detail($product);
    }

    public function store(ProductRequest $request): JsonResponse
    {
        return $this->detail($this->products->create($request->validated(), $request->user('admin')))->response()->setStatusCode(201);
    }

    public function update(ProductRequest $request, Product $product): ProductResource
    {
        return $this->detail($this->products->update($product, $request->validated(), $request->user('admin')));
    }

    /** Archive (soft delete): off the storefront, restorable. */
    public function destroy(Request $request, Product $product): Response
    {
        $this->products->archive($product, $request->user('admin'));

        return response()->noContent();
    }

    public function restore(Request $request, int $id): ProductResource
    {
        return $this->detail($this->products->restore(Product::onlyTrashed()->findOrFail($id), $request->user('admin')));
    }

    public function forceDestroy(Request $request, int $id): Response
    {
        $this->products->destroy(Product::withTrashed()->findOrFail($id), $request->user('admin'));

        return response()->noContent();
    }

    public function bulk(Request $request): JsonResponse
    {
        $v = $request->validate([
            'action' => ['required', Rule::in(['publish', 'unpublish', 'feature', 'unfeature', 'archive', 'restore'])],
            'ids' => ['required', 'array', 'min:1', 'max:200'], 'ids.*' => ['integer', 'distinct'],
        ]);

        return response()->json(['count' => $this->products->bulk($v['action'], $v['ids'], $request->user('admin'))]);
    }

    private function detail(Product $product): ProductResource
    {
        ProductResource::$tree = CategoryTree::load(true);

        return new ProductResource($product->load(['images', 'categories:id,name,parent_id,brand_id,slug', 'specifications', 'brand:id,name']));
    }
}
