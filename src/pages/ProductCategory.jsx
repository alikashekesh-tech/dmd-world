import { useMemo } from 'react';
import { useParams } from '../router/index.jsx';
import ProductBrowser from '../components/shop/ProductBrowser.jsx';
import { HeroChips } from '../components/ui/PageHero.jsx';
import CategoryArt, { artFor } from '../components/art/CategoryArt.jsx';
import { PRODUCTS } from '../data/index.js';
import { useCatalog } from '../data/live.js';
import { usePageMeta } from '../lib/meta.js';
import { resolvePath, catUrl } from '../data/dmdMenu.js';
import NotFound from './NotFound.jsx';

/* Each platform keeps the colour it has in the home page's "What do you play on?" picker. */
const ACCENT = { playstation: '#4f8dff', 'nintendo-switch': '#ff4b55', xbox: '#3ccf6e', 'pc-parts': '#a78bfa', 'new-offers': '#ff6b57' };

/* /product-category/<group>/<sub>/<sub> — mirrors dmdworld.store URLs. */
export default function ProductCategory() {
  const params = useParams();
  const nodes = resolvePath(params['*'] || '');
  const node = nodes && nodes[nodes.length - 1];
  const ids = node ? node.allIds : [];
  const version = useCatalog();
  const base = useMemo(() => PRODUCTS.filter((p) => p.cats.some((c) => ids.includes(c))), [node, version]); // eslint-disable-line react-hooks/exhaustive-deps
  usePageMeta(node ? { title: node.slug === 'new-offers' ? 'New offers and price drops' : node.name, description: node.slug === 'new-offers' ? 'The latest discounts across DMD World: consoles, games, accessories and gear with real reductions.' : `${node.name} at DMD World${node.count ? `: ${node.count} products` : ''}. ${nodes.length === 1 && node.blurb ? `${node.blurb}. ` : ''}Order online and pay on delivery in Lebanon.` } : { title: 'Category not found', noindex: true });
  if (!nodes || !nodes.length) return <NotFound />;
  const slugs = nodes.map((n) => n.slug);
  const isOffers = node.slug === 'new-offers';
  const root = nodes[0];
  const crumbs = [{ label: 'Home', to: '/' }, ...(isOffers ? [] : [{ label: 'Categories', to: '/categories' }]), ...nodes.map((n, i) => (i < nodes.length - 1 ? { label: n.name, to: catUrl(...slugs.slice(0, i + 1)) } : { label: n.name }))];

  // A parent lists its children; a leaf lists its siblings so you can hop sideways without going back up.
  const parentSlugs = node.children.length ? slugs : slugs.slice(0, -1);
  const parent = node.children.length ? node : nodes[nodes.length - 2];
  const chips = parent ? parent.children.map((k) => ({ label: k.name, to: catUrl(...parentSlugs, k.slug), count: k.count, active: k.slug === node.slug })) : [];

  const count = node.count > 0 ? `${node.count.toLocaleString()} products` : null;
  const eyebrow = isOffers ? 'Price drops' : [root.brand ? 'Brand' : 'Category', count].filter(Boolean).join(' · ');
  return (
    <ProductBrowser
      base={base}
      keysFor={() => ['type', 'brand']}
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
