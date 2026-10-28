<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\AddressResource;
use App\Http\Resources\Admin\OrderResource;
use App\Models\Activity;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The owner's view of buyers: registered accounts and guests (people who checked out without an account, grouped
 * by email), with what they ordered and spent. Figures are computed from orders, never stored.
 */
class CustomerController extends Controller
{
    /** ?type=registered|guest&q=&per_page= */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate(['type' => ['nullable', 'in:registered,guest'], 'q' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $like = ! empty($v['q']) ? '%'.addcslashes(trim($v['q']), '%_\\').'%' : null;
        $paid = "'".implode("','", Order::PAID)."'";

        if (($v['type'] ?? 'registered') === 'guest') {
            $page = Order::query()->whereNull('user_id')
                ->selectRaw("email, MAX(CONCAT(first_name, ' ', last_name)) as name, MAX(phone) as phone, MAX(ship_city) as city, COUNT(*) as orders, SUM(CASE WHEN status IN ({$paid}) THEN total ELSE 0 END) as spent, MAX(placed_at) as last_order_at, MIN(placed_at) as first_order_at")
                ->when($like, fn ($q) => $q->where(fn ($w) => $w->where('email', 'like', $like)->orWhere('phone', 'like', $like)->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like])))
                ->groupBy('email')->orderByDesc('last_order_at')->paginate($v['per_page'] ?? 25)->withQueryString();

            return response()->json(['data' => collect($page->items())->map(fn ($r) => [
                'email' => $r->email, 'name' => $r->name, 'phone' => $r->phone, 'city' => $r->city, 'orders' => (int) $r->orders,
                'spent' => Money::json(Money::cents($r->spent)), 'last_order_at' => self::iso($r->last_order_at), 'first_order_at' => self::iso($r->first_order_at),
            ]), 'meta' => ['type' => 'guest', 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
        }

        $stats = DB::table('orders')->selectRaw("user_id, COUNT(*) as orders, SUM(CASE WHEN status IN ({$paid}) THEN total ELSE 0 END) as spent, MAX(placed_at) as last_order_at")->whereNotNull('user_id')->groupBy('user_id');
        $page = User::query()->leftJoinSub($stats, 's', 's.user_id', '=', 'users.id')
            ->select('users.*', DB::raw('COALESCE(s.orders, 0) as orders_count'), DB::raw('COALESCE(s.spent, 0) as spent_total'), 's.last_order_at')
            ->when($like, fn ($q) => $q->where(fn ($w) => $w->where('email', 'like', $like)->orWhere('phone', 'like', $like)->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like])))
            ->orderByDesc('users.created_at')->orderByDesc('users.id')->paginate($v['per_page'] ?? 25)->withQueryString();

        return response()->json(['data' => collect($page->items())->map(fn (User $u) => $this->row($u)), 'meta' => ['type' => 'registered', 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'guests' => Order::whereNull('user_id')->distinct()->count('email')]]);
    }

    public function show(User $user): JsonResponse
    {
        $orders = Order::where('user_id', $user->id)->with('items')->latest('placed_at')->limit(50)->get();

        return response()->json(['data' => [
            'id' => $user->id, 'first_name' => $user->first_name, 'last_name' => $user->last_name, 'email' => $user->email, 'phone' => $user->phone,
            'marketing_opt_in' => (bool) $user->marketing_opt_in, 'has_password' => $user->password !== null,
            'member_since' => $user->created_at?->toIso8601String(), 'last_login_at' => $user->last_login_at?->toIso8601String(),
            'addresses' => AddressResource::collection($user->addresses()->get())->resolve(),
            'orders' => OrderResource::collection($orders)->resolve(),
            'spent' => Money::json(Money::cents(Order::where('user_id', $user->id)->paid()->sum('total'))),
            'wishlist_count' => $user->wishlist()->count(),
        ]]);
    }

    /** Someone who checked out without an account, by the email they used: their orders and what they spent. */
    public function guest(Request $request): JsonResponse
    {
        $email = User::normalizeEmail($request->validate(['email' => ['required', 'string', 'max:254']])['email']);
        $orders = Order::whereNull('user_id')->where('email', $email)->with('items')->latest('placed_at')->limit(50)->get();
        if ($orders->isEmpty()) {
            throw new ApiException(404, 'NOT_FOUND', 'No guest orders use this email.');
        }
        $latest = $orders->first();

        return response()->json(['data' => [
            'guest' => true, 'email' => $email, 'first_name' => $latest->first_name, 'last_name' => $latest->last_name, 'phone' => $latest->phone,
            'city' => $orders->pluck('ship_city')->filter()->first(), 'has_account' => User::where('email', $email)->exists(),
            'orders' => OrderResource::collection($orders)->resolve(),
            'spent' => Money::json(Money::cents(Order::whereNull('user_id')->where('email', $email)->paid()->sum('total'))),
            'first_order_at' => $orders->last()->placed_at?->toIso8601String(),
        ]]);
    }

    private static function iso(?string $utc): ?string
    {
        return $utc ? Carbon::parse($utc, 'UTC')->toIso8601String() : null;
    }

    /** The owner can correct a buyer's name, phone or email (never their password). */
    public function update(Request $request, User $user): JsonResponse
    {
        $v = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:60', 'not_regex:/[<>]/'], 'last_name' => ['sometimes', 'string', 'max:60', 'not_regex:/[<>]/'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30', 'regex:/^\+?[0-9][0-9\s().\-]{5,28}$/'], 'email' => ['sometimes', 'string', 'email:rfc', 'max:254'],
        ]);
        if (isset($v['email'])) {
            $v['email'] = User::normalizeEmail($v['email']);
            if (User::where('email', $v['email'])->whereKeyNot($user->id)->exists()) {
                throw new ApiException(409, 'EMAIL_ALREADY_EXISTS', 'Another account already uses this email.', ['email' => ['Another account already uses this email.']]);
            }
        }
        $user->forceFill($v)->save();
        Activity::record('customer.updated', "Updated {$user->fullName()}’s details", $user, $request->user('admin'));

        return $this->show($user);
    }

    private function row(User $u): array
    {
        return [
            'id' => $u->id, 'name' => $u->fullName() ?: $u->email, 'email' => $u->email, 'phone' => $u->phone,
            'orders' => (int) $u->getAttribute('orders_count'), 'spent' => Money::json(Money::cents($u->getAttribute('spent_total'))),
            'last_order_at' => self::iso($u->getAttribute('last_order_at')), 'member_since' => $u->created_at?->toIso8601String(), 'has_password' => $u->password !== null,
        ];
    }
}
