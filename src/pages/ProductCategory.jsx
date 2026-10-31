import { useMemo } from 'react';
import { useParams } from '../router/index.jsx';
import ProductBrowser from '../components/shop/ProductBrowser.jsx';
import { HeroChips } from '../components/ui/PageHero.jsx';
import CategoryArt, { artFor } from '../components/art/CategoryArt.jsx';
import { PRODUCTS } from '../data/index.js';
import { useCatalog } from '../data/live.js';
import { usePageMeta } from '../lib/meta.js';
import { resolvePath, catUrl, inNode } from '../data/dmdMenu.js';
import { resolveDepartment, departmentOf, nodeOptions, subOptions, isRetired } from '../data/departments.js';
import { isDiscounted } from '../lib/offers.js';
import NotFound from './NotFound.jsx';

/* Each platform keeps the colour it has in the home page's "What do you play on?" picker. */
const ACCENT = { playstation: '#4f8dff', 'nintendo-switch': '#ff4b55', xbox: '#3ccf6e', 'pc-parts': '#a78bfa', laptops: '#a78bfa', 'new-offers': '#ff6b57' };
const KEYS = () => ['brand'];

/* /product-category/<group>/<sub>/<sub> — mirrors dmdworld.store URLs; /product-category/<department>[/<sub>] lists a
   main category (Gaming Accessories › Headphones & Headsets) across the categories it brings together. */
export default function ProductCategory() {
  const params = useParams();
  const path = params['*'] || '';
  const version = useCatalog();
  const nodes = resolvePath(path);
  const dept = nodes ? null : resolveDepartment(path);
  const node = nodes && nodes[nodes.length - 1];
  const [d, sub] = dept || [];
  const here = sub || d;
  // A brand's page lists everything of that brand; a category's page lists it and everything below it.
  // New Offers lists its own category and everything on offer now (Weekly Offers' "See all").
  const base = useMemo(() => (node ? PRODUCTS.filter((p) => inNode(p, node) || (node.slug === 'new-offers' && isDiscounted(p))) : here ? PRODUCTS.filter((p) => here.ids.has(p.id)) : []), [node, here, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(() => (node ? nodeOptions(node, base) : d && !sub ? subOptions(d) : []), [node, d, sub, base]);
  const count = (n) => (n > 0 ? `${n.toLocaleString()} products` : null);

  const meta = node
    ? { title: node.slug === 'new-offers' ? 'New offers and price drops' : node.name, description: node.slug === 'new-offers' ? 'The latest discounts across DMD World: consoles, games, accessories and gear with real reductions.' : `${node.name} at DMD World${node.count ? `: ${node.count} products` : ''}. ${nodes.length === 1 && node.blurb ? `${node.blurb}. ` : ''}Order online and pay on delivery in Lebanon.` }
    : here ? { title: here.name, description: `${here.name} at DMD World${here.count ? `: ${here.count} products` : ''}. ${sub ? '' : `${d.blurb}. `}Order online and pay on delivery in Lebanon.` }
      : { title: 'Category not found', noindex: true };
  usePageMeta(meta);

  if (here) {
    const crumbs = [{ label: 'Home', to: '/' }, { label: 'Categories', to: '/categories' }, sub ? { label: d.name, to: d.to } : { label: d.name }, ...(sub ? [{ label: sub.name }] : [])];
    const chips = d.children.map((s) => ({ label: s.name, to: s.to, count: s.count, active: s === sub }));
    return (
      <ProductBrowser
        base={base} keysFor={KEYS} categories={categories} crumbs={crumbs}
        eyebrow={['Category', count(here.count)].filter(Boolean).join(' · ')} title={here.name} blurb={sub ? null : d.blurb}
        art={<CategoryArt key={here.slug} spec={sub ? artFor([d, sub]) : d.art} />}
        headerExtra={<HeroChips items={chips} />}
      />
    );
  }
  if (!nodes || !nodes.length) return <NotFound />;

  const slugs = nodes.map((n) => n.slug);
  const isOffers = node.slug === 'new-offers';
  const root = nodes[0];
  const home = !isOffers && departmentOf(root); // PlayStation sits under Gaming Consoles
  const crumbs = [{ label: 'Home', to: '/' }, ...(isOffers ? [] : [{ label: 'Categories', to: '/categories' }]), ...(home ? [{ label: home.name, to: home.to }] : []), ...nodes.map((n, i) => (i < nodes.length - 1 ? { label: n.name, to: catUrl(...slugs.slice(0, i + 1)) } : { label: n.name }))];

  // A parent lists its children; a leaf lists its siblings so you can hop sideways without going back up.
  const parentSlugs = node.children.length ? slugs : slugs.slice(0, -1);
  const parent = node.children.length ? node : nodes[nodes.length - 2];
  const chips = parent ? parent.children.filter((k) => k === node || !isRetired(k)).map((k) => ({ label: k.name, to: catUrl(...parentSlugs, k.slug), count: k.count, active: k.slug === node.slug })) : [];

  const eyebrow = isOffers ? 'Price drops' : [root.brand ? 'Brand' : 'Category', count(node.count)].filter(Boolean).join(' · ');
  return (
    <ProductBrowser
      base={base}
      keysFor={KEYS}
      categories={categories}
      crumbs={crumbs}
      eyebrow={eyebrow}
      title={node.name}
      blurb={isOffers ? 'Real reductions across the store. The crossed-out number is what it cost before.' : nodes.length === 1 ? root.blurb : null}
      art={<CategoryArt key={node.slug} spec={artFor(nodes)} />}
      accent={ACCENT[root.slug]}
      headerExtra={<HeroChips items={chips} />}
    />
  );
}
