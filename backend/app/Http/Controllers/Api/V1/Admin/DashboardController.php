<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Conversation;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use App\Services\Analytics;
use App\Services\Notifications;
use App\Services\ProductQuery;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The owner's dashboard, sidebar badges, activity feed, notifications and quick search: all read from MySQL. */
class DashboardController extends Controller
{
    public function __construct(private Analytics $analytics, private Notifications $notifications) {}

    /** ?range=today|7d|30d|90d */
    public function show(Request $request): JsonResponse
    {
        $v = $request->validate(['range' => ['nullable', Rule::in(Analytics::RANGES)]]);

        return response()->json(['data' => $this->analytics->dashboard($v['range'] ?? '7d')]);
    }

    /** Counts for the sidebar. */
    public function badges(Request $request): JsonResponse
    {
        $level = function (string $l) {
            $q = Product::published();
            ProductQuery::stockLevel($q, $l);

            return $q->count();
        };
        $unseen = count(array_filter($this->notifications->list($request->user('admin')), fn ($n) => $n['unseen']));

        return response()->json(['data' => [
            'pending' => Order::query()->where('status', 'pending')->count(),
            'messages' => Conversation::query()->unreadForAdmin()->count(),
            'reviews' => Review::query()->where('status', 'pending')->count(),
            'low' => $level('low'),
            'out' => $level('out'),
            'notifications' => $unseen,
            'trash' => Product::onlyTrashed()->count() + Category::onlyTrashed()->count() + Brand::onlyTrashed()->count() + Coupon::onlyTrashed()->count(),
        ]]);
    }

    public function activity(Request $request): JsonResponse
    {
        $v = $request->validate(['limit' => ['nullable', 'integer', 'min:1', 'max:200']]);

        return response()->json(['data' => Analytics::activity($v['limit'] ?? 100)]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $items = $this->notifications->list($request->user('admin'));

        return response()->json(['data' => $items, 'meta' => ['unseen' => count(array_filter($items, fn ($n) => $n['unseen']))]]);
    }

    public function seen(Request $request): JsonResponse
    {
        $this->notifications->markSeen($request->user('admin'));

        return response()->json(['data' => ['seen_at' => $request->user('admin')->notifications_seen_at?->toIso8601String()]]);
    }

    public function dismiss(Request $request, string $key): JsonResponse
    {
        abort_unless(preg_match('/^[a-z]+-[0-9]+(-[0-9]+)?$/', $key), 404);
        $this->notifications->dismiss($request->user('admin'), $key);

        return response()->json(['data' => ['dismissed' => $key]]);
    }

    /** ?q= (at least 2 characters): products, orders and customers, a few of each. */
    public function search(Request $request): JsonResponse
    {
        $v = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']]);
        $term = trim($v['q']);
        $like = '%'.addcslashes(ltrim($term, '#'), '%_\\').'%';
        $products = Product::query()->with('images:id,product_id,url,position');
        ProductQuery::search($products, $term);

        return response()->json(['data' => [
            'products' => $products->limit(6)->get()->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'status' => $p->status, 'image' => $p->images->first()?->url])->all(),
            'orders' => Order::query()->where(fn ($q) => $q->where('number', ltrim($term, '#'))->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)
                ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]))->latest('placed_at')->limit(5)->get()
                ->map(fn (Order $o) => ['id' => $o->id, 'number' => $o->number, 'status' => $o->status, 'customer' => $o->customerName() ?: $o->email, 'total' => Money::json(Money::cents($o->total)), 'placed_at' => $o->placed_at?->toIso8601String()])->all(),
            'customers' => User::query()->where(fn ($q) => $q->where('email', 'like', $like)->orWhere('phone', 'like', $like)
                ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]))->limit(5)->get()
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->fullName() ?: $u->email, 'email' => $u->email])->all(),
        ]]);
    }
}
