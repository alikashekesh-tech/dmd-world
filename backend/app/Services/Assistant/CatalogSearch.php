<?php

namespace App\Services\Assistant;

use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\CategoryTree;
use App\Services\ProductQuery;
use Illuminate\Support\Facades\DB;

/**
 * Finds the products a parsed question asks for, best first, in the published catalog (MySQL): real names, prices,
 * stock and links. Relevance comes from the product's name (and brand), its categories and its description, in that
 * order of weight. Nothing is invented: a product is only returned when it is in the store.
 */
final class CatalogSearch
{
    public const PAGE = 4;

    private ?CategoryTree $tree = null;

    /** @var array<int, array{slugs: list<string>, own: list<string>, names: string}> */
    private array $catInfo = [];

    /** Words in the store's names (products, brands, categories): what a typo may be corrected to. */
    public function words(): array
    {
        $words = [];
        $add = function (string $text) use (&$words) {
            foreach (Lexicon::tokens(Lexicon::normalize($text)) as $w) {
                if (mb_strlen($w) >= 4 && ! preg_match('/\d/', $w) && ! Lexicon::isArabic($w)) {
                    $words[$w] = true;
                }
            }
        };
        foreach (Product::published()->pluck('name') as $name) {
            $add($name);
        }
        foreach ($this->tree()->brands as $b) {
            $add($b->name);
        }
        foreach ($this->tree()->categories as $c) {
            $add($c->name);
        }

        return array_keys($words);
    }

    /**
     * @param  array{kinds: list<string>, platforms: list<string>, words: list<string>, min: ?float, max: ?float, sale: bool, used: bool, stock: bool, gaming: bool, sort: ?string, offset: int}  $q
     * @return array{products: list<array>, total: int, platforms: list<string>, unmatched: list<string>, gaming: int}
     */
    public function find(array $q): array
    {
        $rows = $this->candidates($q);
        $scored = [];
        foreach ($rows as $row) {
            $s = $this->score($row, $q);
            if ($s !== null) {
                $scored[] = $s;
            }
        }

        // Words asked for (a model, a colour, a brand, a feature): products that have them come first; the words found
        // nowhere are reported. Then, of the kinds asked for, the best evidence wins (name or category over description).
        $unmatched = [];
        if ($q['words']) {
            $hit = array_filter($scored, fn ($s) => $s['words'] > 0);
            foreach ($q['words'] as $w) {
                if (! array_filter($scored, fn ($s) => in_array($w, $s['found'], true))) {
                    $unmatched[] = $w;
                }
            }
            if ($hit) {
                $best = max(array_map(fn ($s) => $s['where'], $hit)); // name > category > description
                $scored = array_values(array_filter($hit, fn ($s) => $s['where'] === $best));
            } elseif (! $q['kinds']) {
                $scored = [];
            }
        } elseif (! $q['kinds'] && ! $q['platforms'] && ! $q['sale'] && ! $q['used'] && $q['min'] === null && $q['max'] === null) {
            $scored = [];
        }
        if ($q['kinds']) {
            $strong = array_filter($scored, fn ($s) => $s['kind'] === 2);
            $scored = array_values($strong ?: array_filter($scored, fn ($s) => $s['kind'] === 1));
        }

        usort($scored, fn ($a, $b) => $q['sort'] === 'price'
            ? [$b['in'], $a['price'], $a['name']] <=> [$a['in'], $b['price'], $b['name']]
            : [$b['score'], $b['in'], $a['price'], $a['name']] <=> [$a['score'], $a['in'], $b['price'], $b['name']]);
        $scored = $this->mixKinds($scored, $q['kinds']);

        $platforms = [];
        foreach ($scored as $s) {
            $platforms = array_merge($platforms, $s['platforms']);
        }
        $page = array_slice($scored, $q['offset'], self::PAGE);

        return [
            'products' => $this->present(array_column($page, 'id')),
            'total' => count($scored),
            'platforms' => array_values(array_intersect(array_keys(Lexicon::PLATFORMS), array_unique($platforms))),
            'unmatched' => $unmatched,
            'gaming' => count(array_filter($scored, fn ($s) => $s['gaming'])),
        ];
    }

    /** Published products within the price, sale, used and stock limits, with what scoring needs. */
    private function candidates(array $q): array
    {
        [$price, $bindings] = ProductQuery::priceExpression();
        $query = Product::published()
            ->select(['id', 'name', 'brand_id', 'short_description', 'description', 'track_stock', 'stock_quantity', 'stock_status', 'condition'])
            ->selectRaw("({$price}) as effective_price", $bindings);
        ProductQuery::priceBetween($query, $q['min'], $q['max']);
        if ($q['sale']) {
            ProductQuery::onSale($query);
        }
        if ($q['used']) {
            $query->whereNotNull('condition');
        }
        if ($q['stock']) {
            ProductQuery::inStock($query);
        }
        $rows = $query->limit(5000)->get();
        $cats = DB::table('category_product')->whereIn('product_id', $rows->pluck('id'))->get(['product_id', 'category_id'])->groupBy('product_id');
        $brands = $this->tree()->brands;

        return $rows->map(function (Product $p) use ($cats, $brands) {
            $ids = $cats->get($p->id)?->pluck('category_id')->all() ?? [];
            $slugs = [];
            $own = [];
            $names = [];
            foreach ($ids as $id) {
                $info = $this->category($id);
                $slugs = array_merge($slugs, $info['slugs']);
                $own = array_merge($own, $info['own']);
                $names[] = $info['names'];
            }
            $description = Lexicon::normalize(mb_substr(html_entity_decode(strip_tags(($p->short_description ?? '').' '.($p->description ?? ''))), 0, 4000));

            return [
                'id' => $p->id,
                'name' => Lexicon::normalize(str_replace('-', ' ', $p->name)),
                'brand' => Lexicon::normalize(str_replace('-', ' ', (string) $brands->get($p->brand_id)?->name)),
                'slugs' => array_unique($slugs),
                'own' => array_unique($own),
                'cats' => Lexicon::normalize(str_replace('-', ' ', implode(' ', $names))),
                'description' => str_replace('-', ' ', $description),
                'price' => (float) $p->effective_price,
                'in' => $p->stock_status !== 'out_of_stock' && (! $p->track_stock || $p->stock_quantity > 0) ? 1 : 0,
            ];
        })->all();
    }

    /** null when the product isn't wanted; otherwise how well it fits. */
    private function score(array $p, array $q): ?array
    {
        $score = 0.0;
        $kind = 0; // 2: by name or category, 1: by description only

        foreach ($q['kinds'] as $key) {
            $k = Lexicon::KINDS[$key];
            if (array_filter($k['not_names'] ?? [], fn ($t) => Lexicon::has($p['name'], $t)) || array_intersect($k['not_cats'] ?? [], $p['own'])) {
                continue;
            }
            $byName = (bool) array_filter($k['names'], fn ($t) => Lexicon::has($p['name'], $t));
            $byCat = (bool) array_intersect($k['cats'], ! empty($k['shallow']) ? $p['own'] : $p['slugs']);
            $byText = (bool) array_filter($k['names'], fn ($t) => Lexicon::has($p['description'], $t));
            $strong = match ($k['match']) {
                'name' => $byName, 'category' => $byCat, default => $byName || $byCat
            };
            if ($strong) {
                $kind = 2;
                $score = max($score, ($byName ? 4 : 0) + ($byCat ? 3 : 0));
            } elseif ($byText && $k['match'] !== 'category' && $kind < 2) {
                $kind = 1;
                $score = max($score, 1);
            }
        }
        if ($q['kinds'] && $kind === 0) {
            return null;
        }

        // Consoles: in that console's categories, or named for it.
        $platforms = [];
        foreach (Lexicon::PLATFORMS as $key => $pl) {
            if (array_intersect($pl['cats'], $p['slugs']) || array_filter($pl['names'], fn ($t) => Lexicon::has($p['name'], $t))) {
                $platforms[] = $key;
            }
        }
        if ($q['platforms']) {
            if (! array_intersect($q['platforms'], $platforms)) {
                return null;
            }
            $score += 1;
        }

        $found = [];
        $where = 0; // 3: name or brand, 2: category, 1: description
        $hits = 0.0;
        foreach ($q['words'] as $w) {
            if (Lexicon::has($p['name'], $w) || Lexicon::has($p['brand'], $w)) {
                [$hits, $where] = [$hits + 2, max($where, 3)];
            } elseif (Lexicon::has($p['cats'], $w)) {
                [$hits, $where] = [$hits + 1, max($where, 2)];
            } elseif (Lexicon::has($p['description'], $w)) {
                [$hits, $where] = [$hits + 0.5, max($where, 1)];
            } else {
                continue;
            }
            $found[] = $w;
        }
        $score += $hits;
        if (array_filter($q['said'] ?? [], fn ($t) => Lexicon::has($p['name'], $t))) {
            $score += 2;
        }
        $gaming = Lexicon::has($p['name'], 'gaming') || Lexicon::has($p['name'], 'gamer');
        if ($q['gaming'] && $gaming) {
            $score += 1;
        }

        return ['id' => $p['id'], 'name' => $p['name'], 'price' => $p['price'], 'in' => $p['in'], 'score' => $score, 'kind' => $kind,
            'words' => count($found), 'found' => $found, 'where' => $where, 'platforms' => $platforms, 'kinds' => $q['kinds'], 'gaming' => $gaming];
    }

    /** With two kinds asked for ("a headset and a mouse"), take turns so both show. */
    private function mixKinds(array $scored, array $kinds): array
    {
        if (count($kinds) < 2) {
            return $scored;
        }
        $byKind = [];
        foreach ($scored as $s) {
            $byKind[$this->kindOf($s, $kinds)][] = $s;
        }
        $out = [];
        while ($byKind) {
            foreach (array_keys($byKind) as $k) {
                $out[] = array_shift($byKind[$k]);
                if (! $byKind[$k]) {
                    unset($byKind[$k]);
                }
            }
        }

        return $out;
    }

    private function kindOf(array $s, array $kinds): string
    {
        $name = $s['name'];
        foreach ($kinds as $key) {
            if (array_filter(Lexicon::KINDS[$key]['names'], fn ($t) => Lexicon::has($name, $t))) {
                return $key;
            }
        }

        return $kinds[0];
    }

    /** The products as the shop shows them (price, stock, picture, link), in the given order. */
    private function present(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $models = Product::published()->with(['images:id,product_id,url,position', 'categories:id,name', 'variants', 'brand:id,name'])
            ->whereIn('id', $ids)->get()->keyBy('id');

        return collect($ids)->filter(fn ($id) => $models->has($id))->map(function ($id) use ($models) {
            $r = (new ProductResource($models[$id]))->resolve();

            return [
                'id' => $r['id'], 'name' => $r['name'], 'price' => $r['price'], 'regular_price' => $r['regular_price'], 'on_sale' => $r['on_sale'],
                'availability' => $r['availability'], 'from' => $r['type'] === 'variable', 'image' => $r['image'],
                'url' => '/product/'.$r['id'], 'condition' => $r['condition'],
            ];
        })->values()->all();
    }

    private function tree(): CategoryTree
    {
        return $this->tree ??= CategoryTree::load();
    }

    /** A category's slug and its parents' slugs (for "anything under Games"), its own slug, and its names. */
    private function category(int $id): array
    {
        if (isset($this->catInfo[$id])) {
            return $this->catInfo[$id];
        }
        $tree = $this->tree();
        $c = $tree->categories->get($id);
        if (! $c) {
            return $this->catInfo[$id] = ['slugs' => [], 'own' => [], 'names' => ''];
        }
        $chain = array_filter(array_map(fn ($a) => $tree->categories->get($a), [...$tree->ancestorIds($id), $id]));

        return $this->catInfo[$id] = [
            'slugs' => array_values(array_map(fn ($x) => $x->slug, $chain)),
            'own' => [$c->slug],
            'names' => implode(' ', array_map(fn ($x) => $x->name, $chain)),
        ];
    }
}
