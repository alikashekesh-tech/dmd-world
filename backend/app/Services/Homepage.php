<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Activity;
use App\Models\Admin;
use App\Models\Banner;
use App\Models\Category;
use App\Models\HomepageItem;
use App\Models\HomepageSection;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * What the storefront home shows: its sections in the owner's order (hidden ones skipped), hand-picked products
 * and categories where a section takes them, and the banners. Sent inside the catalog payload, so the home page
 * needs no extra request and any change shows on the next catalog load.
 */
final class Homepage
{
    public static function payload(): array
    {
        $sections = HomepageSection::query()->with('items')->orderBy('position')->get();

        return [
            'sections' => $sections->map(fn (HomepageSection $s) => ['key' => $s->key, 'visible' => $s->is_visible])->values()->all(),
            'picks' => $sections->filter(fn ($s) => HomepageSection::KEYS[$s->key] ?? null)
                ->mapWithKeys(fn ($s) => [$s->key => $s->items->where('item_type', HomepageSection::KEYS[$s->key])->pluck('item_id')->values()->all()])->all(),
            'banners' => Banner::showing()->where('placement', 'home')->orderBy('position')->orderBy('id')->get()->map(fn ($b) => self::banner($b))->all(),
            'announcement' => ($a = Banner::showing()->where('placement', 'announcement')->orderBy('position')->orderBy('id')->first()) ? self::banner($a) : null,
        ];
    }

    public static function banner(Banner $b): array
    {
        return ['id' => $b->id, 'title' => $b->title, 'text' => $b->text, 'link_url' => $b->link_url, 'link_label' => $b->link_label, 'image_url' => $b->image_url,
            'ends_at' => $b->ends_at?->toIso8601String()];
    }

    /** @param list<array{key: string, visible: bool}> $sections every section, in the new order */
    public function arrange(array $sections, ?Admin $by = null): void
    {
        $keys = array_column($sections, 'key');
        if (count($keys) !== count(array_unique($keys)) || array_diff(array_keys(HomepageSection::KEYS), $keys) || array_diff($keys, array_keys(HomepageSection::KEYS))) {
            throw new ApiException(422, 'SECTIONS_INCOMPLETE', 'Send every home page section once, in the new order.', ['sections' => ['Send every home page section once, in the new order.']]);
        }
        DB::transaction(function () use ($sections) {
            foreach ($sections as $i => $s) {
                $row = HomepageSection::find($s['key']) ?? (new HomepageSection)->forceFill(['key' => $s['key']]);
                $row->forceFill(['position' => $i + 1, 'is_visible' => (bool) $s['visible']])->save();
            }
        });
        Activity::record('homepage.arranged', 'Rearranged the home page', null, $by);
    }

    /** Hand-picks the products (price_drops) or categories (world) a section shows, in order; none: automatic. */
    public function pick(string $key, array $ids, ?Admin $by = null): void
    {
        $type = HomepageSection::KEYS[$key] ?? null;
        if (! $type) {
            throw new ApiException(422, 'NO_PICKS', 'This section chooses what it shows by itself.');
        }
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (count($ids) > HomepageSection::MAX_ITEMS) {
            throw new ApiException(422, 'TOO_MANY_PICKS', 'Pick up to '.HomepageSection::MAX_ITEMS.'.', ['ids' => ['Pick up to '.HomepageSection::MAX_ITEMS.'.']]);
        }
        $found = $type === 'product' ? Product::published()->whereKey($ids)->count() : Category::query()->whereKey($ids)->count();
        if ($found !== count($ids)) {
            $what = $type === 'product' ? 'products isn’t on the storefront' : 'categories doesn’t exist';
            throw new ApiException(422, 'UNKNOWN_PICK', "One of the {$what}.", ['ids' => ["One of the {$what}."]]);
        }
        DB::transaction(function () use ($key, $type, $ids) {
            HomepageItem::where('section_key', $key)->delete();
            HomepageItem::insert(array_map(fn ($id, $i) => ['section_key' => $key, 'item_type' => $type, 'item_id' => $id, 'position' => $i + 1], $ids, array_keys($ids)));
        });
        Catalog::bust();
        Activity::record('homepage.picked', $ids ? 'Hand-picked '.count($ids)." items for the home page’s {$key} section" : "The home page’s {$key} section now chooses automatically", null, $by);
    }
}
