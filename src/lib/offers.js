/* Weekly Offers: which discounted products the home page shows. Prices and discounts always come from the server
   (Pricing: the lowest of the regular price, the product's own sale and any running offer); this only chooses and
   orders them, and drops one whose sale has just ended before the next catalog arrives. */

/** On sale right now: cheaper than its regular price, in stock, and its sale not past its end. */
export const isDiscounted = (p, now = Date.now()) => !!p && p.stock !== 'out' && p.was != null && p.was > p.price && (!p.saleEndsAt || Date.parse(p.saleEndsAt) > now);

const deepest = (a, b) => b.discount - a.discount || (b.was - b.price) - (a.was - a.price);

/**
 * The products to show, in order: the ones the owner hand-picked for the section (Admin › Homepage), while they're
 * discounted; otherwise those in a running offer (Admin › Offers), deepest first; otherwise any product on its own sale.
 */
export function weeklyOffers(products, picks = [], { now = Date.now(), limit = 8, byId = () => null } = {}) {
  const picked = picks.map((id) => byId(String(id))).filter((p) => isDiscounted(p, now));
  if (picked.length) return picked.slice(0, limit);
  const inOffer = products.filter((p) => p.offer && isDiscounted(p, now)).sort(deepest);
  if (inOffer.length) return inOffer.slice(0, limit);
  return products.filter((p) => isDiscounted(p, now)).sort(deepest).slice(0, limit);
}

/** When the first of these offers ends (ISO date), or null when none has an end date. */
export function firstEnd(list) {
  const ends = list.map((p) => p.saleEndsAt).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return ends[0] || null;
}
