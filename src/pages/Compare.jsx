import { Link } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import PageHero from '../components/ui/PageHero.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { ProductImage } from '../components/art/Media.jsx';
import { ArrowRight, CloseIcon } from '../components/common/icons.jsx';
import { getProduct, getBrand, money } from '../data/index.js';
import { usePageMeta } from '../lib/meta.js';
import s from './Compare.module.css';

export default function Compare() {
  usePageMeta({ title: 'Compare', noindex: true });
  const { compare, toggleCompare } = useStore();
  const items = compare.map(getProduct).filter(Boolean);
  const specKeys = [...new Set(items.flatMap((p) => Object.keys(p.specs)))];
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Compare' }]}
        eyebrow={`Head to head · ${items.length}/4`}
        title="Compare"
        lead="Put up to four products side by side and see where they differ."
        art={<LineArt type="vs" />}
      />
      <div className="container" style={{ paddingBlock: '32px 80px' }}>
        {items.length === 0 ? (
          <EmptyState art={<LineArt type="vs" />} status="Player 2 needed" title="Nothing to compare yet" text="Add up to four products to compare their price and specs side by side.">
            <Link to="/shop" className="btn btn--primary btn--lg">Browse products <ArrowRight size={17} /></Link>
          </EmptyState>
        ) : (
          <div className={s.wrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Product</span></th>
                  {items.map((p) => (
                    <th key={p.id} scope="col" className={s.prod}>
                      <button type="button" className={s.rm} onClick={() => toggleCompare(p.id)} aria-label={`Remove ${p.name}`}><CloseIcon size={15} /></button>
                      <Link to={`/product/${p.slug}`} className={s.thumb}><ProductImage product={p} /></Link>
                      <small>{getBrand(p.brand).name}</small>
                      <Link to={`/product/${p.slug}`} className={s.name}>{p.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Price</th>{items.map((p) => <td key={p.id} className={s.price}>{money(p.price)}{p.was ? <del>{money(p.was)}</del> : null}</td>)}</tr>
                <tr><th scope="row">Availability</th>{items.map((p) => <td key={p.id}>{p.stock === 'out' ? 'Out of stock' : 'In stock'}</td>)}</tr>
                {specKeys.map((k) => <tr key={k}><th scope="row">{k}</th>{items.map((p) => <td key={p.id}>{p.specs[k] || '—'}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
