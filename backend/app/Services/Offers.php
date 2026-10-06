<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Category;
use App\Models\Offer;
use App\Models\OfferTarget;
use App\Models\Product;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Store-wide offers. The owner picks products and/or categories; Pricing applies the best running offer to each
 * covered product, so a product's own prices are never rewritten and switching an offer off restores nothing
 * because nothing was changed. offer_categories (each picked category plus everything below it) is derived here
 * whenever an offer's targets or the category tree change, so SQL can sort and filter by the same price.
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

    /** @param array{name: string, label: ?string, discount_type: string, discount_value: mixed, starts_at: ?string, ends_at: ?string, is_active: bool, product_ids: list<int>, category_ids: list<int>} $data */
    public function save(Offer $offer, array $data, ?Admin $by = null): Offer
    {
        $products = array_values(array_unique(array_map('intval', $data['product_ids'] ?? [])));
        $categories = array_values(array_unique(array_map('intval', $data['category_ids'] ?? [])));
        if (! $products && ! $categories) {
            throw new ApiException(422, 'NO_TARGETS', 'Pick at least one product or category.', ['product_ids' => ['Pick at least one product or category.']]);
        }
        if (count($products) !== Product::withTrashed()->whereKey($products)->count()) {
            throw new ApiException(422, 'UNKNOWN_PRODUCT', 'One of the products doesn’t exist.', ['product_ids' => ['One of the products doesn’t exist.']]);
        }
        if (count($categories) !== Category::withTrashed()->whereKey($categories)->count()) {
            throw new ApiException(422, 'UNKNOWN_CATEGORY', 'One of the categories doesn’t exist.', ['category_ids' => ['One of the categories doesn’t exist.']]);
        }
        $created = ! $offer->exists;

        DB::transaction(function () use ($offer, $data, $by, $products, $categories) {
            $offer->forceFill([
                'name' => $data['name'], 'label' => $data['label'] ?? null,
                'discount_type' => $data['discount_type'], 'discount_value' => Money::decimal(Money::cents($data['discount_value'])),
                'starts_at' => $data['starts_at'] ?? null, 'ends_at' => $data['ends_at'] ?? null, 'is_active' => (bool) ($data['is_active'] ?? true),
            ] + ($offer->exists ? [] : ['created_by' => $by?->id]))->save();
            OfferTarget::where('offer_id', $offer->id)->delete();
            $rows = [...array_map(fn ($id) => ['offer_id' => $offer->id, 'target_type' => 'product', 'target_id' => $id], $products),
                ...array_map(fn ($id) => ['offer_id' => $offer->id, 'target_type' => 'category', 'target_id' => $id], $categories)];
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
        $rows = DB::select(<<<'SQL'
            SELECT o.id, o.name, o.label, o.discount_type, o.discount_value, o.starts_at, o.ends_at, x.product_id
            FROM offers o
            JOIN (
                SELECT offer_id, target_id AS product_id FROM offer_targets WHERE target_type = 'product'
                UNION
                SELECT oc.offer_id, cp.product_id FROM offer_categories oc JOIN category_product cp ON cp.category_id = oc.category_id
            ) x ON x.offer_id = o.id
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
