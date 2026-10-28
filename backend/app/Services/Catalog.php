<?php

namespace App\Services;

use App\Http\Resources\BrandResource;
use App\Http\Resources\CategoryResource;
use App\Http\Resources\ProductResource;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The storefront's whole catalog in one response (products, categories, brands, the home page and the public store
 * settings), so browsing, filtering and search are instant in the browser. It is built from MySQL and cached
 * briefly; any write to a product, image, category, brand, review, offer, banner or setting clears the cache, so the
 * storefront shows the change on its next request. A browser keeps it only as a cache with an ETag, never as the
 * source of truth.
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

    /**
     * Seconds the cached catalog may live: the usual TTL, or less when a banner starts or ends sooner, so banners
     * appear and disappear on time rather than up to a minute late. Worked out only when the catalog is rebuilt.
     */
    private static function ttl(): int
    {
        $now = now();
        $next = collect([
            Banner::query()->where('is_active', true)->where('starts_at', '>', $now)->min('starts_at'),
            Banner::query()->where('is_active', true)->where('ends_at', '>', $now)->min('ends_at'),
        ])->filter()->map(fn ($at) => (int) ceil($now->diffInSeconds(Carbon::parse($at, 'UTC'))))->min();

        return max(1, min(self::TTL, $next ?? self::TTL));
    }

    /** @return array{body: string, etag: string} */
    public static function payload(): array
    {
        $version = Cache::get('catalog:version', '0');

        return Cache::remember("catalog:{$version}", fn () => self::ttl(), function () {
            $tree = CategoryTree::load();
            $products = Product::published()
                ->with(['images:id,product_id,url,position', 'categories:id', 'variants'])
                ->withUnitsSold()
                ->withRating()
                ->orderByDesc('published_at')->orderByDesc('id')
                ->get();

            $body = json_encode([
                'generated_at' => now()->toIso8601String(),
                'products' => ProductResource::collection($products)->resolve(),
                'categories' => CategoryResource::list($tree->visible(), $tree),
                'brands' => BrandResource::collection(Brand::onStorefront()->orderBy('position')->orderBy('name')->get())->resolve(),
                'homepage' => Homepage::payload(),
                'store' => StoreSettings::publicValues(),
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            return ['body' => $body, 'etag' => '"'.substr(sha1($body), 0, 32).'"'];
        });
    }
}
