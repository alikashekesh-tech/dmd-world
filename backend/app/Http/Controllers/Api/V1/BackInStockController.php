<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\StockAlertRequest;
use App\Models\StockAlert;
use App\Services\StockAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * "Notify me when it's available" from the product page, for guests and signed-in buyers. The reply carries the
 * request's private token: the browser keeps it to show the request and to withdraw it. Nothing else is returned.
 */
class BackInStockController extends Controller
{
    public function __construct(private StockAlerts $alerts) {}

    public function store(StockAlertRequest $request): JsonResponse
    {
        $alert = $this->alerts->request($request->validated(), $request->user());

        return response()->json(['data' => self::present($alert)], 201);
    }

    public function destroy(string $token): Response
    {
        $this->alerts->cancel($token);

        return response()->noContent();
    }

    private static function present(StockAlert $alert): array
    {
        return [
            'token' => $alert->token, 'product_id' => $alert->product_id, 'variant_id' => $alert->variant_id,
            'channel' => $alert->channel, 'created_at' => $alert->created_at?->toIso8601String(),
        ];
    }
}
