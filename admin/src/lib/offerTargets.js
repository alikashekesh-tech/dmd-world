/* What an offer covers, as the form holds it: products, brands and categories (any mix, each a list of items with what
   the chips show), and the entire-store switch. Plain functions so they can be tested without a browser. */

export const emptyTargets = () => ({ products: [], brands: [], categories: [], entire_store: false });

/** From the API's offer.targets (GET /offers/{id}). */
export function targetsFromApi(t) {
  if (!t) return emptyTargets();
  return { products: t.products || [], brands: t.brands || [], categories: t.categories || [], entire_store: !!t.entire_store };
}

/** The ids the API takes (POST/PUT /offers and POST /offers/preview). Deleted picks are sent too: they cover nothing. */
export function targetsBody(t) {
  return { product_ids: t.products.map((x) => x.id), brand_ids: t.brands.map((x) => x.id), category_ids: t.categories.map((x) => x.id), entire_store: t.entire_store };
}

export const hasTargets = (t) => t.entire_store || t.products.length > 0 || t.brands.length > 0 || t.categories.length > 0;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** "3 products · 2 brands · 1 category", or "Entire store". */
export function targetsSummary(t) {
  if (t.entire_store) return 'Entire store';
  const parts = [t.products.length && plural(t.products.length, 'product', 'products'), t.brands.length && plural(t.brands.length, 'brand', 'brands'), t.categories.length && plural(t.categories.length, 'category', 'categories')].filter(Boolean);
  return parts.join(' · ') || 'Nothing chosen yet';
}

/** Adds an item to one kind (no duplicates), or removes it when already there. */
export function toggleTarget(t, kind, item) {
  const has = t[kind].some((x) => x.id === item.id);
  return { ...t, [kind]: has ? t[kind].filter((x) => x.id !== item.id) : [...t[kind], item] };
}

/**
 * Picked categories that a picked parent already includes: id → the parent's name. `categories` is the full list
 * ({ id, parent, name|label }) from the admin's catalog lists.
 */
export function coveredByParent(picked, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chosen = new Set(picked.map((c) => c.id));
  const out = {};
  for (const c of picked) {
    let p = byId.get(byId.get(c.id)?.parent);
    while (p) {
      if (chosen.has(p.id)) { out[c.id] = p.label || p.name; break; }
      p = byId.get(p.parent);
    }
  }
  return out;
}

/** What a target item's status means for the owner (null: nothing to say). */
export function statusNote(item) {
  switch (item.status) {
    case 'missing': return 'Deleted: covers nothing. Remove it.';
    case 'trashed': return 'In the trash: not discounted';
    case 'deleted': return 'Archived: still applies to its products';
    case 'draft': return 'Draft: not in the shop';
    default: return null;
  }
}
