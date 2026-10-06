<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * A buyer's own orders. A signed-in buyer sees only orders placed on their account; a guest opens their order with
 * the private token checkout gave them. Anyone else's order simply isn't found (404).
 */
class OrderController extends Controller
{
    public function __construct(private OrderService $orders) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $page = Order::where('user_id', $request->user()->id)->with('items')->latest('placed_at')->latest('id')->paginate(20);

        return OrderResource::collection($page);
    }

    public function show(Request $request, int $id): OrderResource
    {
        return new OrderResource($this->visible($request, $id)->load(['items', 'history']));
    }

    /** Cancel an order DMD hasn't confirmed yet; its items go back on the shelf. */
    public function cancel(Request $request, int $id): OrderResource
    {
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:300'], 'token' => ['nullable', 'string', 'max:100']])['reason'] ?? null;
        $order = $this->visible($request, $id);
        if (! $order->cancellableByBuyer()) {
            throw new ApiException(409, 'NOT_CANCELLABLE', $order->status === 'cancelled' ? 'This order is already cancelled.' : 'DMD has already confirmed this order. Message or call DMD to change it.');
        }
        $order = $this->orders->changeStatus($order, 'cancelled', 'buyer', null, $reason ? strip_tags($reason) : 'Cancelled by the buyer', $request->user());

        return new OrderResource($order->load(['items', 'history']));
    }

    private function visible(Request $request, int $id): Order
    {
        $order = Order::find($id);
        $user = $request->user();
        $token = (string) ($request->input('token') ?? $request->query('token', ''));
        $mine = $order && $user && $order->user_id === $user->id;
        $byToken = $order && ! $mine && $token !== '' && $order->guest_token_hash && hash_equals($order->guest_token_hash, hash('sha256', $token));
        if (! $mine && ! $byToken) {
            throw new ApiException(404, 'NOT_FOUND', 'Order not found.');
        }

        return $order;
    }
}
