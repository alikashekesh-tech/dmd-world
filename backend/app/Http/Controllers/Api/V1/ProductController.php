<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductDetailResource;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\Product;
use App\Services\Catalog;
use App\Services\CategoryTree;
use App\Services\ProductQuery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/** The storefront's products: published, not archived. */
class ProductController extends Controller
{
    /**
     * GET /products?category=&category_path=&brand=&q=&min_price=&max_price=&in_stock=1&on_sale=1&featured=1&ids=1,2&sort=&per_page=
     * sort: newest (default) | price_asc | price_desc | name | featured | best
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'category' => ['nullable', 'integer'], 'category_path' => ['nullable', 'string', 'max:300'], 'brand' => ['nullable', 'string', 'max:80'],
            'q' => ['nullable', 'string', 'max:100'], 'min_price' => ['nullable', 'numeric', 'min:0'], 'max_price' => ['nullable', 'numeric', 'min:0'],
            'in_stock' => ['nullable', 'boolean'], 'on_sale' => ['nullable', 'boolean'], 'featured' => ['nullable', 'boolean'],
            'ids' => ['nullable', 'string', 'max:2000', 'regex:/^\d+(,\d+)*$/'], 'sort' => ['nullable', 'in:newest,price_asc,price_desc,name,featured,best,rated'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = Product::published()->with(['images:id,product_id,url,position', 'categories:id'])->withRating();
        $tree = null;

        if (! empty($v['category']) || ! empty($v['category_path'])) {
            $tree = CategoryTree::load();
            $category = ! empty($v['category']) ? ($tree->isVisible((int) $v['category']) ? $tree->categories->get((int) $v['category']) : null) : $tree->resolve($v['category_path']);
            if (! $category) {
                throw new ApiException(404, 'NOT_FOUND', 'Category not found.');
            }
            ProductQuery::inCategory($q, $category->id, $tree);
        }
        if (! empty($v['brand'])) {
            $brand = Brand::onStorefront()->where(ctype_digit($v['brand']) ? 'id' : 'slug', $v['brand'])->first();
            if (! $brand) {
                throw new ApiException(404, 'NOT_FOUND', 'Brand not found.');
            }
            $q->where('brand_id', $brand->id);
        }
        if (! empty($v['q'])) {
            ProductQuery::search($q, $v['q']);
        }
        if (! empty($v['ids'])) {
            $q->whereIn('id', array_slice(array_map('intval', explode(',', $v['ids'])), 0, 200));
        }
        ProductQuery::priceBetween($q, isset($v['min_price']) ? (float) $v['min_price'] : null, isset($v['max_price']) ? (float) $v['max_price'] : null);
        if ($request->boolean('in_stock')) {
            ProductQuery::inStock($q);
        }
        if ($request->boolean('on_sale')) {
            ProductQuery::onSale($q);
        }
        if ($request->boolean('featured')) {
            $q->where('is_featured', true);
        }
        ProductQuery::sort($q, $v['sort'] ?? null);

        return ProductResource::collection($q->paginate($v['per_page'] ?? 24)->withQueryString());
    }

    public function show(int $id): ProductDetailResource
    {
        $product = Product::published()->with(['images', 'categories:id', 'specifications', 'brand'])->withRating()->find($id);
        if (! $product) {
            throw new ApiException(404, 'NOT_FOUND', 'Product not found.');
        }

        return new ProductDetailResource($product);
    }

    /** The whole storefront catalog in one cached response, with an ETag so unchanged copies cost a 304. */
    public function catalog(Request $request): Response
    {
        ['body' => $body, 'etag' => $etag] = Catalog::payload();
        $headers = ['Content-Type' => 'application/json', 'ETag' => $etag, 'Cache-Control' => 'public, no-cache'];
        if ($request->headers->get('If-None-Match') === $etag) {
            return response('', 304, $headers);
        }

        return response($body, 200, $headers);
    }
}
