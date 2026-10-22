<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\OrderResource;
use App\Models\Order;
use App\Services\OrderService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** Every order in the store, for the owner: list, details, status, payment and private notes. */
class OrderController extends Controller
{
    public function __construct(private OrderService $orders) {}

    /** ?status=&q=(number, name, email, phone)&customer=(user id)&from=&to=&per_page= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'status' => ['nullable', Rule::in(Order::STATUSES)], 'q' => ['nullable', 'string', 'max:100'], 'customer' => ['nullable', 'integer'],
            'email' => ['nullable', 'string', 'max:254'], 'from' => ['nullable', 'date'], 'to' => ['nullable', 'date'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $q = Order::query()->with('items')->latest('placed_at')->latest('id');
        if (! empty($v['status'])) {
            $q->where('status', $v['status']);
        }
        if (! empty($v['customer'])) {
            $q->where('user_id', $v['customer']);
        }
        if (! empty($v['email'])) {
            $q->where('email', mb_strtolower($v['email']))->whereNull('user_id');
        }
        if (! empty($v['q'])) {
            $term = trim(ltrim($v['q'], '#'));
            $like = '%'.addcslashes($term, '%_\\').'%';
            $q->where(fn ($w) => $w->where('number', $term)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)
                ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]));
        }
        if (! empty($v['from'])) {
            $q->where('placed_at', '>=', $v['from']);
        }
        if (! empty($v['to'])) {
            $q->where('placed_at', '<', date('Y-m-d', strtotime($v['to'].' +1 day')));
        }
        $counts = Order::query()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return OrderResource::collection($q->paginate($v['per_page'] ?? 20)->withQueryString())->additional(['meta' => [
            'counts' => collect(Order::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)])->put('all', (int) $counts->sum()),
        ]]);
    }

    public function show(Order $order): OrderResource
    {
        $order->load(['items', 'history.admin:id,name']);
        // How this buyer has shopped before (by account, or by email for guests).
        $past = Order::query()->when($order->user_id, fn ($q) => $q->where('user_id', $order->user_id), fn ($q) => $q->whereNull('user_id')->where('email', $order->email));

        return (new OrderResource($order))->additional(['meta' => ['customer' => [
            'orders' => (clone $past)->count(),
            'spent' => Money::json(Money::cents((clone $past)->paid()->sum('total'))),
            'first_order_at' => (clone $past)->min('placed_at'),
        ]]]);
    }

    public function status(Request $request, Order $order): OrderResource
    {
        // restock: for a refund, false when the goods aren't coming back (the default puts them back in stock).
        $v = $request->validate(['status' => ['required', Rule::in(Order::STATUSES)], 'note' => ['nullable', 'string', 'max:500'], 'restock' => ['sometimes', 'boolean']]);
        $order = $this->orders->changeStatus($order, $v['status'], 'admin', $request->user('admin'), $v['note'] ?? null, restock: $request->boolean('restock', true));

        return new OrderResource($order->load(['items', 'history.admin:id,name']));
    }

    public function payment(Request $request, Order $order): OrderResource
    {
        $v = $request->validate(['payment_status' => ['required', Rule::in(['unpaid', 'paid', 'refunded'])]]);
        $this->orders->setPayment($order, $v['payment_status'], $request->user('admin'));

        return new OrderResource($order->load(['items', 'history.admin:id,name']));
    }

    /** A private note on the order (the buyer never sees it). */
    public function note(Request $request, Order $order): OrderResource
    {
        $v = $request->validate(['note' => ['required', 'string', 'max:500']]);
        $this->orders->addNote($order, trim($v['note']), $request->user('admin'));

        return new OrderResource($order->load(['items', 'history.admin:id,name']));
    }
}
