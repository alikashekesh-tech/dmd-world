import { Link } from '../../router/index.jsx';
import { ProductImage } from '../art/Media.jsx';
import { HeartIcon, BagIcon } from '../common/icons.jsx';
import { Rating, Price, Compat, Stock } from '../common/bits.jsx';
import { getBrand, isNew, money } from '../../data/index.js';
import { useStore } from '../../context/StoreContext.jsx';
import s from './ProductCard.module.css';

/* Rule of 100: under $100 a percentage reads bigger, above it the dollar amount does. */
export const dealBadge = (p) => (p.price < 100 ? `−${p.discount}%` : `Save ${money(p.was - p.price).replace(/\.00$/, '')}`);

export default function ProductCard({ product: p, priority }) {
  const { addToCart, toggleWish, isWished } = useStore();
  const wished = isWished(p.id);
  const href = `/product/${p.slug}`;
  const out = p.stock === 'out';
  return (
    <article className={`${s.card} ${out ? s.isOut : ''}`}>
      <div className={s.media}>
        <Link to={href} className={s.mediaLink} aria-label={p.name} tabIndex={-1}>
          <ProductImage product={p} color={p.colors[0]} eager={priority} className={s.img} />
        </Link>
        <div className={s.badges}>
          {p.discount > 0 && <span className={`${s.badge} ${s.deal}`}>{dealBadge(p)}</span>}
          {isNew(p) && p.tag === 'new' && <span className={`${s.badge} ${s.new}`}>New</span>}
        </div>
        <button type="button" className={`${s.wish} ${wished ? s.wished : ''}`} onClick={() => toggleWish(p.id)} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
          <HeartIcon size={17} fill={wished ? 'currentColor' : 'none'} />
        </button>
        {p.colors.length > 1 && (
          <div className={s.swatches} aria-hidden>
            {p.colors.slice(0, 4).map((c) => <i key={c} style={{ background: `var(--sw-${c})` }} />)}
          </div>
        )}
      </div>
      <div className={s.body}>
        <span className={s.brand}>{getBrand(p.brand).name}</span>
        <h3 className={s.name}><Link to={href}>{p.name}</Link></h3>
        {p.sub && <p className={s.sub}>{p.sub}</p>}
        {p.n > 0 && <Rating value={p.r} count={p.n} />}
        {p.compat.length > 0 && <Compat p={p} />}
        <div className={s.foot}>
          <div className={s.priceCol}>
            <Price price={p.price} was={p.was} size="sm" />
            <Stock p={p} />
          </div>
          <button type="button" className={s.add} disabled={out} onClick={() => addToCart(p.id, 1, p.colors[0])} aria-label={out ? `${p.name} is out of stock` : `Add ${p.name} to cart`} title={out ? 'Out of stock' : 'Add to cart'}>
            <BagIcon size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
