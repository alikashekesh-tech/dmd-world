<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Http\Controllers\Controller;
use App\Services\StockAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Products the signed-in buyer is waiting for. The email goes once, when the product can be bought again. */
class StockAlertController extends Controller
{
    public function __construct(private StockAlerts $alerts) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->list($request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $id = (int) $request->validate(['product_id' => ['required', 'integer', 'min:1']])['product_id'];
        $this->alerts->follow($request->user(), $id);

        return response()->json(['data' => $this->list($request)], 201);
    }

    public function destroy(Request $request, int $productId): Response
    {
        $request->user()->stockAlerts()->where('product_id', $productId)->delete();

        return response()->noContent();
    }

    private function list(Request $request): array
    {
        return $request->user()->stockAlerts()->latest('id')->get()->map(fn ($a) => [
            'product_id' => $a->product_id,
            'created_at' => $a->created_at?->toIso8601String(),
            'notified_at' => $a->notified_at?->toIso8601String(),
        ])->all();
    }
}
