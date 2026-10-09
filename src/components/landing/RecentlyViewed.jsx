import { useMemo, useState } from 'react';
import { getProduct } from '../../data/index.js';
import { useCatalog } from '../../data/live.js';
import { recentIds, forgetViews } from '../../lib/recent.js';
import ProductGrid from '../product/ProductGrid.jsx';

/* For returning visitors: what they looked at last time, as a white band after the price drops.
   Hidden until there's something to show. */
export default function RecentlyViewed() {
  const version = useCatalog();
  const [cleared, setCleared] = useState(false);
  const items = useMemo(() => (cleared ? [] : recentIds().map(getProduct).filter(Boolean).slice(0, 4)), [version, cleared]); // eslint-disable-line react-hooks/exhaustive-deps
  if (items.length < 2) return null;
  return (
    <section style={{ paddingBlock: 'var(--section-y)', background: 'var(--surface)', borderTop: '1px solid var(--line-soft)' }} aria-labelledby="rv-title">
      <div className="container">
        <div className="section-head">
          <div><p className="eyebrow" style={{ color: 'var(--muted)' }}>Continue where you left off</p><h2 id="rv-title">Recently viewed</h2></div>
          <button type="button" className="link" onClick={() => { forgetViews(); setCleared(true); }}>Clear history</button>
        </div>
        <ProductGrid products={items} cols={4} />
      </div>
    </section>
  );
}
