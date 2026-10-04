import { CATS, PRODUCTS_RAW } from './dmdCatalog.js';
import { DMD_GROUPS } from './dmdMenu.js';

export const IMG_BASE = 'https://dmdworld.store/wp-content/uploads/';
const OFFERS_CAT = 996; // "New Offers"
const catById = {};
/** Category rows: [id, name, slug, parent, count]. Replaced in place when the live catalog arrives. */
export function setCategories(rows) {
  for (const k of Object.keys(catById)) delete catById[k];
  for (const [id, name, slug, parent] of rows) catById[id] = { id, name, slug, parent };
}
setCategories(CATS);
const rootOf = (id) => { let c = catById[id]; while (c && c.parent) c = catById[c.parent]; return c; };

// WooCommerce root id -> our menu group slug
const GROUP_FOR_ROOT = {};
for (const g of DMD_GROUPS) for (const id of g.ids) GROUP_FOR_ROOT[id] = g.slug;
for (const sub of DMD_GROUPS.find((g) => g.slug === 'other').children) for (const id of sub.ids) GROUP_FOR_ROOT[id] = 'other';

const depth = (id) => { let d = 0, c = catById[id]; while (c && c.parent) { d++; c = catById[c.parent]; } return d; };
const tidy = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s).replace(/\bPs(\d)/g, 'PS$1').replace(/NewGames/i, 'New Games').replace(/UsedGames/i, 'Used Games').replace(/\bACC\b/i, 'Accessories').replace(/^Nintendo Switch New Games$/, 'New Games');
export const catName = (id) => tidy(catById[id]?.name || String(id));
const full = (img) => (img ? (/^https?:\/\//.test(img) ? img : `${IMG_BASE}${img}`) : null);
const monthOf = (img) => { const m = String(img || '').match(/(\d{4})\/(\d{2})\//); return m ? `${m[1]}-${m[2]}-15` : '2022-01-01'; };

/**
 * One catalog row → the product shape the storefront uses.
 * Snapshot rows: [id, name, price, regular, catIds, imagePath, inStock].
 * Live rows (/api/catalog) add: lowStockQty (only when running low, else null), totalSales, created (YYYY-MM-DD), sku,
 * and up to five more image URLs.
 */
export function toProduct(row, i) {
  const [id, name, price, regular, cats, img, inStock, lowQty = null, sales = null, created = null, sku = '', more = []] = row;
  const roots = cats.map((c) => rootOf(c)?.id).filter((r) => r && r !== OFFERS_CAT);
  const brandRoot = roots.find((r) => DMD_GROUPS.find((g) => g.brand && g.ids.includes(r)));
  const root = brandRoot || roots[0];
  const group = GROUP_FOR_ROOT[root] || 'other';
  const was = regular > price ? regular : null;
  const detail = cats.filter((c) => c !== OFFERS_CAT).map((c) => catById[c]?.name).filter(Boolean);
  return {
    id: String(id), slug: String(id), name, sub: '', brand: group, cat: String(cats.filter((c) => c !== OFFERS_CAT).sort((a, b) => depth(b) - depth(a))[0] || cats[0]),
    price, was, discount: was ? Math.round((1 - price / was) * 100) : 0,
    stock: !inStock ? 'out' : lowQty != null ? 'low' : 'in', stockCount: lowQty,
    img: full(img), gallery: [img, ...(Array.isArray(more) ? more : [])].map(full).filter(Boolean).slice(0, 6), cats, sku: sku || '',
    colors: [], colorFamilies: [], compat: [], families: [], universal: false, multi: false, conn: null,
    art: { t: 'box' }, r: 0, n: 0, features: [], specs: {}, facets: {}, blurb: '',
    // Real units sold when the live catalog is loaded; the snapshot falls back to the store's own listing order.
    sold: sales ?? 5000 - i * 20, date: created || monthOf(img), tag: cats.includes(OFFERS_CAT) ? 'offer' : null,
    search: `${name} ${detail.join(' ')} ${group} ${sku || ''}`.toLowerCase(),
  };
}

export const DMD_PRODUCTS = PRODUCTS_RAW.map(toProduct);
