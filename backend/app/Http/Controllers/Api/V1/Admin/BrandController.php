<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BrandRequest;
use App\Http\Requests\Admin\ReorderRequest;
use App\Http\Resources\Admin\BrandResource;
use App\Models\Brand;
use App\Services\BrandService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/** The owner's brand management. Writes go through BrandService; the storefront reads the same rows. */
class BrandController extends Controller
{
    public function __construct(private BrandService $brands) {}

    /** ?archived=only lists the archive; ?archived=with lists everything. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Brand::query()->withCount('categories')->orderBy('position')->orderBy('name');
        match ($request->query('archived')) {
            'only' => $query->onlyTrashed(),
            'with' => $query->withTrashed(),
            default => null,
        };

        return BrandResource::collection($query->get())->additional(['meta' => ['total' => Brand::count(), 'archived' => Brand::onlyTrashed()->count()]]);
    }

    public function show(Brand $brand): BrandResource
    {
        return new BrandResource($brand->loadCount('categories'));
    }

    public function store(BrandRequest $request): JsonResponse
    {
        return (new BrandResource($this->brands->create($request->validated(), $request->user('admin'))->loadCount('categories')))->response()->setStatusCode(201);
    }

    public function update(BrandRequest $request, Brand $brand): BrandResource
    {
        return new BrandResource($this->brands->update($brand, $request->validated(), $request->user('admin'))->loadCount('categories'));
    }

    public function destroy(Request $request, Brand $brand): Response
    {
        $this->brands->archive($brand, $request->user('admin'));

        return response()->noContent();
    }

    public function restore(Request $request, int $id): BrandResource
    {
        return new BrandResource($this->brands->restore(Brand::onlyTrashed()->findOrFail($id), $request->user('admin'))->loadCount('categories'));
    }

    public function forceDestroy(Request $request, int $id): Response
    {
        $this->brands->destroy(Brand::withTrashed()->findOrFail($id), $request->user('admin'));

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request): Response
    {
        $this->brands->reorder($request->validated('ids'), $request->user('admin'));

        return response()->noContent();
    }
}
