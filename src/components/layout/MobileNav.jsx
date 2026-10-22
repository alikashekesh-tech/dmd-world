import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { MENU_SECTIONS, groupBySlug, catUrl } from '../../data/dmdMenu.js';
import { useCatalog } from '../../data/live.js';
import { CloseIcon, ChevronDown, UserIcon, HeartIcon, ArrowRight } from '../common/icons.jsx';
import Logo from './Logo.jsx';
import SearchBox from './SearchBox.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { useDialog } from '../../lib/useDialog.js';
import { SIGN_IN } from '../../lib/authRoutes.js';
import s from './MobileNav.module.css';

/** A section of the drawer; the drawer decides which one is open. */
function Acc({ title, open, onToggle, children }) {
  return (
    <div className={s.acc}>
      <button type="button" className={s.accHead} aria-expanded={open} onClick={onToggle}>{title}<ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} /></button>
      {open && <div className={s.accBody}>{children}</div>}
    </div>
  );
}

// MENU_SECTIONS is [categories, brands]: each becomes one section of the drawer.
const SECTION_TITLES = ['Categories', 'Brands'];

export default function MobileNav({ open, onClose }) {
  const { wishlist, user } = useStore();
  const panel = useDialog(open, onClose);
  useCatalog(); // the tree comes with the catalog
  // Categories and Brands are closed every time the drawer opens (reset as it opens, before it's drawn, so nothing
  // collapses while it slides away), and opening one closes the other. Tapping the open one closes it.
  const [section, setSection] = useState(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSection(null);
  }
  const toggle = (i) => setSection((cur) => (cur === i ? null : i));
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
            <Acc key={sec.label} title={SECTION_TITLES[i]} open={section === i} onToggle={() => toggle(i)}>
              {i === 1 && <div className={s.group}><h5><Link to="/brands" onClick={onClose}>All brands</Link></h5></div>}
              {sec.slugs.filter((sl) => groupBySlug[sl]).map((sl) => { const g = groupBySlug[sl]; return (
                <div key={sl} className={s.group}>
                  <h5><Link to={catUrl(sl)} onClick={onClose}>{g.name}</Link></h5>
                  {g.children?.length > 0 && <ul>{g.children.map((c) => <li key={c.slug}><Link to={catUrl(sl, c.slug)} onClick={onClose}>{c.name}</Link>
                    {c.children?.length > 0 && <span className={s.sub}>{c.children.map((d) => <Link key={d.slug} to={catUrl(sl, c.slug, d.slug)} onClick={onClose}>{d.name}</Link>)}</span>}</li>)}</ul>}
                </div>
              ); })}
            </Acc>
          ))}
          <Link to="/contact" className={s.row} onClick={onClose}>Contact Us</Link>
        </div>
        <div className={s.foot}>
          <Link to={user ? '/account' : SIGN_IN} onClick={onClose} className="btn btn--dark btn--sm"><UserIcon size={17} />{user ? 'My account' : 'Sign in'}</Link>
          <Link to="/wishlist" onClick={onClose} className="btn btn--dark btn--sm"><HeartIcon size={17} />Wishlist{wishlist.length ? ` (${wishlist.length})` : ''}</Link>
        </div>
      </aside>
    </div>
  );
}
