<?php

namespace App\Services;

use App\Models\Offer;
use App\Models\Product;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What an offer would do before it is saved: how many products it covers that buyers can see, how many would really
 * get cheaper, how many are already cheaper (their own sale or another offer wins: discounts never add up), how many
 * it can't apply to (a fixed amount as large as the price), what it leaves out (drafts, products in the trash, picks
 * that no longer exist), a sample of prices, and the other offers that overlap it.
 *
 * Prices are worked out at the moment the offer would start (now, or its start date) with Pricing::preview, the
 * same rule the shop, product pages, cart and checkout use.
 */
final class OfferPreview
{
    private const SAMPLE = ['decrease' => 6, 'already_cheaper' => 3, 'not_applicable' => 2];

    /**
     * @param  array{discount_type?: ?string, discount_value?: mixed, starts_at?: ?string, ends_at?: ?string, product_ids?: list<int>,
     *   brand_ids?: list<int>, category_ids?: list<int>, entire_store?: bool, offer_id?: ?int, name?: ?string}  $d
     */
    public function run(array $d): array
    {
        $now = now();
        $start = ! empty($d['starts_at']) ? Carbon::parse($d['starts_at']) : null;
        $end = ! empty($d['ends_at']) ? Carbon::parse($d['ends_at']) : null;
        $at = $start && $start->gt($now) ? $start->copy() : $now->copy();
        $exclude = isset($d['offer_id']) ? (int) $d['offer_id'] : null;
        $priced = in_array($d['discount_type'] ?? null, Offer::TYPES, true) && is_numeric($d['discount_value'] ?? null) && (float) $d['discount_value'] > 0
            && ($d['discount_type'] !== 'percent' || (float) $d['discount_value'] < 100);

        $eligible = Offers::eligibleQuery($d)->with(['images:id,product_id,url,position', 'variants'])->orderBy('products.name')->get();
        $outcomes = ['decrease' => 0, 'already_cheaper' => 0, 'not_applicable' => 0];
        $rows = [];
        foreach ($eligible as $p) {
            $row = $this->product($p, $at, $priced ? ['discount_type' => $d['discount_type'], 'discount_value' => $d['discount_value'], 'name' => $d['name'] ?? null] : null, $exclude);
            if ($row['outcome']) {
                $outcomes[$row['outcome']]++;
            }
            $rows[] = $row;
        }

        return [
            'at' => $at->toIso8601String(),
            'priced' => $priced,
            'eligible' => count($rows),
            'outcomes' => $outcomes,
            'left_out' => $this->leftOut($d),
            'per_target' => $this->perTarget($d),
            'sample' => $this->sample($rows),
            'overlaps' => $this->overlaps($eligible->pluck('id')->all(), $start ?? $now, $end, $exclude),
        ];
    }

    /** One product: its price now and with the offer (a variable product: across its variants on sale). */
    private function product(Product $p, CarbonInterface $at, ?array $offer, ?int $exclude): array
    {
        $variants = $p->type === 'variable' ? $p->variants->where('is_active', true)->values() : collect([null]);
        if ($variants->isEmpty()) {
            $variants = collect([null]);
        }
        $lines = $offer ? $variants->map(fn ($v) => Pricing::preview($p, $v, $at, $offer, $exclude)) : collect();
        $base = ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'image' => $p->images->first()?->url, 'variants' => $p->type === 'variable' ? $p->variants->where('is_active', true)->count() : 0];
        if (! $offer) {
            $current = Pricing::forProduct($p, $at)['price'];

            return $base + ['regular' => Money::json(Money::cents($p->regular_price)), 'current' => Money::json($current), 'with' => null, 'outcome' => null, 'saving' => 0, 'reason' => null];
        }
        $decrease = $lines->contains(fn ($l) => $l['with'] < $l['current']);
        $applicable = $lines->contains(fn ($l) => $l['offer_price'] !== null);
        $outcome = $decrease ? 'decrease' : ($applicable ? 'already_cheaper' : 'not_applicable');
        $cheapest = fn (string $k) => $lines->min($k);
        $reason = match ($outcome) {
            'already_cheaper' => ($by = $lines->pluck('cheaper_by')->filter()->first()) === 'sale' || $by === null ? 'Its own sale price is already lower.' : "“{$by}” already gives a lower price.",
            'not_applicable' => 'The discount is as large as the price, so it doesn’t apply.',
            default => null,
        };

        return $base + ['regular' => Money::json($cheapest('regular')), 'current' => Money::json($cheapest('current')), 'with' => Money::json($cheapest('with')),
            'outcome' => $outcome, 'saving' => $lines->max(fn ($l) => $l['current'] - $l['with']), 'reason' => $reason];
    }

    /** Products buyers can see behind each picked brand and category (the numbers on the form's chips). */
    private function perTarget(array $d): array
    {
        $brands = array_values(array_unique(array_map('intval', $d['brand_ids'] ?? [])));
        $byBrand = $brands ? Product::published()->whereIn('brand_id', $brands)->selectRaw('brand_id, count(*) as n')->groupBy('brand_id')->pluck('n', 'brand_id') : collect();
        $categories = array_values(array_unique(array_map('intval', $d['category_ids'] ?? [])));

        return [
            'brands' => (object) collect($brands)->mapWithKeys(fn ($id) => [$id => (int) ($byBrand[$id] ?? 0)])->all(),
            'categories' => (object) collect($categories)->mapWithKeys(fn ($id) => [$id => Offers::eligibleQuery(['category_ids' => [$id]])->count()])->all(),
        ];
    }

    /** A few of each outcome: the biggest price drops first. */
    private function sample(array $rows): array
    {
        $out = [];
        if (! array_filter($rows, fn ($r) => $r['outcome'])) {
            return array_slice($rows, 0, 6);
        }
        foreach (self::SAMPLE as $outcome => $n) {
            $some = array_values(array_filter($rows, fn ($r) => $r['outcome'] === $outcome));
            usort($some, fn ($a, $b) => $b['saving'] <=> $a['saving'] ?: strcmp($a['name'], $b['name']));
            array_push($out, ...array_slice($some, 0, $n));
        }

        return array_map(fn ($r) => array_diff_key($r, ['saving' => 1]), $out);
    }

    /** Targeted products buyers can't see (so the offer leaves them out), and picks that no longer exist. */
    private function leftOut(array $d): array
    {
        $picked = array_values(array_unique(array_map('intval', $d['product_ids'] ?? [])));
        $found = $picked ? Product::withTrashed()->whereKey($picked)->get(['id', 'status', 'deleted_at']) : collect();
        $brands = array_map('intval', $d['brand_ids'] ?? []);
        $categories = Offers::withDescendants(array_map('intval', $d['category_ids'] ?? []));
        $covered = Product::withTrashed()->where(function ($w) use ($picked, $brands, $categories, $d) {
            if (! empty($d['entire_store'])) {
                $w->whereRaw('1 = 1');

                return;
            }
            $w->whereIn('products.id', $picked ?: [0])->orWhereIn('products.brand_id', $brands ?: [0])
                ->orWhereExists(fn ($e) => $e->selectRaw('1')->from('category_product')->whereColumn('category_product.product_id', 'products.id')->whereIn('category_product.category_id', $categories ?: [0]));
        });

        return [
            'drafts' => (clone $covered)->whereNull('deleted_at')->where('status', 'draft')->count(),
            'trashed' => (clone $covered)->whereNotNull('deleted_at')->count(),
            'missing_products' => count($picked) - $found->count(),
        ];
    }

    /** Other switched-on offers whose dates overlap this one and that cover some of the same products. */
    private function overlaps(array $eligibleIds, CarbonInterface $start, ?CarbonInterface $end, ?int $exclude): array
    {
        if (! $eligibleIds) {
            return [];
        }
        $others = Offer::query()->where('is_active', true)->when($exclude, fn ($q) => $q->whereKeyNot($exclude))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $start))
            ->when($end, fn ($q) => $q->where(fn ($w) => $w->whereNull('starts_at')->orWhere('starts_at', '<', $end)))
            ->get();
        if ($others->isEmpty()) {
            return [];
        }
        $mine = array_flip($eligibleIds);
        $coverage = Offers::COVERAGE_SQL;
        $in = implode(',', $others->pluck('id')->map(fn ($id) => (int) $id)->all());
        $shared = [];
        foreach (DB::select("SELECT offer_id, product_id FROM ({$coverage}) x WHERE x.offer_id IN ({$in})") as $r) {
            if (isset($mine[(int) $r->product_id])) {
                $shared[(int) $r->offer_id][(int) $r->product_id] = true;
            }
        }

        return $others->filter(fn ($o) => isset($shared[$o->id]))->map(fn (Offer $o) => [
            'id' => $o->id, 'name' => $o->name, 'state' => $o->state(), 'discount_type' => $o->discount_type, 'discount_value' => (float) $o->discount_value,
            'starts_at' => $o->starts_at?->toIso8601String(), 'ends_at' => $o->ends_at?->toIso8601String(), 'shared' => count($shared[$o->id]),
        ])->sortByDesc('shared')->values()->all();
    }
}
