import { Link } from '../../router/index.jsx';
import { ProductImage } from '../art/Media.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { BagIcon } from '../common/icons.jsx';
import { whatsAppUrl, productMessage, WhatsAppIcon } from '../layout/WhatsAppButton.jsx';
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
          <div className={s.acts}>
            <a className={s.wa} href={whatsAppUrl(productMessage(p))} target="_blank" rel="noopener noreferrer" aria-label={`Ask about ${p.name} on WhatsApp`} title="Ask on WhatsApp"><WhatsAppIcon size={17} /></a>
            {p.attributes?.length > 0 // sold in options: they're chosen on its page
              ? <Link to={`/product/${p.slug}`} className={s.add} aria-label={`Choose options for ${p.name}`}><BagIcon size={17} /></Link>
              : <button type="button" className={s.add} onClick={() => addToCart(p.id, 1, p.colors[0])} aria-label={`Add ${p.name} to cart`}>
                <BagIcon size={17} />
              </button>}
          </div>
        </div>
      </div>
    </article>
  );
}
