<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\OfferPreviewRequest;
use App\Http\Requests\Admin\OfferRequest;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Offer;
use App\Models\Product;
use App\Services\CategoryTree;
use App\Services\OfferPreview;
use App\Services\Offers;
use App\Services\Pricing;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Store-wide offers. Saving, switching off or deleting one changes prices at once and never edits a product. */
class OfferController extends Controller
{
    public function __construct(private Offers $offers) {}

    public function index(): JsonResponse
    {
        $offers = Offer::query()->with(['targets' => fn ($q) => $q->orderBy('id')])->latest('id')->get();
        $covered = Offers::eligibleCounts($offers->pluck('id')->all());

        return response()->json(['data' => $offers->map(fn (Offer $o) => $this->row($o, $covered[$o->id] ?? 0))->values()]);
    }

    /** One offer, with what each of its targets is (names, images, status), so the form shows them all in one request. */
    public function show(Offer $offer): JsonResponse
    {
        $offer->load(['targets' => fn ($q) => $q->orderBy('id')]); // in the order they were picked

        return response()->json(['data' => $this->row($offer, Offers::eligibleCounts([$offer->id])[$offer->id] ?? 0) + ['targets' => $this->targets($offer)]]);
    }

    /** POST /offers/preview: what the form's offer would do, before saving (see OfferPreview). */
    public function preview(OfferPreviewRequest $request, OfferPreview $preview): JsonResponse
    {
        return response()->json(['data' => $preview->run($request->validated())]);
    }

    public function store(OfferRequest $request): JsonResponse
    {
        $offer = $this->offers->save(new Offer, $request->validated(), $request->user('admin'));

        return $this->show($offer)->setStatusCode(201);
    }

    public function update(OfferRequest $request, Offer $offer): JsonResponse
    {
        return $this->show($this->offers->save($offer, $request->validated(), $request->user('admin')));
    }

    /** Switch on or off without changing anything else. */
    public function toggle(Request $request, Offer $offer): JsonResponse
    {
        $v = $request->validate(['is_active' => ['required', 'boolean']]);
        $offer->forceFill(['is_active' => $v['is_active']])->save();

        return $this->show($offer);
    }

    public function destroy(Request $request, Offer $offer): Response
    {
        $this->offers->delete($offer, $request->user('admin'));

        return response()->noContent();
    }

    private function row(Offer $o, int $covered): array
    {
        return [
            'id' => $o->id, 'name' => $o->name, 'label' => $o->label, 'discount_type' => $o->discount_type, 'discount_value' => (float) $o->discount_value,
            'starts_at' => $o->starts_at?->toIso8601String(), 'ends_at' => $o->ends_at?->toIso8601String(),
            'is_active' => $o->is_active, 'state' => $o->state(),
            'product_ids' => $o->targets->where('target_type', 'product')->pluck('target_id')->values(),
            'brand_ids' => $o->targets->where('target_type', 'brand')->pluck('target_id')->values(),
            'category_ids' => $o->targets->where('target_type', 'category')->pluck('target_id')->values(),
            'entire_store' => $o->targets->contains('target_type', 'store'),
            // Products it covers that buyers can see: published and not in the trash.
            'products_covered' => $covered,
            'created_at' => $o->created_at?->toIso8601String(), 'updated_at' => $o->updated_at?->toIso8601String(),
        ];
    }

    /** The offer's targets with what the form shows for each; ones deleted since are listed with status `missing`. */
    private function targets(Offer $o): array
    {
        $ids = fn (string $type) => $o->targets->where('target_type', $type)->pluck('target_id')->map(fn ($v) => (int) $v)->values()->all();
        [$productIds, $brandIds, $categoryIds] = [$ids('product'), $ids('brand'), $ids('category')];

        $products = Product::withTrashed()->whereKey($productIds)->with('images:id,product_id,url,position')->get()->keyBy('id');
        $brands = Brand::withTrashed()->whereKey($brandIds)->get()->keyBy('id');
        $brandCounts = Product::published()->whereIn('brand_id', $brandIds ?: [0])->selectRaw('brand_id, count(*) as n')->groupBy('brand_id')->pluck('n', 'brand_id');
        $categories = Category::withTrashed()->whereKey($categoryIds)->get()->keyBy('id');
        $tree = CategoryTree::load(true);
        $brandNames = Brand::withTrashed()->whereKey($categories->pluck('brand_id')->filter()->all())->pluck('name', 'id');

        return [
            'entire_store' => $o->targets->contains('target_type', 'store'),
            'products' => array_map(function (int $id) use ($products) {
                $p = $products->get($id);
                if (! $p) {
                    return ['id' => $id, 'status' => 'missing', 'name' => null];
                }
                $price = Pricing::forProduct($p);

                return ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'image' => $p->images->first()?->url, 'status' => $p->trashed() ? 'trashed' : $p->status,
                    'price' => Money::json($price['price']), 'regular_price' => Money::json(Money::cents($p->regular_price)), 'variants' => $p->type === 'variable'];
            }, $productIds),
            'brands' => array_map(function (int $id) use ($brands, $brandCounts) {
                $b = $brands->get($id);

                return $b ? ['id' => $b->id, 'name' => $b->name, 'status' => $b->trashed() ? 'deleted' : 'ok', 'products' => (int) ($brandCounts[$id] ?? 0)]
                    : ['id' => $id, 'status' => 'missing', 'name' => null, 'products' => 0];
            }, $brandIds),
            'categories' => array_map(function (int $id) use ($categories, $tree, $brandNames) {
                $c = $categories->get($id);
                if (! $c) {
                    return ['id' => $id, 'status' => 'missing', 'name' => null, 'products' => 0];
                }
                $all = Offers::withDescendants([$id]);

                return ['id' => $c->id, 'name' => $c->name, 'label' => $c->brand_id && ! $c->parent_id ? ($brandNames[$c->brand_id] ?? 'Brand').' · '.$c->name : $c->name,
                    'path' => $tree->path($c->id), 'status' => $c->trashed() ? 'deleted' : 'ok', 'subcategories' => count($all) - 1,
                    'products' => Offers::eligibleQuery(['category_ids' => [$id]])->count()];
            }, $categoryIds),
        ];
    }
}
