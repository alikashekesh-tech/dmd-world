<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Checkout\PlaceOrderRequest;
use App\Http\Requests\Checkout\QuoteRequest;
use App\Http\Resources\OrderResource;
use App\Services\Checkout;
use App\Services\StoreSettings;
use App\Support\Money;
use Illuminate\Http\JsonResponse;

/** The cart's live price check, checkout options and placing an order (signed in or as a guest). */
class CheckoutController extends Controller
{
    public function __construct(private Checkout $checkout) {}

    /** What checkout offers, as the owner set it up (payment and delivery methods, whether codes can be used). */
    public function options(): JsonResponse
    {
        $delivery = ['delivery' => ['Delivery', 'Cost and timing confirmed by DMD after you order'], 'pickup' => ['Pick up', 'Collect from the store']];

        return response()->json(['data' => [
            'payment_methods' => collect(StoreSettings::paymentMethods())->map(fn ($title, $id) => ['id' => $id, 'title' => $title,
                'description' => $id === 'cod' ? 'Pay when your order arrives.' : (StoreSettings::get('bank_transfer_note') ?: 'DMD sends the bank details when confirming your order.')])->values(),
            'delivery_methods' => collect(StoreSettings::deliveryMethods())->map(fn ($title, $id) => ['id' => $id, 'title' => $delivery[$id][0], 'description' => $delivery[$id][1]])->values(),
            'coupons_enabled' => (bool) StoreSettings::get('coupons_enabled'),
        ]]);
    }

    /** Real prices and availability for a cart, line by line. Nothing is reserved or written. */
    public function quote(QuoteRequest $request): JsonResponse
    {
        $priced = $this->checkout->quote($request->validated('items'), $request->validated('coupon'), $request->user(), $request->validated('email'));
        $lines = collect($priced['lines'])->map(fn ($l) => [
            'product_id' => $l['product_id'], 'quantity' => $l['quantity'], 'name' => $l['name'],
            'unit_price' => Money::json($l['unit']), 'regular_price' => Money::json($l['regular']), 'line_total' => Money::json($l['subtotal']),
            'problem' => $l['problem'], 'code' => $l['code'], 'max_quantity' => $l['max'],
        ]);

        return response()->json(['data' => [
            'lines' => $lines->values(),
            'subtotal' => Money::json($priced['subtotal']),
            'discount' => Money::json($priced['discount']),
            'shipping' => 0,
            'total' => Money::json($priced['subtotal'] - $priced['discount']),
            'coupon' => $priced['coupon'] ? ['discount' => Money::json($priced['coupon']['discount'])] + $priced['coupon'] : null,
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
