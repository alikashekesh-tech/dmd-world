<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Product;
use App\Services\Coupons;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Http\JsonResponse;

/**
 * Everything the owner archived or put in the trash, from every section, for one screen. Restoring and deleting for
 * good use each section's own endpoints (/products/{id}/restore, /coupons/{id}/permanent…). Orders are never
 * deleted: they're the store's history (cancel one instead).
 */
class TrashController extends Controller
{
    public function index(Coupons $coupons): JsonResponse
    {
        return response()->json(['data' => [
            'products' => Product::onlyTrashed()->with('images:id,product_id,url,position')->latest('deleted_at')->limit(200)->get()->map(fn (Product $p) => [
                'id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'price' => Money::json(Pricing::forProduct($p)['price']),
                'image' => $p->images->first()?->url, 'archived_at' => $p->deleted_at?->toIso8601String(),
            ])->all(),
            'categories' => Category::onlyTrashed()->latest('deleted_at')->limit(200)->get(['id', 'name', 'slug', 'parent_id', 'deleted_at'])->map(fn (Category $c) => [
                'id' => $c->id, 'name' => $c->name, 'slug' => $c->slug, 'archived_at' => $c->deleted_at?->toIso8601String(),
            ])->all(),
            'brands' => Brand::onlyTrashed()->latest('deleted_at')->limit(200)->get(['id', 'name', 'slug', 'logo_url', 'deleted_at'])->map(fn (Brand $b) => [
                'id' => $b->id, 'name' => $b->name, 'slug' => $b->slug, 'image' => $b->logo_url, 'archived_at' => $b->deleted_at?->toIso8601String(),
            ])->all(),
            'coupons' => Coupon::onlyTrashed()->latest('deleted_at')->limit(200)->get()->map(fn (Coupon $c) => [
                'id' => $c->id, 'code' => $c->code, 'label' => $c->label(), 'uses' => $coupons->uses($c), 'archived_at' => $c->deleted_at?->toIso8601String(),
            ])->all(),
        ]]);
    }
}
