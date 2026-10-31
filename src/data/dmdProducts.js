/* Products from the Laravel catalog (/api/v1/catalog) → the shape the storefront's pages and filters use. */
const catById = {};
/** Category rows: [id, name, slug, parentId, count, brandId]. Replaced in place when the catalog arrives. */
export function setCategories(rows) {
  for (const k of Object.keys(catById)) delete catById[k];
  for (const [id, name, slug, parent, , brand = null] of rows) catById[id] = { id, name, slug, parent, brand };
}
const rootOf = (id) => { let c = catById[id], guard = 0; while (c && c.parent && guard++ < 20) c = catById[c.parent]; return c; };

// Names from MySQL are the ones the owner chose.
export const catName = (id) => catById[id]?.name || '';
const full = (img) => img || null;
const BLANK = { sub: '', colors: [], colorFamilies: [], compat: [], families: [], universal: false, multi: false, conn: null, art: { t: 'box' }, r: 0, n: 0, features: [], specs: {}, facets: {}, blurb: '' };

/**
 * One product from /api/v1/catalog → the storefront's product. `brand` is the menu group it belongs to (its brand,
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
    // How many can be bought: the stock in MySQL when tracked (0 when sold out), null when stock isn't tracked.
    maxQty: p.max_quantity ?? null,
    deliveryFee: p.delivery_fee ?? null, // its own delivery price; null = the store's
    img: gallery[0] || null, gallery, cats, sku: p.sku || '', featured: !!p.is_featured,
    r: p.rating?.average || 0, n: p.rating?.count || 0,
    sold: p.units_sold || 0, date: p.published_at || '2022-01-01', tag: offersId != null && cats.includes(offersId) ? 'offer' : null,
    search: `${p.name} ${detail.join(' ')} ${group} ${p.sku || ''}${p.condition ? ` used ${p.condition.replace('_', ' ')}` : ''}`.toLowerCase(),
    // Options a buyer chooses (Colour, Size…) and the variants the store sells, each priced and stocked by the server.
    attributes: p.type === 'variable' && Array.isArray(p.attributes) ? p.attributes : [],
    variants: p.type === 'variable' && Array.isArray(p.variants) ? p.variants.map(variantFromApi) : [],
    // Buy Used: a grade from the admin (like_new…fair), or filed under one of the imported "Used" categories.
    condition: p.condition || null,
    conditionNote: p.condition_note || '',
    used: !!p.condition || detail.some((n) => n.trim().toLowerCase() === 'used'),
  };
}

const variantFromApi = (v) => ({
  id: String(v.id), sku: v.sku || '', options: v.options || {}, image: full(v.image),
  price: v.price, was: v.on_sale ? v.regular_price : null, discount: v.on_sale ? v.discount_percent : 0,
  stock: v.availability === 'out_of_stock' ? 'out' : v.availability === 'low_stock' ? 'low' : 'in', stockCount: v.stock_left ?? null, maxQty: v.max_quantity ?? null,
});

