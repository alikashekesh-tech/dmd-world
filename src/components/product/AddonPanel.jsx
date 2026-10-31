import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { ProductImage } from '../art/Media.jsx';
import { PlusIcon, CloseIcon, CheckIcon } from '../common/icons.jsx';
import { getProduct, money } from '../../data/index.js';
import { addonsFor, addonsHidden, hideAddons } from '../../lib/addons.js';
import s from './AddonPanel.module.css';

/* "Complete your setup": the add-ons the owner recommends for these products. A quiet panel the buyer can hide for
   this visit; each add-on goes in the cart only when they tap Add (one, at its own price), never by itself. */
export default function AddonPanel({ products, where, title = 'Complete your setup', compact = false }) {
  const { lines, addToCart, setToast } = useStore();
  const [hidden, setHidden] = useState(() => addonsHidden(where));
  const [added, setAdded] = useState([]);
  if (hidden) return null;
  const inCart = lines.map((l) => String(l.id)).filter((id) => !added.includes(id)); // just added here: keep it shown, ticked
  const items = addonsFor(products, { byId: getProduct, inCart });
  if (!items.length) return null;

  const add = (a) => {
    if (addToCart(a.id, 1, a.colors?.[0], { open: false })) {
      setAdded((x) => [...x, String(a.id)]);
      setToast(`Added ${a.name} to your cart`);
    }
  };
  const hide = () => { hideAddons(where); setHidden(true); };
  const id = `addons-${where.replace(/\W+/g, '-')}`;

  return (
    <aside className={`${s.panel} ${compact ? s.compact : ''}`} aria-labelledby={id}>
      <div className={s.head}>
        <h2 id={id}>{title}</h2>
        <button type="button" className={s.hide} onClick={hide}><CloseIcon size={14} />Not now</button>
      </div>
      <ul className={s.list}>
        {items.map(({ product: a, needsOptions }) => {
          const done = added.includes(String(a.id));
          return (
            <li key={a.id}>
              <Link to={`/product/${a.slug}`} className={s.thumb} tabIndex={-1} aria-hidden="true"><ProductImage product={a} color={a.colors?.[0]} /></Link>
              <span className={s.info}><Link to={`/product/${a.slug}`}>{a.name}</Link><b>{needsOptions ? `From ${money(a.price)}` : money(a.price)}</b></span>
              {needsOptions
                ? <Link to={`/product/${a.slug}`} className={`btn btn--secondary btn--sm ${s.btn}`}>Choose options</Link>
                : done
                  ? <span className={s.added} role="status"><CheckIcon size={15} />Added</span>
                  : <button type="button" className={`btn btn--secondary btn--sm ${s.btn}`} onClick={() => add(a)} aria-label={`Add ${a.name} to cart, ${money(a.price)}`}><PlusIcon size={15} />Add</button>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
