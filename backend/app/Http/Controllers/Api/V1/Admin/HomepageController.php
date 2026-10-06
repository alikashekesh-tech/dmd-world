<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BannerRequest;
use App\Models\Activity;
use App\Models\Banner;
use App\Models\Category;
use App\Models\HomepageSection;
use App\Models\Product;
use App\Services\Homepage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** The storefront home: section order and visibility, hand-picked products and categories, and banners. */
class HomepageController extends Controller
{
    public function __construct(private Homepage $homepage) {}

    public function show(): JsonResponse
    {
        $sections = HomepageSection::query()->with('items')->orderBy('position')->get();
        $productIds = $sections->flatMap(fn ($s) => $s->items->where('item_type', 'product')->pluck('item_id'))->all();
        $categoryIds = $sections->flatMap(fn ($s) => $s->items->where('item_type', 'category')->pluck('item_id'))->all();
        $products = Product::withTrashed()->whereKey($productIds)->get(['id', 'name', 'status', 'deleted_at'])->keyBy('id');
        $categories = Category::withTrashed()->whereKey($categoryIds)->get(['id', 'name'])->keyBy('id');

        return response()->json(['data' => [
            'sections' => $sections->map(fn (HomepageSection $s) => [
                'key' => $s->key, 'visible' => $s->is_visible, 'position' => $s->position, 'picks' => HomepageSection::KEYS[$s->key],
                'items' => $s->items->map(fn ($i) => [
                    'type' => $i->item_type, 'id' => $i->item_id,
                    'name' => ($i->item_type === 'product' ? $products->get($i->item_id)?->name : $categories->get($i->item_id)?->name),
                    'on_storefront' => $i->item_type === 'product' ? (bool) $products->get($i->item_id)?->isPublished() : $categories->has($i->item_id),
                ])->values(),
            ])->values(),
            'banners' => Banner::query()->orderBy('placement')->orderBy('position')->orderBy('id')->get()->map(fn ($b) => $this->banner($b))->values(),
        ]]);
    }

    /** Every section once, in the new order, each visible or not. */
    public function arrange(Request $request): JsonResponse
    {
        $v = $request->validate(['sections' => ['required', 'array'], 'sections.*.key' => ['required', 'string'], 'sections.*.visible' => ['required', 'boolean']]);
        $this->homepage->arrange($v['sections'], $request->user('admin'));

        return $this->show();
    }

    /** The products or categories a section shows, in order (an empty list: chosen automatically). */
    public function pick(Request $request, string $key): JsonResponse
    {
        $v = $request->validate(['ids' => ['present', 'array'], 'ids.*' => ['integer', 'min:1']]);
        abort_unless(array_key_exists($key, HomepageSection::KEYS), 404);
        $this->homepage->pick($key, $v['ids'], $request->user('admin'));

        return $this->show();
    }

    public function storeBanner(BannerRequest $request): JsonResponse
    {
        $banner = new Banner;
        $banner->forceFill($request->validated() + ['position' => (int) Banner::where('placement', $request->validated('placement'))->max('position') + 1])->save();
        Activity::record('banner.created', "Added the banner “{$banner->title}”", $banner, $request->user('admin'));

        return response()->json(['data' => $this->banner($banner->refresh())], 201);
    }

    public function updateBanner(BannerRequest $request, Banner $banner): JsonResponse
    {
        $banner->forceFill($request->validated())->save();
        Activity::record('banner.updated', "Updated the banner “{$banner->title}”", $banner, $request->user('admin'));

        return response()->json(['data' => $this->banner($banner)]);
    }

    public function destroyBanner(Request $request, Banner $banner): Response
    {
        $banner->delete();
        Activity::record('banner.deleted', "Removed the banner “{$banner->title}”", null, $request->user('admin'));

        return response()->noContent();
    }

    /** Banner ids of one placement, in the new order. */
    public function reorderBanners(Request $request): JsonResponse
    {
        $v = $request->validate(['ids' => ['required', 'array', 'max:100'], 'ids.*' => ['integer', 'distinct']]);
        DB::transaction(function () use ($v) {
            foreach (Banner::whereKey($v['ids'])->get()->keyBy('id') as $id => $banner) {
                $banner->forceFill(['position' => array_search($id, $v['ids'], true) + 1])->save();
            }
        });

        return $this->show();
    }

    private function banner(Banner $b): array
    {
        return Homepage::banner($b) + [
            'placement' => $b->placement, 'position' => $b->position, 'is_active' => $b->is_active,
            'starts_at' => $b->starts_at?->toIso8601String(),
            'showing' => $b->is_active && ($b->starts_at === null || $b->starts_at->lte(now())) && ($b->ends_at === null || $b->ends_at->gt(now())),
        ];
    }
}
