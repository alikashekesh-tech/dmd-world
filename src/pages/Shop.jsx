import { useMemo } from 'react';
import ProductBrowser from '../components/shop/ProductBrowser.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { PRODUCTS, FILTERS_BY_TYPE, categoryBySlug } from '../data/index.js';
import { departmentOptions } from '../data/departments.js';
import { useCatalog } from '../data/live.js';
import { useSearchParams } from '../router/index.jsx';
import { usePageMeta } from '../lib/meta.js';

export const keysForType = (type, drop = []) => {
  const base = FILTERS_BY_TYPE[type] || FILTERS_BY_TYPE.default;
  return base.filter((k) => !drop.includes(k));
};

const KEYS = () => keysForType('default');

export default function Shop() {
  const [params] = useSearchParams();
  const q = params.get('q');
  const version = useCatalog();
  usePageMeta(q ? { title: `Search: ${q}`, noindex: true } : { title: 'Shop all gaming gear', description: 'Every product at DMD World: consoles, games, controllers, headsets, keyboards, mice, chairs, monitors and gadgets. Filter by category, brand and price.' });
  const categories = useMemo(() => departmentOptions(), [version]); // eslint-disable-line react-hooks/exhaustive-deps -- rebuilt with each catalog
  return (
    <ProductBrowser
      base={PRODUCTS} keysFor={KEYS} categories={categories}
      crumbs={[{ label: 'Home', to: '/' }, { label: q ? 'Search' : 'Shop' }]}
      eyebrow={q ? 'Search results' : 'Shop · everything in store'}
      title={q ? `“${q}”` : 'All gaming gear'}
      blurb={q ? 'Everything in the store that matches your search. Narrow it down with the filters.' : 'Filter by category, brand and price. Every filter lives in the link, so you can share what you found.'}
      art={<LineArt type={q ? 'controller' : 'shelf'} />}
    />
  );
}
export { categoryBySlug };
