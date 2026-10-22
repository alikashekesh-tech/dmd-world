/* Everything the landing page shows is derived from the live catalog (or the snapshot until it arrives), so counts
   and prices stay honest. Recomputed once per catalog version and shared by every section: useLanding(). */
import { PRODUCTS, sortProducts, catalog, getProduct, HOMEPAGE } from '../../data/index.js';
import { useCatalog } from '../../data/live.js';
import { group, catUrl, resolvePath, inNode, NEW_OFFERS, BRAND_GROUPS, DMD_GROUPS } from '../../data/dmdMenu.js';
import { artFor } from '../art/CategoryArt.jsx';

export const usd = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const from = (list) => (list.length ? Math.min(...list.map((p) => p.price)) : null);
const best = (list, n = 8) => sortProducts(list, 'best').slice(0, n);
const oneOfEach = (list, key, n) => {
  const seen = new Set(); const out = [];
  for (const p of list) if (!seen.has(p[key])) { seen.add(p[key]); out.push(p); }
  for (const p of list) if (out.length < n && !out.includes(p)) out.push(p);
  return out.slice(0, n);
};
const PC_BRANDS = ['razer', 'hyperx', 'logitech', 'marvo', 'fantech', 'e-yooso', 'onikuma', 'megavolt', 'pc-parts'];
export const OFFERS_URL = catUrl('new-offers');
/* The bento grid's places, in reading order (see WorldGrid.module.css), and the size of the first two. */
const AREAS = ['fig', 'retro', 'spk', 'phone', 'lap', 'net', 'car', 'watch'];
const SIZES = ['xl', 'wide'];
/** The menu path (top group → … → node) to a category id, or null. */
function categoryPath(id) {
  const walk = (nodes, path) => {
    for (const node of nodes) {
      const here = [...path, node];
      if (node.id === id) return here;
      const hit = walk(node.children || [], here);
      if (hit) return hit;
    }
    return null;
  };
  return walk(DMD_GROUPS, []);
}
export const BUDGET_STOPS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 250];
function build() {
  const LIVE = PRODUCTS.filter((p) => p.stock !== 'out');

  /* The brand names that roll like credits: the three platforms, then every brand the store lists. */
  const BRANDS = [
    ...[['PlayStation', 'playstation'], ['Nintendo', 'nintendo-switch'], ['Xbox', 'xbox']].filter(([, slug]) => group(slug).slug).map(([name, slug]) => ({ name, to: catUrl(slug) })),
    ...BRAND_GROUPS.map((b) => ({ name: b.name, to: catUrl(b.slug) })),
  ];

  /* Objects on the hero desk. Each links to a shop search or a category, and "from $X" is computed with the same
     rule that page uses to list products, so the cheapest price in the tooltip is the cheapest one you land on. */
  const bySearch = (q) => ({ to: `/shop?q=${encodeURIComponent(q)}`, list: LIVE.filter((p) => p.search.includes(q)) });
  const byCategory = (...path) => {
    const node = resolvePath(path.join('/'))?.at(-1);
    return { to: catUrl(...path), list: node ? LIVE.filter((p) => inNode(p, node)) : [] };
  };
  const SPOTS = [
    { id: 'monitor', label: 'Monitors', ...byCategory('pc-parts', 'monitors') },
    { id: 'chair', label: 'Gaming chairs', ...bySearch('chair') },
    { id: 'headset', label: 'Headsets', ...bySearch('headset') },
    { id: 'keyboard', label: 'Keyboards', ...bySearch('keyboard') },
    { id: 'mouse', label: 'Mice & pads', ...bySearch('mouse') },
    { id: 'controller', label: 'Controllers', ...bySearch('controller') },
    { id: 'console', label: 'PlayStation', ...byCategory('playstation') },
    { id: 'shelf', label: 'Action figures', ...byCategory('other', 'action-figures') },
  ];
  const HOTSPOTS = SPOTS.map(({ list, ...s }) => ({ ...s, from: from(list) }));

  const PLATFORMS = [
    {
      id: 'playstation', name: 'PlayStation', short: 'PlayStation', accent: '#4f8dff',
      count: group('playstation').count, to: catUrl('playstation'),
      line: 'From PS2 classics to PS5, plus PS cards and the accessories that go with them.',
      links: [['PS5', catUrl('playstation', 'ps5')], ['PS5 games', catUrl('playstation', 'ps5', 'games')], ['PS4', catUrl('playstation', 'ps4')], ['PS cards', catUrl('playstation', 'ps-cards')]],
      products: best(LIVE.filter((p) => p.brand === 'playstation')),
    },
    {
      id: 'switch', name: 'Nintendo Switch', short: 'Switch', accent: '#ff4b55',
      count: group('nintendo-switch').count, to: catUrl('nintendo-switch'),
      line: 'New and used games, consoles and the accessories that make handheld nights longer.',
      links: [['Games', catUrl('nintendo-switch', 'games')], ['Used games', catUrl('nintendo-switch', 'games', 'used')], ['Consoles', catUrl('nintendo-switch', 'consoles')], ['Accessories', catUrl('nintendo-switch', 'accessories')]],
      products: best(LIVE.filter((p) => p.brand === 'nintendo-switch')),
    },
    {
      id: 'xbox', name: 'Xbox', short: 'Xbox', accent: '#3ccf6e',
      count: group('xbox').count, to: catUrl('xbox'),
      line: 'Series X|S, One and 360: controllers, games and consoles across three generations.',
      links: [['Xbox Series', catUrl('xbox', 'xbox-series')], ['Xbox One', catUrl('xbox', 'xbox-one')], ['Xbox 360', catUrl('xbox', 'xbox-360')]],
      products: best(LIVE.filter((p) => p.brand === 'xbox')),
    },
    {
      id: 'pc', name: 'PC', short: 'PC', accent: '#a78bfa',
      count: null, to: catUrl('pc-parts'),
      line: 'Keyboards, mice, headsets, chairs and monitors from Razer, HyperX, Logitech, Marvo and more.',
      links: [['Chairs & tables', catUrl('pc-parts', 'chair-and-table')], ['Monitors', catUrl('pc-parts', 'monitors')], ['Laptops', catUrl('laptops')], ['Storage', catUrl('pc-parts', 'hard-disk-and-flash')]],
      products: oneOfEach(sortProducts(LIVE.filter((p) => PC_BRANDS.includes(p.brand)), 'best'), 'brand', 8),
    },
  ];

  /* Offers, deepest real discount first; or the owner's hand-picked ones, in their order (while they're discounted). */
  const dropped = (p) => p && p.stock !== 'out' && p.was && p.was > p.price;
  const picked = (HOMEPAGE.picks.price_drops || []).map((id) => getProduct(String(id))).filter(dropped);
  const OFFERS = picked.length ? picked.slice(0, 8) : LIVE.filter(dropped).sort((a, b) => b.discount - a.discount || b.was - b.price - (a.was - a.price)).slice(0, 8);

  /* Budget stops for the coin stack: most product for the money, closest to the budget first, one per brand before repeats. */
  const underBudget = (max) => {
    const list = LIVE.filter((p) => p.price <= max);
    const picks = oneOfEach([...list].sort((a, b) => b.price - a.price || b.discount - a.discount), 'brand', 6);
    return { count: list.length, picks };
  };

  /* Categories beyond consoles and peripherals. */
  const other = Object.fromEntries(group('other').children.map((c) => [c.slug, c]));
  // A tile whose category the owner removed simply isn't shown.
  const tile = (slug, art, size, node = other[slug]) => (node ? { slug, art, size, name: node.name, count: node.count, to: node === other[slug] ? catUrl('other', slug) : catUrl(node.slug) } : null);
  const builtIn = [
    tile('action-figures', 'figure', 'xl'),
    tile('retro-games-and-consoles', 'retro', 'wide'),
    tile('speakers', 'speaker'),
    tile('phone-accessories', 'phone'),
    tile('laptops', 'laptop', null, group('laptops').slug ? group('laptops') : undefined),
    tile('network-products', 'router'),
    tile('electronic-toys', 'car'),
    tile('smart-watches', 'watch'),
  ].filter(Boolean);
  /* The owner's hand-picked categories take the grid's places in order (each with the drawing its name suggests);
     the built-in tiles fill any places left, so the layout stays whole. */
  const pickedTiles = (HOMEPAGE.picks.world || []).map(categoryPath).filter(Boolean).map((path) => {
    const node = path[path.length - 1];
    return { slug: node.slug, name: node.name, count: node.count, to: catUrl(...path.map((x) => x.slug)), spec: artFor(path) };
  });
  const WORLD = [...pickedTiles, ...builtIn.filter((t) => !pickedTiles.some((p) => p.slug === t.slug))].slice(0, AREAS.length)
    .map((t, i) => ({ ...t, area: AREAS[i], size: SIZES[i] || null }));

  return { HOTSPOTS, PLATFORMS, OFFERS, OFFER_COUNT: NEW_OFFERS.count, underBudget, WORLD, BRANDS };
}

let cache = { v: -1, data: null };
/** The landing page's data for the current catalog version (built once per version, shared by every section). */
export function landing() {
  const v = catalog.version();
  if (cache.v !== v) cache = { v, data: build() };
  return cache.data;
}
export function useLanding() { useCatalog(); return landing(); }
