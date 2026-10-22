<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\CategoryTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The storefront's categories: only what's visible (category, its parents and its brand all visible). */
class CategoryController extends Controller
{
    /** Every visible category, flat, in display order; parent_id/brand_id rebuild the tree. */
    public function index(Request $request): JsonResponse
    {
        $tree = CategoryTree::load();

        return response()->json(['data' => CategoryResource::list($tree->visible(), $tree, $request)]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tree = CategoryTree::load();
        $category = $tree->categories->get($id);
        if (! $category || ! $tree->isVisible($id)) {
            throw new ApiException(404, 'NOT_FOUND', 'Category not found.');
        }

        return $this->detail($request, $tree, $category);
    }

    /** GET /categories/lookup?path=playstation/ps5/games: the category behind a storefront URL. */
    public function lookup(Request $request): JsonResponse
    {
        $tree = CategoryTree::load();
        $category = $tree->resolve((string) $request->query('path', ''));
        if (! $category) {
            throw new ApiException(404, 'NOT_FOUND', 'Category not found.');
        }

        return $this->detail($request, $tree, $category);
    }

    private function detail(Request $request, CategoryTree $tree, Category $category): JsonResponse
    {
        $visible = fn (array $ids) => collect($ids)->filter(fn ($id) => $tree->isVisible($id))->map(fn ($id) => $tree->categories->get($id));

        return response()->json(['data' => (new CategoryResource($category, $tree))->toArray($request) + [
            'ancestors' => CategoryResource::list($visible($tree->ancestorIds($category->id)), $tree, $request),
            'children' => CategoryResource::list($visible($tree->childIds($category->id)), $tree, $request),
            'brand' => $category->brand_id ? ['id' => $category->brand_id, 'name' => $tree->brands->get($category->brand_id)?->name, 'slug' => $tree->brands->get($category->brand_id)?->slug] : null,
        ]]);
    }
}
