<?php

namespace App\Services;

use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Coupon;
use App\Models\Offer;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\StockAlert;
use App\Models\User;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The owner's dashboard, computed from MySQL on every request: nothing is estimated, sampled or invented, and an
 * empty store shows zeros and empty lists. Every figure is a handful of aggregate queries whatever the store's size
 * (no query per order or product).
 *
 * Definitions (the same everywhere in the admin):
 *   - revenue: totals of paid orders (processing, completed, on hold), by the date they were placed;
 *   - orders: every order except failed ones;
 *   - average order: revenue ÷ paid orders;
 *   - items sold: units in paid orders;
 *   - new buyers: emails whose first order falls in the period;
 *   - product, category and brand revenue: the paid order lines' totals (after any coupon discount).
 * Days and hours are the store's (config dmd.timezone); dates are stored in UTC.
 */
final class Analytics
{
    public const RANGES = ['today', '7d', '30d', '90d'];

    /** @return array{start: CarbonImmutable, end: CarbonImmutable, prev_start: CarbonImmutable, prev_end: CarbonImmutable, buckets: string, days: int} */
    public static function window(string $range, ?CarbonInterface $now = null): array
    {
        $now = CarbonImmutable::instance($now ?? now())->setTimezone(config('dmd.timezone'));
        $today = $now->startOfDay();
        if ($range === 'today') {
            return ['start' => $today, 'end' => $now, 'prev_start' => $today->subDay(), 'prev_end' => $now->subDay(), 'buckets' => 'hour', 'days' => 1];
        }
        $days = ['7d' => 7, '30d' => 30, '90d' => 90][$range] ?? 7;
        $start = $today->subDays($days - 1);

        return ['start' => $start, 'end' => $now, 'prev_start' => $start->subDays($days), 'prev_end' => $start, 'buckets' => 'day', 'days' => $days];
    }

    public function dashboard(string $range): array
    {
        $w = self::window($range);
        $stats = $this->orderStats($w);
        $today = $range === 'today' ? $stats : $this->orderStats(self::window('today'));
        $sales = $this->lineSales($w['start'], $w['end']);
        $stock = $this->stock();
        $statusCounts = Order::query()->selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
        $pending = Order::query()->where('status', 'pending')->selectRaw('COUNT(*) AS n, MIN(placed_at) AS oldest')->first();
        $offers = $this->offers();

        return [
            'range' => $range,
            'generated_at' => now()->toIso8601String(),
            'timezone' => config('dmd.timezone'),
            'buckets' => $w['buckets'],
            'kpis' => $stats['kpis'],
            'series' => $stats['series'],
            'target' => [
                'value' => StoreSettings::get('daily_revenue_target') !== null ? (float) StoreSettings::get('daily_revenue_target') : null,
                'today' => $today['kpis']['revenue'], 'today_orders' => $today['kpis']['orders'],
            ],
            'totals' => [
                'revenue' => Money::json(Money::cents(Order::query()->paid()->sum('total'))),
                'orders' => Order::query()->where('status', '<>', 'failed')->count(),
                'products' => Product::query()->count(),
                'published' => Product::published()->count(),
                'customers' => User::query()->count(),
                'guests' => (int) Order::query()->whereNull('user_id')->distinct()->count('email'),
                'offers' => $offers['running'] + $offers['coupons'],
            ],
            'status' => collect(Order::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($statusCounts[$s] ?? 0)])->all() + ['mix' => $stats['mix']],
            'attention' => [
                'pending' => ['count' => (int) $pending->n, 'oldest' => $pending->oldest ? Carbon::parse($pending->oldest, 'UTC')->toIso8601String() : null],
                'on_hold' => (int) ($statusCounts['on_hold'] ?? 0),
                'out_of_stock' => ['count' => $stock['out_count'], 'sample' => $stock['out']->take(3)->pluck('name')->all()],
                'low_stock' => ['count' => $stock['low_count'], 'sample' => $stock['low']->take(3)->pluck('name')->all()],
                'reviews' => Review::query()->where('status', 'pending')->count(),
                'messages' => Conversation::query()->unreadForAdmin()->count(),
                'ending' => $offers['ending'],
                'stock_alerts' => StockAlert::query()->whereNull('notified_at')->count(),
            ],
            'recent_orders' => $this->recentOrders(),
            'low_stock' => $stock['low']->map(fn ($p) => $this->stockRow($p))->values()->all(),
            'out_of_stock' => $stock['out']->map(fn ($p) => $this->stockRow($p))->values()->all(),
            'offers' => $offers['summary'],
            'top_products' => $this->topProducts($sales),
            'categories' => $sales['categories'],
            'brands' => $sales['brands'],
            'recent_customers' => $this->recentCustomers(),
            'recent_reviews' => Review::query()->with('product:id,name')->latest('created_at')->latest('id')->limit(6)->get()->map(fn (Review $r) => [
                'id' => $r->id, 'product_id' => $r->product_id, 'product_name' => $r->product?->name, 'author' => $r->author_name,
                'rating' => $r->rating, 'title' => $r->title, 'body' => $r->body, 'status' => $r->status, 'created_at' => $r->created_at?->toIso8601String(),
            ])->all(),
            'activity' => self::activity(16),
        ];
    }

    /** Revenue, orders, items, average order and new buyers for a period and the one before, plus the chart. */
    private function orderStats(array $w): array
    {
        $rows = DB::table('orders')->where('status', '<>', 'failed')
            ->where('placed_at', '>=', $w['prev_start']->utc())->where('placed_at', '<=', $w['end']->utc())
            ->get(['status', 'total', 'placed_at']);
        $tz = config('dmd.timezone');
        $start = $w['start']->getTimestamp();
        $prevEnd = $w['prev_end']->getTimestamp();

        $series = [];
        $count = $w['buckets'] === 'hour' ? $w['end']->hour + 1 : $w['days'];
        for ($i = 0; $i < $count; $i++) {
            $series[] = ['t' => ($w['buckets'] === 'hour' ? $w['start']->addHours($i) : $w['start']->addDays($i))->toIso8601String(), 'revenue' => 0, 'orders' => 0];
        }
        $now = ['revenue' => 0, 'orders' => 0, 'paid' => 0];
        $prev = ['revenue' => 0, 'orders' => 0, 'paid' => 0];
        $mix = [];
        foreach ($rows as $r) {
            $placed = CarbonImmutable::parse($r->placed_at, 'UTC');
            $isPaid = in_array($r->status, Order::PAID, true);
            $cents = $isPaid ? Money::cents($r->total) : 0;
            if ($placed->getTimestamp() >= $start) {
                $now['orders']++;
                $now['revenue'] += $cents;
                $now['paid'] += $isPaid ? 1 : 0;
                $mix[$r->status] = ($mix[$r->status] ?? 0) + 1;
                $local = $placed->setTimezone($tz);
                $i = $w['buckets'] === 'hour' ? $local->hour : (int) $w['start']->diffInDays($local->startOfDay());
                if (isset($series[$i])) {
                    $series[$i]['orders']++;
                    $series[$i]['revenue'] += $cents;
                }
            } elseif ($placed->getTimestamp() < $prevEnd) {
                $prev['orders']++;
                $prev['revenue'] += $cents;
                $prev['paid'] += $isPaid ? 1 : 0;
            }
        }
        $items = fn (CarbonInterface $a, CarbonInterface $b, bool $inclusive) => (int) DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', Order::PAID)->where('orders.placed_at', '>=', $a->utc())->where('orders.placed_at', $inclusive ? '<=' : '<', $b->utc())
            ->sum('order_items.quantity');
        $firsts = DB::table('orders')->where('status', '<>', 'failed')->groupBy('email')
            ->havingRaw('MIN(placed_at) >= ?', [$w['prev_start']->utc()])->selectRaw('MIN(placed_at) AS first_at')->pluck('first_at')
            ->map(fn ($t) => CarbonImmutable::parse($t, 'UTC')->getTimestamp());
        $aov = fn (array $x) => $x['paid'] ? intdiv($x['revenue'] + intdiv($x['paid'], 2), $x['paid']) : 0;

        return [
            'kpis' => [
                'revenue' => Money::json($now['revenue']), 'prev_revenue' => Money::json($prev['revenue']),
                'orders' => $now['orders'], 'prev_orders' => $prev['orders'],
                'aov' => Money::json($aov($now)), 'prev_aov' => Money::json($aov($prev)),
                'items' => $items($w['start'], $w['end'], true), 'prev_items' => $items($w['prev_start'], $w['prev_end'], false),
                'new_buyers' => $firsts->filter(fn ($t) => $t >= $start)->count(),
                'prev_new_buyers' => $firsts->filter(fn ($t) => $t < $prevEnd)->count(),
            ],
            'series' => array_map(fn ($b) => ['t' => $b['t'], 'revenue' => Money::json($b['revenue']), 'orders' => $b['orders']], $series),
            'mix' => $mix,
        ];
    }

    /**
     * Paid order lines in a period, per product, and the same money per category (the top of each product's main
     * category) and per brand. Three queries whatever the size: lines grouped by product, the distinct
     * (order, product) pairs for order counts, and one lookup of the products involved.
     */
    private function lineSales(CarbonInterface $from, CarbonInterface $to): array
    {
        $paidLines = fn () => DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', Order::PAID)->where('orders.placed_at', '>=', $from->utc())->where('orders.placed_at', '<=', $to->utc());
        $rows = $paidLines()->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id, MAX(order_items.product_name) AS name, SUM(order_items.quantity) AS units, SUM(order_items.line_total) AS revenue, COUNT(DISTINCT order_items.order_id) AS orders')
            ->get();
        $pairs = $paidLines()->distinct()->get(['order_items.order_id', 'order_items.product_id']);
        $ids = $rows->pluck('product_id')->filter()->all();
        $products = Product::withTrashed()->whereKey($ids)->with(['images:id,product_id,url,position', 'brand:id,name'])
            ->get(['id', 'name', 'brand_id', 'stock_quantity', 'track_stock', 'status', 'deleted_at'])->keyBy('id');
        $primary = DB::table('category_product')->whereIn('product_id', $ids ?: [0])->orderByDesc('is_primary')->orderBy('category_id')->get(['product_id', 'category_id'])
            ->unique('product_id')->pluck('category_id', 'product_id');
        $tree = CategoryTree::load(true);

        // Which category and brand each product's sales count towards.
        $groupOf = function (?int $productId) use ($products, $primary, $tree) {
            $p = $productId ? $products->get($productId) : null;
            $cat = $p && isset($primary[$p->id]) ? ($tree->ancestorIds($primary[$p->id])[0] ?? $primary[$p->id]) : null;
            $name = $cat ? (string) $tree->categories->get($cat)?->name : ($p ? 'Uncategorised' : 'Removed products');
            $key = $cat ?? ($p ? 'none' : 'removed');
            $c = $cat ? $tree->categories->get($cat) : null;
            if ($c && $c->brand_id && $tree->brands->has($c->brand_id)) {
                $name = $tree->brands->get($c->brand_id)->name.' · '.$name; // a brand's product line
            } elseif (! $cat && $p?->brand) {
                [$key, $name] = ["brand-{$p->brand_id}", $p->brand->name.' · no category']; // filed only under its brand
            }

            return ['category' => [$key, $cat, $name], 'brand' => $p?->brand ? [$p->brand_id, $p->brand->name] : null];
        };

        $categories = [];
        $brands = [];
        foreach ($rows as $r) {
            $g = $groupOf($r->product_id);
            [$key, $id, $name] = $g['category'];
            $categories[$key] ??= ['id' => $id, 'name' => $name, 'units' => 0, 'revenue' => 0, 'orders' => []];
            $categories[$key]['units'] += (int) $r->units;
            $categories[$key]['revenue'] += Money::cents($r->revenue);
            if ($g['brand']) {
                [$bid, $bname] = $g['brand'];
                $brands[$bid] ??= ['id' => $bid, 'name' => $bname, 'units' => 0, 'revenue' => 0, 'orders' => []];
                $brands[$bid]['units'] += (int) $r->units;
                $brands[$bid]['revenue'] += Money::cents($r->revenue);
            }
        }
        foreach ($pairs as $pair) { // an order counts once per category and brand, however many of its lines are in it
            $g = $groupOf($pair->product_id);
            $categories[$g['category'][0]]['orders'][$pair->order_id] = true;
            if ($g['brand']) {
                $brands[$g['brand'][0]]['orders'][$pair->order_id] = true;
            }
        }
        $sort = fn (array $list) => collect($list)->sortByDesc('revenue')->values()
            ->map(fn ($e) => ['id' => $e['id'], 'name' => $e['name'], 'units' => $e['units'], 'revenue' => Money::json($e['revenue']), 'orders' => count($e['orders'])])->all();

        return ['rows' => $rows, 'products' => $products, 'categories' => $sort($categories), 'brands' => $sort($brands)];
    }

    private function topProducts(array $sales): array
    {
        return $sales['rows']->sortByDesc(fn ($r) => Money::cents($r->revenue))->take(8)->map(function ($r) use ($sales) {
            $p = $r->product_id ? $sales['products']->get($r->product_id) : null;

            return [
                'id' => $r->product_id, 'name' => $p?->name ?? $r->name, 'units' => (int) $r->units, 'revenue' => Money::json(Money::cents($r->revenue)),
                'orders' => (int) $r->orders, 'image' => $p?->images->first()?->url, 'stock' => $p && $p->track_stock ? $p->stock_quantity : null,
                'on_storefront' => (bool) $p?->isPublished(),
            ];
        })->values()->all();
    }

    /** Published products that are out of stock or running low (the same levels as everywhere else). */
    private function stock(): array
    {
        $base = fn () => Product::published()->with('images:id,product_id,url,position');
        $out = $base();
        ProductQuery::stockLevel($out, 'out');
        $low = $base();
        ProductQuery::stockLevel($low, 'low');

        return [
            'out_count' => (clone $out)->count(), 'low_count' => (clone $low)->count(),
            'out' => $out->orderByDesc('updated_at')->limit(10)->get(), 'low' => $low->orderBy('stock_quantity')->orderBy('name')->limit(10)->get(),
        ];
    }

    private function stockRow(Product $p): array
    {
        return ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'stock_quantity' => $p->track_stock ? $p->stock_quantity : null,
            'threshold' => Inventory::threshold($p), 'availability' => Inventory::availability($p), 'image' => $p->images->first()?->url];
    }

    /** Discounts running now: products below their regular price (own sale or offer), offers and live codes. */
    private function offers(): array
    {
        $soon = now()->addDays(3);
        [$price, $bindings] = ProductQuery::priceExpression();
        $discounted = Product::published()->whereRaw("({$price}) < products.regular_price", $bindings);
        $deepest = (clone $discounted)->with('images:id,product_id,url,position')
            ->orderByRaw("(products.regular_price - ({$price})) / products.regular_price DESC", $bindings)->limit(6)->get();
        $running = Offer::query()->running()->orderByRaw('ends_at IS NULL')->orderBy('ends_at')->get();
        $coupons = Coupon::query()->where('is_active', true)->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))->orderByRaw('expires_at IS NULL')->orderBy('expires_at')->get();
        $salesEnding = Product::published()->whereNotNull('sale_price')->whereBetween('sale_ends_at', [now(), $soon])->count();
        $uses = app(Coupons::class);

        return [
            'running' => $running->count(),
            'coupons' => $coupons->count(),
            'ending' => $salesEnding + $running->filter(fn ($o) => $o->ends_at && $o->ends_at->lte($soon))->count()
                + $coupons->filter(fn ($c) => $c->expires_at && $c->expires_at->lte($soon))->count(),
            'summary' => [
                'on_sale' => $discounted->count(), 'offers' => $running->count(), 'coupons' => $coupons->count(),
                'list' => $deepest->map(function (Product $p) {
                    $price = Pricing::forProduct($p);

                    return ['id' => $p->id, 'name' => $p->name, 'image' => $p->images->first()?->url, 'price' => Money::json($price['price']),
                        'regular_price' => Money::json($price['regular']), 'discount_percent' => (int) round(100 - $price['price'] * 100 / max(1, $price['regular'])),
                        'offer' => $price['offer']['name'] ?? null, 'ends_at' => $price['sale_ends_at']?->toIso8601String()];
                })->all(),
                'running_offers' => $running->take(3)->map(fn (Offer $o) => ['id' => $o->id, 'name' => $o->name, 'discount_type' => $o->discount_type,
                    'discount_value' => (float) $o->discount_value, 'ends_at' => $o->ends_at?->toIso8601String()])->values()->all(),
                'live_coupons' => $coupons->take(3)->map(fn (Coupon $c) => ['id' => $c->id, 'code' => $c->code, 'label' => $c->label(),
                    'uses' => $uses->uses($c), 'usage_limit' => $c->usage_limit, 'expires_at' => $c->expires_at?->toIso8601String()])->values()->all(),
            ],
        ];
    }

    private function recentOrders(): array
    {
        return Order::query()->withSum('items as units', 'quantity')->latest('placed_at')->latest('id')->limit(9)->get()->map(fn (Order $o) => [
            'id' => $o->id, 'number' => $o->number, 'status' => $o->status, 'total' => Money::json(Money::cents($o->total)),
            'customer' => $o->customerName() ?: $o->email, 'email' => $o->email, 'user_id' => $o->user_id, 'units' => (int) $o->units,
            'payment_method' => $o->payment_method, 'placed_at' => $o->placed_at?->toIso8601String(),
        ])->all();
    }

    private function recentCustomers(): array
    {
        return User::query()->latest('created_at')->latest('id')->limit(6)
            ->withCount(['orders as orders_count' => fn (Builder $q) => $q->where('status', '<>', 'failed')])
            ->withSum(['orders as spent' => fn (Builder $q) => $q->whereIn('status', Order::PAID)], 'total')
            ->with(['addresses' => fn ($q) => $q->where('is_default', true)])
            ->get()->map(fn (User $u) => [
                'id' => $u->id, 'name' => $u->fullName() ?: $u->email, 'email' => $u->email, 'city' => $u->addresses->first()?->city,
                'created_at' => $u->created_at?->toIso8601String(), 'orders' => (int) $u->orders_count, 'spent' => Money::json(Money::cents($u->spent ?? 0)),
            ])->all();
    }

    /** The latest things that happened: the owner's actions and the buyers' (orders, reviews, messages…). */
    public static function activity(int $limit): array
    {
        return Activity::query()->with(['admin:id,name'])->latest('id')->limit($limit)->get()->map(fn (Activity $a) => [
            'id' => $a->id, 'at' => $a->created_at?->toIso8601String(), 'action' => $a->action, 'type' => strtok($a->action, '.'),
            'text' => $a->description, 'source' => $a->admin_id ? 'admin' : 'store', 'by' => $a->admin?->name,
            'subject' => $a->subject_type ? ['type' => $a->subject_type, 'id' => $a->subject_id] : null,
        ])->all();
    }
}
