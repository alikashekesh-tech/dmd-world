<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\BrandResource;
use App\Http\Resources\CategoryResource;
use App\Models\Brand;
use App\Services\CategoryTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The storefront's brands: active ones only. */
class BrandController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => BrandResource::collection(Brand::onStorefront()->orderBy('position')->orderBy('name')->get())]);
    }

    /** A brand's page: the brand and its visible product lines (with their sub-categories). */
    public function show(Request $request, string $slug): JsonResponse
    {
        $brand = Brand::onStorefront()->where('slug', strtolower($slug))->first();
        if (! $brand) {
            throw new ApiException(404, 'NOT_FOUND', 'Brand not found.');
        }
        $tree = CategoryTree::load();
        $lines = $tree->visible()->filter(fn ($c) => $c->brand_id === $brand->id);

        return response()->json(['data' => (new BrandResource($brand))->toArray($request) + [
            'product_lines' => CategoryResource::list($lines, $tree, $request),
        ]]);
    }
}
