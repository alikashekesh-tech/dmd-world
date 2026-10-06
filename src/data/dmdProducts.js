import { CATS, PRODUCTS_RAW } from './dmdCatalog.js';
import { DMD_GROUPS } from './dmdMenu.js';
import { LARAVEL } from '../lib/backend.js';

export const IMG_BASE = 'https://dmdworld.store/wp-content/uploads/';
const OFFERS_CAT = 996; // "New Offers" (legacy id)
const catById = {};
/** Category rows: [id, name, slug, parentId, count, brandId]. Replaced in place when the catalog arrives. */
export function setCategories(rows) {
  for (const k of Object.keys(catById)) delete catById[k];
  for (const [id, name, slug, parent, , brand = null] of rows) catById[id] = { id, name, slug, parent, brand };
}
if (!LARAVEL) setCategories(CATS);
const rootOf = (id) => { let c = catById[id], guard = 0; while (c && c.parent && guard++ < 20) c = catById[c.parent]; return c; };

// WooCommerce root id -> our menu group slug (legacy Node catalog only)
const GROUP_FOR_ROOT = {};
for (const g of DMD_GROUPS) for (const id of g.ids) GROUP_FOR_ROOT[id] = g.slug;
for (const sub of DMD_GROUPS.find((g) => g.slug === 'other')?.children || []) for (const id of sub.ids) GROUP_FOR_ROOT[id] = 'other';

const depth = (id) => { let d = 0, c = catById[id]; while (c && c.parent && d < 20) { d++; c = catById[c.parent]; } return d; };
const tidy = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s).replace(/\bPs(\d)/g, 'PS$1').replace(/NewGames/i, 'New Games').replace(/UsedGames/i, 'Used Games').replace(/\bACC\b/i, 'Accessories').replace(/^Nintendo Switch New Games$/, 'New Games');
// Names from MySQL are already the ones the owner chose; the old store's need tidying.
export const catName = (id) => (LARAVEL ? catById[id]?.name || '' : tidy(catById[id]?.name || String(id)));
const full = (img) => (img ? (/^(https?:\/\/|\/)/.test(img) ? img : `${IMG_BASE}${img}`) : null);
const monthOf = (img) => { const m = String(img || '').match(/(\d{4})\/(\d{2})\//); return m ? `${m[1]}-${m[2]}-15` : '2022-01-01'; };
const BLANK = { sub: '', colors: [], colorFamilies: [], compat: [], families: [], universal: false, multi: false, conn: null, art: { t: 'box' }, r: 0, n: 0, features: [], specs: {}, facets: {}, blurb: '' };

/**
 * Legacy (Node) catalog row → the product shape the storefront uses.
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
    ...BLANK,
    id: String(id), slug: String(id), name, brand: group, cat: String(cats.filter((c) => c !== OFFERS_CAT).sort((a, b) => depth(b) - depth(a))[0] || cats[0]),
    price, was, discount: was ? Math.round((1 - price / was) * 100) : 0,
    stock: !inStock ? 'out' : lowQty != null ? 'low' : 'in', stockCount: lowQty,
    img: full(img), gallery: [img, ...(Array.isArray(more) ? more : [])].map(full).filter(Boolean).slice(0, 6), cats, sku: sku || '',
    // Real units sold when the live catalog is loaded; the snapshot falls back to the store's own listing order.
    sold: sales ?? 5000 - i * 20, date: created || monthOf(img), tag: cats.includes(OFFERS_CAT) ? 'offer' : null,
    search: `${name} ${detail.join(' ')} ${group} ${sku || ''}`.toLowerCase(),
  };
}

/**
 * Laravel: one product from /api/v1/catalog → the same shape. `brand` is the menu group it belongs to (its brand,
 * or the top-level category of its main category), which is what the brand filter and labels use.
 */
export function fromApi(p, { brandSlug, offersId }) {
  const cats = Array.isArray(p.category_ids) ? p.category_ids : [];
  const main = p.primary_category_id ?? cats.find((c) => c !== offersId) ?? cats[0];
  const root = rootOf(main);
  const group = (p.brand_id != null && brandSlug(p.brand_id)) || (root?.brand != null ? brandSlug(root.brand) : root?.slug) || 'other';
  const detail = cats.map((c) => catById[c]?.name).filter(Boolean);
  const gallery = (p.images?.length ? p.images : [p.image]).map(full).filter(Boolean);
  return {
    ...BLANK,
    id: String(p.id), slug: String(p.id), name: p.name, brand: group, brandId: p.brand_id ?? null, cat: String(main ?? ''),
    price: p.price, was: p.on_sale ? p.regular_price : null, discount: p.on_sale ? p.discount_percent : 0, saleEndsAt: p.sale_ends_at || null,
    stock: p.availability === 'out_of_stock' ? 'out' : p.availability === 'low_stock' ? 'low' : 'in', stockCount: p.stock_left ?? null,
    img: gallery[0] || null, gallery, cats, sku: p.sku || '', featured: !!p.is_featured,
    r: p.rating?.average || 0, n: p.rating?.count || 0,
    sold: p.units_sold || 0, date: p.published_at || '2022-01-01', tag: offersId != null && cats.includes(offersId) ? 'offer' : null,
    search: `${p.name} ${detail.join(' ')} ${group} ${p.sku || ''}`.toLowerCase(),
  };
}

export const DMD_PRODUCTS = LARAVEL ? [] : PRODUCTS_RAW.map(toProduct);
