/* Product options (variants) and used-product conditions, as plain functions the product page, cart and cards share.
   A variable product has `attributes` ([{ name: 'Colour', values: ['Black', 'White'] }]) and `variants` (one per
   combination it's sold in: { id, options: { Colour: 'Black' }, price, was, stock, maxQty, image }). The server prices
   and stocks every variant; nothing here works a price out. */

/** Used-product grades, best first (the same grades and words as the admin and the API). */
export const CONDITIONS = {
  like_new: { label: 'Like New', description: 'Little to no sign of use, with no visible marks.' },
  excellent: { label: 'Excellent', description: 'Light signs of use that are hard to spot.' },
  good: { label: 'Good', description: 'Visible light wear, such as small scratches.' },
  fair: { label: 'Fair', description: 'Clear signs of use, such as scuffs or marks.' },
};
export const CONDITION_ORDER = Object.keys(CONDITIONS);
/** A product filed under one of the store's "Used" categories, without a grade of its own. */
export const USED = { label: 'Used', description: 'Pre-owned. Ask us about its condition before you buy.' };

/** The product's condition ({ key, label, description }), or null for a new product. */
export function conditionOf(p) {
  if (p?.condition && CONDITIONS[p.condition]) return { key: p.condition, ...CONDITIONS[p.condition] };
  return p?.used ? { key: 'used', ...USED } : null;
}

export const isVariable = (p) => !!p && Array.isArray(p.attributes) && p.attributes.length > 0 && Array.isArray(p.variants);

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const valueOf = (options, name) => { for (const [k, v] of Object.entries(options || {})) if (same(k, name)) return v; return undefined; };

/** The variant with exactly these options ({ Colour: 'Black', Size: '140 cm' }), or null while one is still missing. */
export function findVariant(p, selected) {
  if (!isVariable(p)) return null;
  if (p.attributes.some((a) => selected?.[a.name] == null)) return null;
  return p.variants.find((v) => p.attributes.every((a) => same(valueOf(v.options, a.name), selected[a.name]))) || null;
}

/** The options still to choose, by name, in the product's order. */
export const missingOptions = (p, selected) => (isVariable(p) ? p.attributes.filter((a) => selected?.[a.name] == null).map((a) => a.name) : []);

/**
 * The values of one option, each with whether it can still be bought given the other choices: `offered` (a variant
 * has it) and `inStock` (one of those is in stock). A value nobody sells is left out.
 */
export function choicesFor(p, selected, name) {
  const attr = p.attributes.find((a) => a.name === name);
  if (!attr) return [];
  const others = p.attributes.filter((a) => a.name !== name && selected?.[a.name] != null);
  const fits = p.variants.filter((v) => others.every((a) => same(valueOf(v.options, a.name), selected[a.name])));
  return attr.values.map((value) => {
    const with_ = fits.filter((v) => same(valueOf(v.options, name), value));
    return { value, offered: with_.length > 0, inStock: with_.some((v) => v.stock !== 'out') };
  }).filter((c) => p.variants.some((v) => same(valueOf(v.options, name), c.value)));
}

/**
 * Choosing a value: the other choices stay while some variant still has them all; one that no longer fits (a size the
 * new colour isn't sold in) is cleared, so the buyer picks it again instead of landing on a combination nobody sells.
 */
export function chooseOption(p, selected, name, value) {
  const next = { ...selected, [name]: value };
  const fits = (sel) => p.variants.some((v) => Object.entries(sel).every(([k, val]) => same(valueOf(v.options, k), val)));
  if (fits(next)) return next;
  const kept = { [name]: value };
  for (const a of p.attributes) if (a.name !== name && selected?.[a.name] != null && fits({ ...kept, [a.name]: selected[a.name] })) kept[a.name] = selected[a.name];
  return kept;
}

/** The first choice to show: the only value of an option, and nothing else (the buyer picks the rest). */
export function initialSelection(p, variantId = null) {
  if (!isVariable(p)) return {};
  // A link to one variant (a back-in-stock email): that variant's options, when it's still sold.
  const linked = variantId != null ? p.variants.find((v) => String(v.id) === String(variantId)) : null;
  if (linked) return Object.fromEntries(p.attributes.map((a) => [a.name, valueOf(linked.options, a.name)]).filter(([, value]) => value != null));
  const sel = {};
  for (const a of p.attributes) {
    const values = a.values.filter((value) => p.variants.some((v) => same(valueOf(v.options, a.name), value)));
    if (values.length === 1) sel[a.name] = values[0];
  }
  return sel;
}

/** [['Colour', 'Black'], ['Size', '140 cm']] in the product's option order. */
export const optionList = (p, v) => (v && isVariable(p) ? p.attributes.map((a) => [a.name, valueOf(v.options, a.name)]).filter(([, value]) => value != null) : []);
/** "Black / 140 cm". */
export const variantLabel = (p, v) => optionList(p, v).map(([, value]) => value).join(' / ');

/** The product as shown for one of its variants: that variant's own photo first, when it has one. */
export const withVariantImage = (p, v) => (v?.image ? { ...p, img: v.image, gallery: [v.image, ...(p.gallery || []).filter((g) => g !== v.image)] } : p);

/** What a cart line says about its item: the chosen options, then the condition of a used one ("Black · Used · Good"). */
export function lineDetails(line) {
  const parts = (line.options || []).map(([, value]) => value);
  const c = conditionOf(line.product);
  if (c) parts.push(c.key === 'used' ? 'Used' : `Used · ${c.label}`);
  return parts.join(' · ');
}

/** The same thing in the cart and in the server's answer: a product, and which of its variants. */
export const lineRef = (productId, variantId) => `${productId}:${variantId || ''}`;
