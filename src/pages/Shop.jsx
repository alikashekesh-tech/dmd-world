import { useMemo } from 'react';
import ProductBrowser from '../components/shop/ProductBrowser.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { PRODUCTS, FILTERS_BY_TYPE, categoryBySlug } from '../data/index.js';
import { useSearchParams } from '../router/index.jsx';
import { usePageMeta } from '../lib/meta.js';

export const keysForType = (type, drop = []) => {
  const base = FILTERS_BY_TYPE[type] || FILTERS_BY_TYPE.default;
  return base.filter((k) => !drop.includes(k));
};

export default function Shop() {
  const [params] = useSearchParams();
  const q = params.get('q');
  usePageMeta(q ? { title: `Search: ${q}`, noindex: true } : { title: 'Shop all gaming gear', description: 'Every product at DMD World: consoles, games, controllers, headsets, keyboards, mice, chairs, monitors and gadgets. Filter by type, brand and price.' });
  const keysFor = useMemo(() => (st) => {
    if (st.type && st.type.length === 1) return ['type', ...keysForType(st.type[0])];
    return ['type', 'brand', 'platform', 'conn', 'color'];
  }, []);
  return (
    <ProductBrowser
      base={PRODUCTS} keysFor={keysFor}
      crumbs={[{ label: 'Home', to: '/' }, { label: q ? 'Search' : 'Shop' }]}
      eyebrow={q ? 'Search results' : 'Shop · everything in store'}
      title={q ? `“${q}”` : 'All gaming gear'}
      blurb={q ? 'Everything in the store that matches your search. Narrow it down with the filters.' : 'Filter by product type, brand, platform and price. Every filter lives in the link, so you can share what you found.'}
      art={<LineArt type={q ? 'controller' : 'shelf'} />}
    />
  );
}
export { categoryBySlug };
