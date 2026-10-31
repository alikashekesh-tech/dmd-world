/* Product photos that failed to load during this visit. A failed address is never requested again (no retry loops),
   and every gallery, thumbnail, card and cart line skips it, so the next photo that works takes its place. Kept in
   memory only: a reload tries again, in case the photo was fixed. */
const broken = new Set();
const listeners = new Set();
let version = 0;

export const isBroken = (url) => broken.has(url);

/** Records a photo that failed to load; once per address. */
export function markBroken(url) {
  if (!url || broken.has(url)) return;
  broken.add(url);
  version++;
  listeners.forEach((f) => f());
}

export const subscribeImages = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const imagesVersion = () => version;

/** For tests: forget every failure. */
export function resetImageHealth() {
  broken.clear();
  version++;
  listeners.forEach((f) => f());
}

/**
 * A product's photos worth showing, in order (the chosen variant's own photo first, see withVariantImage): blanks,
 * repeats and photos known to fail are left out. An empty list means none works: show a placeholder.
 */
export function photosOf(product, bad = isBroken) {
  if (!product?.img) return [];
  const all = product.gallery?.length ? product.gallery : [product.img];
  return [...new Set(all.filter((u) => typeof u === 'string' && u.trim() !== ''))].filter((u) => !bad(u));
}
