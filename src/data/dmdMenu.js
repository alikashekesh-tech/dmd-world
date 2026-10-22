/* DMD World category tree: the groups of the mega menu, mobile menu, category and brand pages.
   URLs: /product-category/<group>/<sub>/...
   Built from MySQL when the catalog arrives (applyTaxonomy): categories, brands and their product lines exactly as the
   owner manages them in the admin. The exported objects keep their identity (they are refilled in place), so every
   importer stays valid. */
const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const n = (name, ids, children = [], extra = {}) => ({ name, slug: slugify(name), ids: ids || [], children, ...extra });
/* ── the exported tree (filled by applyTaxonomy) ── */
export const DMD_GROUPS = [];
// Mega-menu sections: how the groups are bucketed in the left column.
export const MENU_SECTIONS = [];
export const NEW_OFFERS = n('New Offers', [], [], { art: { t: 'light', a: '#ff5d4d' }, blurb: 'The latest discounts across the store' });
export const groupBySlug = {};
export const BRAND_GROUPS = [];
const EMPTY = Object.freeze({ name: '', slug: '', ids: [], allIds: [], children: [], path: [], count: 0 });
/** A group by slug, or an empty one (a group the owner archived or renamed never breaks a page). */
export const group = (slug) => groupBySlug[slug] || EMPTY;

// Give every node its full id set (own + descendants) and its URL path.
const prep = (node, path = []) => {
  node.path = [...path, node.slug];
  node.allIds = [...node.ids, ...node.children.flatMap((c) => prep(c, node.path).allIds)];
  node.count = node.count || 0;
  return node;
};
const reindex = () => {
  for (const k of Object.keys(groupBySlug)) delete groupBySlug[k];
  for (const g of DMD_GROUPS) groupBySlug[g.slug] = g;
  BRAND_GROUPS.splice(0, BRAND_GROUPS.length, ...DMD_GROUPS.filter((g) => g.brand));
};

/**
 * Rebuilds the tree from the API's categories (flat, with parent_id/brand_id/path/position) and brands.
 * Top-level categories are the "Shop by category" groups, brands the "Shop by brand" groups (their product lines as
 * children); the category with slug "new-offers" is the offers row.
 */
export function applyTaxonomy({ categories = [], brands = [] }) {
  const kids = new Map();
  for (const c of categories) {
    const key = c.parent_id ? `c${c.parent_id}` : c.brand_id ? `b${c.brand_id}` : 'top';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(c);
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const nodeOf = (c) => ({
    name: c.name, slug: c.slug, ids: [c.id], id: c.id, blurb: c.description || '', img: c.image_url || null,
    art: c.icon ? { t: c.icon, a: c.accent_color || '#1f6feb' } : undefined,
    children: (kids.get(`c${c.id}`) || []).map(nodeOf),
  });
  const top = (kids.get('top') || []).filter((c) => c.slug !== 'new-offers').map(nodeOf);
  const brandGroups = [...brands].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map((b) => ({
    name: b.name, slug: b.slug, ids: [], brand: true, brandId: b.id, blurb: b.description || '', img: b.logo_url || null,
    children: (kids.get(`b${b.id}`) || []).map(nodeOf),
  }));
  DMD_GROUPS.splice(0, DMD_GROUPS.length, ...top, ...brandGroups);
  DMD_GROUPS.forEach((g) => prep(g));
  const offers = (kids.get('top') || []).find((c) => c.slug === 'new-offers');
  Object.assign(NEW_OFFERS, { ids: offers ? [offers.id] : [], id: offers?.id });
  prep(NEW_OFFERS);
  MENU_SECTIONS.splice(0, MENU_SECTIONS.length,
    { label: 'Shop by category', slugs: top.map((g) => g.slug) },
    { label: 'Shop by brand', slugs: brandGroups.map((g) => g.slug) });
  reindex();
}

/** Is this product listed under this menu node? (A brand's group lists everything of that brand.) */
export const inNode = (p, node) => (node.brandId != null && p.brandId === node.brandId) || p.cats.some((c) => node.allIds.includes(c));

/** Counts follow the products the storefront can actually list, so "N products" always matches the page. */
export function recountMenu(products) {
  const walk = (node) => {
    const ids = new Set(node.allIds);
    node.count = products.reduce((a, p) => a + ((node.brandId != null && p.brandId === node.brandId) || p.cats.some((c) => ids.has(c)) ? 1 : 0), 0);
    node.children.forEach(walk);
  };
  DMD_GROUPS.forEach(walk);
  walk(NEW_OFFERS);
}

export const catUrl = (...path) => `/product-category/${path.join('/')}`;

/** Resolve /product-category/a/b/c to [nodes], or null. */
export function resolvePath(path) {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'new-offers') return [NEW_OFFERS];
  const out = []; let level = DMD_GROUPS;
  for (const p of parts) { const f = level.find((x) => x.slug === p); if (!f) return null; out.push(f); level = f.children || []; }
  return out;
}
export const CONTACT = { phone: '+961 70 903 900', tel: '+96170903900', email: 'INFO@DMDWORLD.STORE' };
