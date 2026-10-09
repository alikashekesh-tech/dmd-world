import { Link } from '../../router/index.jsx';
import { ProductImage } from '../art/Media.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { BagIcon } from '../common/icons.jsx';
import { usd } from './data.js';
import s from './MiniCard.module.css';

/* A quieter product card for the landing page: photo, name, price, one action. Product photos are white tiles, so the
   card is always a light surface and the photo sits on white with no visible edge. The optional `badge` (a discount)
   sits in the card body, not on the photo: it stays clear of the artwork baked into the tile and is read out with the
   name. A reduced price is shown in ink with the old price struck through; the badge is the card's one red mark. */
export default function MiniCard({ product: p, badge, compact, className = '', style }) {
  const { addToCart } = useStore();
  const sale = p.was > p.price;
  return (
    <article className={`${s.card} ${compact ? s.compact : ''} ${className}`} style={style}>
      <Link to={`/product/${p.slug}`} className={s.media} tabIndex={-1} aria-hidden="true">
        <ProductImage product={p} className={s.img} />
      </Link>
      <div className={s.body}>
        {badge && <span className={s.badge}>{badge}</span>}
        <h3 className={s.name}><Link to={`/product/${p.slug}`}>{p.name}</Link></h3>
        <div className={s.foot}>
          <p className={s.price}><b>{usd(p.price)}</b>{sale && <del><span className="sr-only">Was </span>{usd(p.was)}</del>}</p>
          <button type="button" className={s.add} onClick={() => addToCart(p.id, 1, p.colors[0])} aria-label={`Add ${p.name} to cart`}>
            <BagIcon size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
