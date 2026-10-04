import { Link } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LineArt from '../components/art/LineArt.jsx';
import ProductGrid from '../components/product/ProductGrid.jsx';
import { ArrowRight } from '../components/common/icons.jsx';
import { getProduct } from '../data/index.js';
import { useCatalog } from '../data/live.js';
import { usePageMeta } from '../lib/meta.js';

export default function Wishlist() {
  usePageMeta({ title: 'Wishlist', noindex: true });
  useCatalog();
  const { wishlist, buyer, addToCart, setToast } = useStore();
  const items = wishlist.map(getProduct).filter(Boolean);
  const available = items.filter((p) => p.stock !== 'out');
  const addAll = () => { available.forEach((p, i) => addToCart(p.id, 1, p.colors[0], { open: i === available.length - 1 })); setToast(`Added ${available.length} item${available.length === 1 ? '' : 's'} to your cart`); };
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]}
        eyebrow={`Saved for later · ${items.length}`}
        title="Wishlist"
        lead={items.length ? (buyer ? 'Everything you hearted, saved to your account on every device.' : 'Everything you hearted, kept in this browser. Sign in to keep it on every device.') : null}
        art={<LineArt type="heart" />}
        accent="#ff6b57"
      />
      <div className="container" style={{ paddingBlock: '32px 80px' }}>
        {items.length === 0 ? (
          <EmptyState art={<LineArt type="heart" />} status="Saved: 0" title="Nothing saved yet" text="Tap the heart on any product to keep it here for later.">
            <Link to="/shop" className="btn btn--primary btn--lg">Browse gear <ArrowRight size={17} /></Link>
          </EmptyState>
        ) : (
          <>
            {available.length > 1 && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}><button type="button" className="btn btn--primary" onClick={addAll}>Add {available.length} in-stock items to cart <ArrowRight size={16} /></button></div>}
            <ProductGrid products={items} cols={4} />
          </>
        )}
      </div>
    </>
  );
}
