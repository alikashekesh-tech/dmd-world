/* Recommended add-ons ("Complete your setup"): the products the owner picked for a product, offered beside it and in
   the cart. Nothing here adds anything to a cart; the buyer does, one tap at a time, at the add-on's own price. */

/**
 * The add-ons to offer for some products: the owner's picks in their order, without duplicates, ones that can't be
 * bought (unknown, sold out), the products themselves, or ones already in the cart. A product sold in options can't be
 * added in one tap: `needsOptions` says to open its page instead.
 *
 * @param {object[]} products  the product(s) on the page, or the cart's products
 * @param {{ byId: (id: string) => object|undefined, inCart?: string[], limit?: number }} opts
 * @returns {{ product: object, needsOptions: boolean }[]}
 */
export function addonsFor(products, { byId, inCart = [], limit = 4 }) {
  const skip = new Set([...inCart.map(String), ...products.map((p) => String(p.id))]);
  const out = [];
  for (const p of products) {
    for (const id of p.addons || []) {
      if (out.length >= limit) return out;
      if (skip.has(String(id))) continue;
      const a = byId(String(id));
      skip.add(String(id));
      if (!a || a.stock === 'out') continue;
      out.push({ product: a, needsOptions: Array.isArray(a.attributes) && a.attributes.length > 0 });
    }
  }
  return out;
}

/* Hidden panels stay hidden for this visit only (the buyer said "not now", not "never"). */
const HIDDEN = 'dmd:addons-hidden';
export const addonsHidden = (where) => { try { return (JSON.parse(sessionStorage.getItem(HIDDEN)) || []).includes(where); } catch { return false; } };
export function hideAddons(where) {
  try { const all = JSON.parse(sessionStorage.getItem(HIDDEN)) || []; sessionStorage.setItem(HIDDEN, JSON.stringify([...new Set([...all, where])])); } catch { /* storage unavailable */ }
}
