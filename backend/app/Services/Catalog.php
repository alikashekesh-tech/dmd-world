<?php

namespace App\Services;

use App\Http\Resources\BrandResource;
use App\Http\Resources\CategoryResource;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\Product;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The storefront's whole catalog in one response (products, categories, brands), so browsing, filtering and search
 * are instant in the browser. It is built from MySQL and cached briefly; any write to a product, image, category
 * or brand clears the cache, so the storefront shows the change on its next request. A browser keeps it only as a
 * cache with an ETag, never as the source of truth.
 */
final class Catalog
{
    /** Short, so prices follow sale start and end dates even when nothing is written. */
    private const TTL = 60;

    /** Called by model events. Runs after the surrounding transaction commits, so a request can't re-cache old data. */
    public static function bust(): void
    {
        DB::afterCommit(fn () => Cache::forever('catalog:version', (string) hrtime(true)));
    }

    /** @return array{body: string, etag: string} */
    public static function payload(): array
    {
        $version = Cache::get('catalog:version', '0');

        return Cache::remember("catalog:{$version}", self::TTL, function () {
            $tree = CategoryTree::load();
            $products = Product::published()
                ->with(['images:id,product_id,url,position', 'categories:id'])
                ->withUnitsSold()
                ->orderByDesc('published_at')->orderByDesc('id')
                ->get();

            $body = json_encode([
                'generated_at' => now()->toIso8601String(),
                'products' => ProductResource::collection($products)->resolve(),
                'categories' => CategoryResource::list($tree->visible(), $tree),
                'brands' => BrandResource::collection(Brand::onStorefront()->orderBy('position')->orderBy('name')->get())->resolve(),
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            return ['body' => $body, 'etag' => '"'.substr(sha1($body), 0, 32).'"'];
        });
    }
}
