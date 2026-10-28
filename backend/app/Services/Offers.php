<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Offer;
use App\Models\OfferTarget;
use App\Models\Product;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Store-wide offers. The owner picks any mix of products, brands (products.brand_id, whatever their categories) and
 * categories (each with everything below it), or the entire store; Pricing applies the best running offer to each
 * covered product, so a product's own prices are never rewritten and switching an offer off restores nothing
 * because nothing was changed. offer_categories (each picked category plus everything below it) is derived here
 * whenever an offer's targets or the category tree change, so SQL can sort and filter by the same price.
 *
 * Targets are offer_targets rows: product | brand | category (target_id) or store (target_id 0).
 * Eligible products are the covered ones a buyer can see: published and not in the trash.
 */
final class Offers
{
    /** Called by Offer model events and after targets change: prices everywhere follow at once. */
    public static function changed(): void
    {
        DB::afterCommit(function () {
            Cache::forever('offers:version', (string) hrtime(true));
            app()->forgetInstance('dmd.offers');
        });
        Catalog::bust();
    }

    /** The SQL target types; `store` covers every product. */
    public const TARGETS = ['product', 'brand', 'category', 'store'];

    /**
     * (offer_id, product_id) for every product an offer covers, eligible or not: the one definition the price index,
     * the admin counts and the overlap check all use (ProductQuery::priceExpression is its per-product twin).
     */
    public const COVERAGE_SQL = <<<'SQL'
        SELECT offer_id, target_id AS product_id FROM offer_targets WHERE target_type = 'product'
        UNION SELECT oc.offer_id, cp.product_id FROM offer_categories oc JOIN category_product cp ON cp.category_id = oc.category_id
        UNION SELECT t.offer_id, p.id FROM offer_targets t JOIN products p ON p.brand_id = t.target_id WHERE t.target_type = 'brand'
        UNION SELECT t.offer_id, p.id FROM offer_targets t CROSS JOIN products p WHERE t.target_type = 'store'
        SQL;

    /**
     * @param array{name: string, label: ?string, discount_type: string, discount_value: mixed, starts_at: ?string, ends_at: ?string, is_active: bool,
     *   product_ids?: list<int>, brand_ids?: list<int>, category_ids?: list<int>, entire_store?: bool} $data
     */
    public function save(Offer $offer, array $data, ?Admin $by = null): Offer
    {
        $ids = fn (string $key) => array_values(array_unique(array_map('intval', $data[$key] ?? [])));
        [$products, $brands, $categories] = [$ids('product_ids'), $ids('brand_ids'), $ids('category_ids')];
        $store = (bool) ($data['entire_store'] ?? false);
        if (! $products && ! $brands && ! $categories && ! $store) {
            throw new ApiException(422, 'NO_TARGETS', 'Choose what the offer covers: products, brands, categories or the entire store.', ['targets' => ['Choose what the offer covers: products, brands, categories or the entire store.']]);
        }
        // New picks must exist. Ones already saved on this offer may have been deleted since: they are kept (and shown
        // as deleted) rather than blocking an unrelated change, and cover nothing.
        $saved = $offer->exists ? OfferTarget::where('offer_id', $offer->id)->get()->groupBy('target_type')->map(fn ($g) => $g->pluck('target_id')->map(fn ($v) => (int) $v)->all()) : collect();
        foreach ([['product', $products, Product::class, 'product_ids', 'UNKNOWN_PRODUCT', 'products'], ['brand', $brands, Brand::class, 'brand_ids', 'UNKNOWN_BRAND', 'brands'], ['category', $categories, Category::class, 'category_ids', 'UNKNOWN_CATEGORY', 'categories']] as [$type, $list, $model, $field, $code, $noun]) {
            $new = array_values(array_diff($list, $saved->get($type, [])));
            if ($new && count($new) !== $model::withTrashed()->whereKey($new)->count()) {
                throw new ApiException(422, $code, "One of the {$noun} doesn’t exist any more. Remove it and try again.", [$field => ["One of the {$noun} doesn’t exist any more. Remove it and try again."]]);
            }
        }
        $created = ! $offer->exists;

        DB::transaction(function () use ($offer, $data, $by, $products, $brands, $categories, $store) {
            $offer->forceFill([
                'name' => $data['name'], 'label' => $data['label'] ?? null,
                'discount_type' => $data['discount_type'], 'discount_value' => Money::decimal(Money::cents($data['discount_value'])),
                'starts_at' => $data['starts_at'] ?? null, 'ends_at' => $data['ends_at'] ?? null, 'is_active' => (bool) ($data['is_active'] ?? true),
            ] + ($offer->exists ? [] : ['created_by' => $by?->id]))->save();
            OfferTarget::where('offer_id', $offer->id)->delete();
            $row = fn (string $type) => fn ($id) => ['offer_id' => $offer->id, 'target_type' => $type, 'target_id' => $id];
            $rows = [...array_map($row('product'), $products), ...array_map($row('brand'), $brands), ...array_map($row('category'), $categories),
                ...($store ? [$row('store')(0)] : [])];
            OfferTarget::insert($rows);
            $this->expand($offer->id);
        });
        self::changed();
        $what = Money::cents($offer->discount_value);
        Activity::record($created ? 'offer.created' : 'offer.updated', ($created ? 'Created' : 'Updated')." offer “{$offer->name}” (".($offer->discount_type === 'percent' ? (float) $offer->discount_value.'%' : '$'.Money::decimal($what)).' off)', $offer, $by);

        return $offer->refresh();
    }

    public function delete(Offer $offer, ?Admin $by = null): void
    {
        $offer->delete();
        Activity::record('offer.deleted', "Deleted offer “{$offer->name}”. Prices are back to normal.", null, $by);
    }

    /** offer_categories for one offer: each picked category and every category below it (archived ones included). */
    public function expand(int $offerId): void
    {
        $picked = OfferTarget::where('offer_id', $offerId)->where('target_type', 'category')->pluck('target_id')->all();
        DB::table('offer_categories')->where('offer_id', $offerId)->delete();
        foreach (array_chunk(self::withDescendants($picked), 500) as $chunk) {
            DB::table('offer_categories')->insert(array_map(fn ($id) => ['offer_id' => $offerId, 'category_id' => $id], $chunk));
        }
    }

    /** The category tree changed (a category moved, was added or removed): re-derive every offer's categories. */
    public static function treeChanged(): void
    {
        DB::afterCommit(function () {
            $self = app(self::class);
            $offers = OfferTarget::where('target_type', 'category')->distinct()->pluck('offer_id');
            foreach ($offers as $id) {
                $self->expand((int) $id);
            }
            if ($offers->isNotEmpty()) {
                self::changed();
            }
        });
    }

    /** @param list<int> $ids  @return list<int> the ids and all their descendants */
    public static function withDescendants(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $children = [];
        foreach (Category::withTrashed()->whereNotNull('parent_id')->get(['id', 'parent_id']) as $c) {
            $children[$c->parent_id][] = $c->id;
        }
        $seen = [];
        $queue = array_map('intval', $ids);
        while ($queue) {
            $id = array_pop($queue);
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            array_push($queue, ...($children[$id] ?? []));
        }
        $existing = Category::withTrashed()->whereKey(array_keys($seen))->pluck('id')->all();

        return array_map('intval', $existing);
    }

    /**
     * The products a set of targets covers that buyers can see (published, not in the trash), as a query. The same
     * rule as COVERAGE_SQL, for targets that may not be saved yet (the form's live preview).
     *
     * @param  array{product_ids?: list<int>, brand_ids?: list<int>, category_ids?: list<int>, entire_store?: bool}  $t
     */
    public static function eligibleQuery(array $t): Builder
    {
        $q = Product::query()->published();
        if (! empty($t['entire_store'])) {
            return $q;
        }
        $products = array_map('intval', $t['product_ids'] ?? []);
        $brands = array_map('intval', $t['brand_ids'] ?? []);
        $categories = self::withDescendants(array_map('intval', $t['category_ids'] ?? []));
        if (! $products && ! $brands && ! $categories) {
            return $q->whereRaw('1 = 0');
        }

        return $q->where(function (Builder $w) use ($products, $brands, $categories) {
            $w->whereIn('products.id', $products ?: [0])->orWhereIn('products.brand_id', $brands ?: [0])
                ->orWhereExists(fn ($e) => $e->selectRaw('1')->from('category_product')->whereColumn('category_product.product_id', 'products.id')->whereIn('category_product.category_id', $categories ?: [0]));
        });
    }

    /** @return array<int, int> offer id → eligible products it covers (published, not in the trash), in one query */
    public static function eligibleCounts(array $offerIds): array
    {
        if (! $offerIds) {
            return [];
        }
        $coverage = self::COVERAGE_SQL;
        $in = implode(',', array_map('intval', $offerIds));

        return collect(DB::select(<<<SQL
            SELECT x.offer_id, COUNT(DISTINCT x.product_id) AS n FROM ({$coverage}) x
            JOIN products p ON p.id = x.product_id AND p.status = 'published' AND p.deleted_at IS NULL
            WHERE x.offer_id IN ({$in}) GROUP BY x.offer_id
            SQL))->mapWithKeys(fn ($r) => [(int) $r->offer_id => (int) $r->n])->all();
    }

    /**
     * Offers running at $at for one product: [{id, name, label, discount_type, discount_value, ends_at}].
     * Built with one query for all products and kept for the request (re-read when an offer changes, and at
     * least every minute in a long-running process).
     */
    public function runningFor(int $productId, CarbonInterface $at): array
    {
        $out = [];
        foreach ($this->index()[$productId] ?? [] as $o) {
            if (($o['starts_at'] === null || $o['starts_at'] <= $at->getTimestamp()) && ($o['ends_at'] === null || $o['ends_at'] > $at->getTimestamp())) {
                $out[] = $o;
            }
        }

        return $out;
    }

    /** @return array<int, list<array>> product id → switched-on offers that haven't ended (dates checked per call) */
    private function index(): array
    {
        $app = app();
        $memo = $app->bound('dmd.offers') ? $app->make('dmd.offers') : null;
        $version = $memo && $memo['checked'] > microtime(true) - 60 ? $memo['version'] : (string) Cache::get('offers:version', '0');
        if ($memo && $memo['version'] === $version && $memo['built'] > microtime(true) - 60) {
            return $memo['index'];
        }
        $coverage = self::COVERAGE_SQL;
        $rows = DB::select(<<<SQL
            SELECT o.id, o.name, o.label, o.discount_type, o.discount_value, o.starts_at, o.ends_at, x.product_id
            FROM offers o
            JOIN ({$coverage}) x ON x.offer_id = o.id
            WHERE o.is_active = 1 AND (o.ends_at IS NULL OR o.ends_at > ?)
            SQL, [now()->subMinute()->toDateTimeString()]);
        $index = [];
        foreach ($rows as $r) {
            $index[(int) $r->product_id][] = [
                'id' => (int) $r->id, 'name' => $r->name, 'label' => $r->label, 'discount_type' => $r->discount_type, 'discount_value' => (string) $r->discount_value,
                'starts_at' => $r->starts_at ? strtotime($r->starts_at.' UTC') : null, 'ends_at' => $r->ends_at ? strtotime($r->ends_at.' UTC') : null,
                'ends_at_iso' => $r->ends_at ? gmdate('Y-m-d\TH:i:s\Z', strtotime($r->ends_at.' UTC')) : null,
            ];
        }
        $app->instance('dmd.offers', ['version' => $version, 'checked' => microtime(true), 'built' => microtime(true), 'index' => $index]);

        return $index;
    }
}
