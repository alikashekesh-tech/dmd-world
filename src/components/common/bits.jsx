import { StarIcon } from './icons.jsx';
import { money, compatLabels, getBrand } from '../../data/index.js';
import s from './bits.module.css';

export function Rating({ value, count, size = 13, showValue = true }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className={s.rating} aria-label={`Rated ${value} out of 5 from ${count} reviews`}>
      <span className={s.stars} style={{ '--pct': `${pct}%` }}>
        <span className={s.starsBg}>{[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} size={size} />)}</span>
        <span className={s.starsFg}>{[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} size={size} />)}</span>
      </span>
      {showValue && <span className={s.ratingVal}>{value.toFixed(1)}</span>}
      {count != null && <span className={s.ratingCount}>({count.toLocaleString()})</span>}
    </span>
  );
}

export function Price({ price, was, discount, size = 'md' }) {
  return (
    <span className={`${s.price} ${s[size]}`}>
      <strong>{money(price)}</strong>
      {was ? <del>{money(was)}</del> : null}
      {discount ? <span className={s.save}>-{discount}%</span> : null}
    </span>
  );
}

export function Stock({ p }) {
  if (p.stock === 'out') return <span className={`${s.stock} ${s.out}`}><i />Out of stock</span>;
  if (p.stock === 'low') return <span className={`${s.stock} ${s.low}`}><i />Only {p.stockCount} left</span>;
  return <span className={`${s.stock} ${s.in}`}><i />In stock</span>;
}

/** Compatibility indicators: PS5 · PS4 · PC … */
export function Compat({ p, max = 4, large = false }) {
  const { items, more } = compatLabels(p, max);
  return (
    <ul className={`${s.compat} ${large ? s.compatLg : ''}`} aria-label="Compatible with">
      {items.map((x) => <li key={x} className={x === 'Universal' ? s.uni : ''}>{x}</li>)}
      {more > 0 && <li className={s.more}>+{more}</li>}
    </ul>
  );
}

export function BrandName({ slug }) { return <>{getBrand(slug).name}</>; }
