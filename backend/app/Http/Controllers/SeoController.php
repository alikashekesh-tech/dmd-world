<?php

namespace App\Http\Controllers;

use App\Models\Brand;
use App\Models\Product;
use App\Services\CategoryTree;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

/**
 * robots.txt and sitemap.xml for the storefront, built from MySQL: the fixed pages, every category, brand and
 * product on the storefront. Served at the site root (Caddy and the Vite dev server send these two paths here).
 */
class SeoController extends Controller
{
    private const PAGES = ['/', '/shop', '/categories', '/brands', '/contact', '/product-category/new-offers'];

    public function robots(): Response
    {
        $site = config('dmd.frontend_url');
        $body = implode("\n", ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /account', 'Disallow: /checkout',
            'Disallow: /cart', 'Disallow: /order/', "Sitemap: {$site}/sitemap.xml", '']);

        return response($body, 200, ['Content-Type' => 'text/plain; charset=utf-8', 'Cache-Control' => 'public, max-age=3600']);
    }

    public function sitemap(): Response
    {
        // Rebuilt when the catalog changes (same version key as the storefront catalog), at most every 10 minutes.
        $body = Cache::remember('sitemap:'.Cache::get('catalog:version', '0'), 600, function () {
            $site = config('dmd.frontend_url');
            $tree = CategoryTree::load();
            $paths = [
                ...self::PAGES,
                ...$tree->visible()->map(fn ($c) => '/product-category/'.$tree->path($c->id))->all(),
                ...Brand::onStorefront()->pluck('slug')->map(fn ($s) => "/product-category/{$s}")->all(),
            ];
            $urls = array_map(fn ($p) => '  <url><loc>'.e($site.$p).'</loc></url>', array_values(array_unique($paths)));
            foreach (Product::published()->orderBy('id')->get(['id', 'updated_at']) as $p) {
                $urls[] = '  <url><loc>'.e("{$site}/product/{$p->id}").'</loc><lastmod>'.$p->updated_at?->toDateString().'</lastmod></url>';
            }

            return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n".implode("\n", $urls)."\n</urlset>\n";
        });

        return response($body, 200, ['Content-Type' => 'application/xml; charset=utf-8', 'Cache-Control' => 'public, max-age=600']);
    }
}
