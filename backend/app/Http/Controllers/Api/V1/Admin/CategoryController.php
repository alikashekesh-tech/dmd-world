<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CategoryRequest;
use App\Http\Requests\Admin\ReorderRequest;
use App\Http\Resources\Admin\CategoryResource;
use App\Models\Category;
use App\Services\CategoryService;
use App\Services\CategoryTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** The owner's category management. Writes go through CategoryService; the storefront reads the same rows. */
class CategoryController extends Controller
{
    public function __construct(private CategoryService $categories) {}

    /** ?archived=only lists the archive; ?archived=with lists everything. */
    public function index(Request $request): JsonResponse
    {
        $archived = $request->query('archived');
        $tree = CategoryTree::load(withArchived: true);
        $rows = $tree->categories->filter(fn (Category $c) => match ($archived) {
            'only' => $c->trashed(),
            'with' => true,
            default => ! $c->trashed(),
        });

        // Products filed directly under each category (one grouped query).
        $counts = DB::table('category_product')->join('products', 'products.id', '=', 'category_product.product_id')->whereNull('products.deleted_at')
            ->groupBy('category_id')->selectRaw('category_id, COUNT(*) AS n')->pluck('n', 'category_id');

        return response()->json([
            'data' => collect(CategoryResource::list($rows, $tree, $request))->map(fn ($c) => $c + ['products_count' => (int) ($counts[$c['id']] ?? 0)])->all(),
            'meta' => ['total' => $tree->categories->filter(fn ($c) => ! $c->trashed())->count(), 'archived' => $tree->categories->filter(fn ($c) => $c->trashed())->count()],
        ]);
    }

    public function show(Request $request, Category $category): JsonResponse
    {
        return response()->json(['data' => (new CategoryResource($category, CategoryTree::load(true)))->toArray($request)]);
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        $category = $this->categories->create($request->validated(), $request->user('admin'));

        return response()->json(['data' => (new CategoryResource($category, CategoryTree::load(true)))->toArray($request)], 201);
    }

    public function update(CategoryRequest $request, Category $category): JsonResponse
    {
        $category = $this->categories->update($category, $request->validated(), $request->user('admin'));

        return response()->json(['data' => (new CategoryResource($category, CategoryTree::load(true)))->toArray($request)]);
    }

    /** Archive (soft delete): hidden everywhere, restorable. */
    public function destroy(Request $request, Category $category): Response
    {
        $this->categories->archive($category, $request->user('admin'));

        return response()->noContent();
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $category = $this->categories->restore(Category::onlyTrashed()->findOrFail($id), $request->user('admin'));

        return response()->json(['data' => (new CategoryResource($category, CategoryTree::load(true)))->toArray($request)]);
    }

    public function forceDestroy(Request $request, int $id): Response
    {
        $this->categories->destroy(Category::withTrashed()->findOrFail($id), $request->user('admin'));

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request): Response
    {
        $this->categories->reorder($request->validated('ids'), $request->user('admin'));

        return response()->noContent();
    }
}
