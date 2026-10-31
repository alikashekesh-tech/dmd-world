/* The storefront's main categories ("departments"): what a customer sees first in the menus, the category filter and
   /categories, each opening onto its sub-categories.

   They are a view over the owner's own category tree (Admin › Categories), never new records:
   - a sub-category is either one existing category (PlayStation, Laptops…: it keeps its own page and URL), or every
     existing category with a given name, across brands (Headphones = Marvo › Headphones, HyperX › Headphones…: the
     brand product lines), listed at /product-category/<department>/<sub>;
   - a product is in a sub-category exactly when the owner filed it in one of those categories;
   - a sub-category with nothing in it is left out, so a new one ("Gaming Tables") appears as soon as the owner
     creates a category by that name and files products in it; Electrical Appliances is offered even while empty;
   - top-level categories (and those under "Other") that no department names land in "More Categories".
   Rebuilt with every catalog (buildDepartments); the exported arrays are refilled in place. */
import { DMD_GROUPS, groupBySlug, resolvePath, inNode, catUrl } from './dmdMenu.js';

/** Kept out of the customer's menus, filters and category lists. Their records, products and pages are untouched
    (their products stay in Shop and search; old links keep working). Paths as in /product-category/<path>. */
export const RETIRED = ['pc-parts', 'other/phone-accessories', 'other/network-products', 'other/smart-watches'];

const SPEC = [
  { slug: 'gaming-accessories', name: 'Gaming Accessories', art: ['line', 'headset'], blurb: 'Headsets, keyboards, mice and mousepads from every brand we stock', subs: [
    { slug: 'headphones', name: 'Headphones & Headsets', match: /^head(phone|set)s?$/i },
    { slug: 'keyboards', name: 'Keyboards', match: /^keyboards?$/i },
    { slug: 'mouse', name: 'Mouse', match: /^(mouse|mice)$/i },
    { slug: 'mousepads', name: 'Mousepads', match: /^mouse ?pads?$/i },
  ] },
  { slug: 'gaming-furniture', name: 'Gaming Furniture', art: ['line', 'chair'], blurb: 'Gaming chairs and desks for the whole setup', subs: [
    { slug: 'gaming-chairs', name: 'Gaming Chairs', match: /^(gaming )?chairs?$/i },
    { slug: 'gaming-tables', name: 'Gaming Tables & Desks', match: /^(gaming )?(tables?|desks?)( and desks?)?$/i },
    // Categories that hold chairs and desks together, until the owner files them apart.
    { slug: 'chairs-and-tables', name: 'Chairs & Tables', match: /^(chairs? and tables?|tables? and chairs?)$/i },
  ] },
  { slug: 'displays', name: 'Displays', art: ['line', 'monitor'], blurb: 'Gaming monitors', subs: [
    { slug: 'monitors', name: 'Monitors', match: /^monitors?$/i },
  ] },
  { slug: 'gaming-consoles', name: 'Gaming Consoles', art: ['platform', 'playstation'], blurb: 'PlayStation, Nintendo and Xbox: consoles, games and accessories', subs: [
    { path: 'playstation' }, { path: 'nintendo-switch', name: 'Nintendo' }, { path: 'xbox' },
  ] },
  { slug: 'computers', name: 'Computers', art: ['world', 'laptop'], blurb: 'Laptops and what goes with them', subs: [
    { path: 'laptops' },
  ] },
  { slug: 'more', name: 'More Categories', art: ['world', 'figure'], blurb: 'Tablets, gadgets and the rest of the store', rest: true, subs: [
    { path: 'tablets' },
    { path: 'electrical-appliances', always: true }, // offered from the start, before it has products
    { path: 'other/gadgets' },
  ] },
];

/** The departments shown to customers (with sub-categories that have products), in order. */
export const DEPARTMENTS = [];
const ALL = []; // every department and sub-category, empty or not, for resolving URLs
const EMPTY_SET = new Set();

const key = (node) => node.path.join('/');
const retired = new Set(RETIRED);
const isRetired = (node) => node.path.some((_, i) => retired.has(node.path.slice(0, i + 1).join('/')));

function walk(nodes, fn) { for (const n of nodes) { fn(n); walk(n.children || [], fn); } }

/** Rebuilds the departments from the category tree (applyTaxonomy) and the products (counts and membership). */
export function buildDepartments(products) {
  const everyNode = []; walk(DMD_GROUPS, (n) => { if (!n.brand) everyNode.push(n); });
  const named = SPEC.flatMap((d) => d.subs.filter((s) => s.path)).map((s) => s.path);
  const members = (nodes) => {
    if (!nodes.length) return EMPTY_SET;
    const ids = new Set();
    for (const p of products) if (nodes.some((n) => inNode(p, n))) ids.add(p.id);
    return ids;
  };
  const single = (node, name, always = false) => ({ slug: node.slug, name: name || node.name, to: catUrl(...node.path), node, nodes: [node], always });

  ALL.length = 0;
  for (const d of SPEC) {
    const subs = [];
    for (const s of d.subs) {
      if (s.path) { const node = resolvePath(s.path)?.at(-1); if (node && !isRetired(node)) subs.push(single(node, s.name, s.always)); continue; }
      subs.push({ slug: s.slug, name: s.name, to: catUrl(d.slug, s.slug), nodes: everyNode.filter((n) => s.match.test(n.name.trim())) });
    }
    if (d.rest) {
      // Every other top-level category, and what's filed under "Other", that nothing above names.
      const tops = DMD_GROUPS.filter((g) => !g.brand && g.slug !== 'other');
      subs.push(...[...tops, ...(groupBySlug.other?.children || [])].filter((n) => !isRetired(n) && !named.includes(key(n))).map((n) => single(n)));
    }
    for (const s of subs) { s.ids = members(s.nodes); s.count = s.ids.size; }
    const ids = new Set(subs.flatMap((s) => [...s.ids]));
    ALL.push({ slug: d.slug, name: d.name, art: d.art, blurb: d.blurb, to: catUrl(d.slug), subs, children: subs.filter((s) => s.count > 0 || s.always), ids, count: ids.size });
  }
  DEPARTMENTS.splice(0, DEPARTMENTS.length, ...ALL.filter((d) => d.children.length > 0));
}

/** /product-category/<department>[/<sub>] → [department] or [department, sub], or null (the categories' own paths win). */
export function resolveDepartment(path) {
  const [a, b, ...more] = (path || '').split('/').filter(Boolean);
  const d = ALL.find((x) => x.slug === a);
  if (!d || more.length) return null;
  if (!b) return [d];
  const s = d.subs.find((x) => x.slug === b && !x.node && x.nodes.length);
  return s ? [d, s] : null;
}

/** The department a category is listed under as a sub-category of its own (PlayStation → Gaming Consoles). */
export const departmentOf = (node) => ALL.find((d) => d.subs.some((s) => s.node === node)) || null;

/** Where a product is listed in the menus: the first sub-category it is in (for a product whose own group is retired). */
export function homeOf(p) {
  for (const d of DEPARTMENTS) for (const s of d.children) if (s.ids.has(p.id)) return s;
  return null;
}

export { isRetired };

/* ── the category filter ──────────────────────────────────────────────────────────────────────────────────────────
   Options: [{ key, label, ids, children }]. A key goes in the URL (?cat=…); `ids` are the products it lists. */

/** Every department and its sub-categories (the Shop page). */
export const departmentOptions = () => DEPARTMENTS.map((d) => ({
  key: d.slug, label: d.name, ids: d.ids,
  children: d.children.map((s) => ({ key: `${d.slug}/${s.slug}`, label: s.name, ids: s.ids, children: [] })),
}));

/** A department's sub-categories (its own page). */
export const subOptions = (d) => (d.children || []).map((s) => ({ key: `${d.slug}/${s.slug}`, label: s.name, ids: s.ids, children: [] }));

/** The categories below one of the owner's categories, every level (its page): PS5 › Games › New. */
export function nodeOptions(node, products) {
  const build = (n) => {
    const kids = (n.children || []).filter((c) => !isRetired(c));
    // Two siblings with the same name stay apart (and say which is which) rather than merging.
    const seen = new Map(); for (const c of kids) seen.set(c.name, (seen.get(c.name) || 0) + 1);
    return kids.map((c) => ({
      key: key(c), label: seen.get(c.name) > 1 ? `${c.name} (${c.slug})` : c.name,
      ids: new Set(products.filter((p) => inNode(p, c)).map((p) => p.id)), children: build(c),
    }));
  };
  return build(node);
}
