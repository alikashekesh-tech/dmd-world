<?php

namespace App\Http\Controllers\Api\V1\Account;

use App\Http\Controllers\Controller;
use App\Services\StockAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Products (or variants of them) the signed-in buyer is waiting for. They're told once, when it can be bought again. */
class StockAlertController extends Controller
{
    public function __construct(private StockAlerts $alerts) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->list($request)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['product_id' => ['required', 'integer', 'min:1'], 'variant_id' => ['nullable', 'integer', 'min:1']]);
        $this->alerts->follow($request->user(), (int) $data['product_id'], isset($data['variant_id']) ? (int) $data['variant_id'] : null);

        return response()->json(['data' => $this->list($request)], 201);
    }

    /** Stops waiting for the product: every variant of it, or only the one given as ?variant_id=. */
    public function destroy(Request $request, int $productId): Response
    {
        $variant = $request->integer('variant_id');
        $request->user()->stockAlerts()->where('product_id', $productId)
            ->when($variant > 0, fn ($q) => $q->where('variant_id', $variant))->delete();

        return response()->noContent();
    }

    private function list(Request $request): array
    {
        return $request->user()->stockAlerts()->whereNull('cancelled_at')->latest('id')->get()->map(fn ($a) => [
            'product_id' => $a->product_id,
            'variant_id' => $a->variant_id,
            'channel' => $a->channel,
            'created_at' => $a->created_at?->toIso8601String(),
            'notified_at' => $a->notified_at?->toIso8601String(),
        ])->all();
    }
}
