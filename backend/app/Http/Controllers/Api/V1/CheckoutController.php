<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Checkout\PlaceOrderRequest;
use App\Http\Requests\Checkout\QuoteRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\Checkout;
use App\Support\Money;
use Illuminate\Http\JsonResponse;

/** The cart's live price check, checkout options and placing an order (signed in or as a guest). */
class CheckoutController extends Controller
{
    public function __construct(private Checkout $checkout) {}

    public function options(): JsonResponse
    {
        return response()->json(['data' => [
            'payment_methods' => collect(Order::PAYMENT_METHODS)->map(fn ($title, $id) => ['id' => $id, 'title' => $title, 'description' => $id === 'cod' ? 'Pay when your order arrives.' : 'DMD sends the bank details when confirming your order.'])->values(),
            'delivery_methods' => [
                ['id' => 'delivery', 'title' => 'Delivery', 'description' => 'Cost and timing confirmed by DMD after you order'],
                ['id' => 'pickup', 'title' => 'Pick up', 'description' => 'Collect from the store'],
            ],
            'coupons_enabled' => false, // coupons arrive in Phase 9
            'max_quantity' => Checkout::MAX_QTY,
        ]]);
    }

    /** Real prices and availability for a cart, line by line. Nothing is reserved or written. */
    public function quote(QuoteRequest $request): JsonResponse
    {
        $priced = $this->checkout->price($request->validated('items'));
        $lines = collect($priced['lines'])->map(fn ($l) => [
            'product_id' => $l['product_id'], 'quantity' => $l['quantity'], 'name' => $l['name'],
            'unit_price' => Money::json($l['unit']), 'regular_price' => Money::json($l['regular']), 'line_total' => Money::json($l['subtotal']),
            'problem' => $l['problem'], 'code' => $l['code'], 'max_quantity' => $l['max'],
        ]);

        return response()->json(['data' => [
            'lines' => $lines->values(),
            'subtotal' => Money::json($priced['subtotal']),
            'discount' => 0,
            'shipping' => 0,
            'total' => Money::json($priced['subtotal']),
            'coupon' => null,
            'ok' => $priced['ok'],
        ]]);
    }

    public function store(PlaceOrderRequest $request): JsonResponse
    {
        $result = $this->checkout->place($request->validated(), $request->user());
        $order = $result['order']->load(['items', 'history']);

        return (new OrderResource($order))->additional(['meta' => ['guest_token' => $result['guest_token'], 'replayed' => $result['replayed']]])
            ->response()->setStatusCode($result['replayed'] ? 200 : 201);
    }
}
