import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { DMD_GROUPS, MENU_SECTIONS, groupBySlug, catUrl } from '../../data/dmdMenu.js';
import { CloseIcon, ChevronDown, UserIcon, HeartIcon, ArrowRight } from '../common/icons.jsx';
import Logo from './Logo.jsx';
import SearchBox from './SearchBox.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { useDialog } from '../../lib/useDialog.js';
import s from './MobileNav.module.css';

function Acc({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={s.acc}>
      <button type="button" className={s.accHead} aria-expanded={open} onClick={() => setOpen(!open)}>{title}<ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /></button>
      {open && <div className={s.accBody}>{children}</div>}
    </div>
  );
}

export default function MobileNav({ open, onClose }) {
  const { wishlist, user } = useStore();
  const panel = useDialog(open, onClose);
  return (
    <div className={`${s.root} ${open ? s.open : ''}`} aria-hidden={!open}>
      <div className={s.scrim} onClick={onClose} />
      <aside ref={panel} className={s.drawer} role="dialog" aria-modal="true" aria-label="Menu">
        <div className={s.top}><Logo size={22} light /><button type="button" className={s.close} onClick={onClose} aria-label="Close menu"><CloseIcon /></button></div>
        <div className={s.search}>{open && <SearchBox onDone={onClose} />}</div>
        <div className={s.scroll}>
          <Link to="/categories" className={s.primary} onClick={onClose}>All Categories <ArrowRight size={16} /></Link>
          {[['Home', '/'], ['Shop', '/shop'], ['New Offers', '/product-category/new-offers']].map(([l, to]) => <Link key={to} to={to} className={s.row} onClick={onClose}>{l}</Link>)}
          {MENU_SECTIONS.map((sec, i) => (
            <Acc key={sec.label} title={i ? 'Brands' : 'Categories'} defaultOpen={!i}>
              {sec.slugs.map((sl) => { const g = groupBySlug[sl]; return (
                <div key={sl} className={s.group}>
                  <h5><Link to={catUrl(sl)} onClick={onClose}>{g.name}</Link></h5>
                  {g.children?.length > 0 && <ul>{g.children.map((c) => <li key={c.slug}><Link to={catUrl(sl, c.slug)} onClick={onClose}>{c.name}</Link>
                    {c.children?.length > 0 && <span className={s.sub}>{c.children.map((d) => <Link key={d.slug} to={catUrl(sl, c.slug, d.slug)} onClick={onClose}>{d.name}</Link>)}</span>}</li>)}</ul>}
                </div>
              ); })}
            </Acc>
          ))}
          <Link to="/brands" className={s.row} onClick={onClose}>Brands</Link>
          <Link to="/contact" className={s.row} onClick={onClose}>Contact Us</Link>
        </div>
        <div className={s.foot}>
          <Link to="/account" onClick={onClose} className="btn btn--dark btn--sm"><UserIcon size={17} />{user ? 'My account' : 'Sign in'}</Link>
          <Link to="/wishlist" onClick={onClose} className="btn btn--dark btn--sm"><HeartIcon size={17} />Wishlist{wishlist.length ? ` (${wishlist.length})` : ''}</Link>
        </div>
      </aside>
    </div>
  );
}
