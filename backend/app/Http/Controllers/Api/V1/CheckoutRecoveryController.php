<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\CheckoutRecoveryRequest;
use App\Services\CheckoutRecoveries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * The checkout the customer asked to be reminded about. The browser keeps the private token; the reminder's link
 * carries it back. Opening a link returns only the items (never the contact details).
 */
class CheckoutRecoveryController extends Controller
{
    public function __construct(private CheckoutRecoveries $recoveries) {}

    public function save(CheckoutRecoveryRequest $request): JsonResponse
    {
        $recovery = $this->recoveries->save($request->validated(), $request->user());

        return response()->json(['data' => ['token' => $recovery->token]]);
    }

    public function show(string $token): JsonResponse
    {
        $recovery = $this->recoveries->open($token);

        return response()->json(['data' => ['items' => $recovery->items]]);
    }

    public function destroy(string $token): Response
    {
        $this->recoveries->close($token);

        return response()->noContent();
    }
}
