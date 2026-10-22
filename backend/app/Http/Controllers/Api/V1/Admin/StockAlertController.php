<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Inventory;
use Illuminate\Http\JsonResponse;

/** Which sold-out products buyers are waiting for, and how many: what to restock first. */
class StockAlertController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::withTrashed()
            ->whereHas('stockAlerts', fn ($q) => $q->whereNull('notified_at'))
            ->withCount(['stockAlerts as waiting' => fn ($q) => $q->whereNull('notified_at')])
            ->orderByDesc('waiting')->orderBy('name')
            ->get(['id', 'name', 'sku', 'status', 'deleted_at', 'track_stock', 'stock_quantity', 'stock_status', 'low_stock_threshold']);

        return response()->json(['data' => $products->map(fn (Product $p) => [
            'product_id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'waiting' => (int) $p->waiting,
            'availability' => Inventory::availability($p), 'stock_quantity' => $p->track_stock ? $p->stock_quantity : null,
            'on_storefront' => $p->isPublished(),
        ])->all()]);
    }
}
