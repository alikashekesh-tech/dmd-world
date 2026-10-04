import { Link } from '../../router/index.jsx';
import { ProductImage } from '../art/Media.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { BagIcon } from '../common/icons.jsx';
import { usd } from './data.js';
import s from './MiniCard.module.css';

/* A quieter product card for the landing page: photo, name, price, one action. `tone` switches dark/light. */
export default function MiniCard({ product: p, tone = 'light', price, badge, compact, style }) {
  const { addToCart } = useStore();
  return (
    <article className={`${s.card} ${tone === 'dark' ? s.dark : ''} ${compact ? s.compact : ''}`} style={style}>
      <Link to={`/product/${p.slug}`} className={s.media} tabIndex={-1} aria-hidden="true">
        <ProductImage product={p} className={s.img} />
        {badge && <span className={s.badge}>{badge}</span>}
      </Link>
      <div className={s.body}>
        <h3 className={s.name}><Link to={`/product/${p.slug}`}>{p.name}</Link></h3>
        <div className={s.foot}>
          <p className={s.price}>{price ?? <b>{usd(p.price)}</b>}</p>
          <button type="button" className={s.add} onClick={() => addToCart(p.id, 1, p.colors[0])} aria-label={`Add ${p.name} to cart`}>
            <BagIcon size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
