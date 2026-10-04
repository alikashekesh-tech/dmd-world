import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import Logo from './Logo.jsx';
import SearchBox from './SearchBox.jsx';
import MegaMenu from './MegaMenu.jsx';
import MobileNav from './MobileNav.jsx';
import { SearchIcon, UserIcon, HeartIcon, BagIcon, MenuIcon, ChevronDown, CloseIcon, CompareIcon, PhoneIcon, MailIcon } from '../common/icons.jsx';
import { money } from '../../data/index.js';
import { CONTACT } from '../../data/dmdMenu.js';
import s from './Header.module.css';

export default function Header() {
  const { count, subtotal, wishlist, compare, user, setDrawer, unread } = useStore();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const timer = useRef();
  const { pathname } = useLocation();

  useEffect(() => { setMenu(false); setMobile(false); setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setSearchOpen(false); } };
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); };
  }, []);

  const open = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setMenu(true), 70); };
  const close = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setMenu(false), 160); };
  const stay = () => clearTimeout(timer.current);

  return (
    <header className={`${s.header} ${scrolled ? s.scrolled : ''}`} onMouseLeave={close} onMouseEnter={stay}>
      <div className={s.util}>
        <div className={`container ${s.utilIn}`}>
          <div className={s.contact}>
            <a href={`tel:${CONTACT.tel}`}><PhoneIcon size={14} />{CONTACT.phone}</a>
            <a href={`mailto:${CONTACT.email}`} className={s.hideSm}><MailIcon size={14} />{CONTACT.email}</a>
          </div>
          <div className={s.utilLinks}>
            <Link to="/wishlist">Wishlist{wishlist.length > 0 && ` (${wishlist.length})`}</Link>
            <Link to="/account">{user ? `My account${unread ? ` (${unread} new)` : ''}` : 'Sign in / Register'}</Link>
          </div>
        </div>
      </div>

      <div className={s.bar}>
        <div className={`container ${s.barIn}`}>
          <button type="button" className={`${s.iconBtn} ${s.burger}`} aria-label="Open menu" onClick={() => setMobile(true)}><MenuIcon /></button>
          <div className={s.logo}><Logo /></div>
          <nav className={s.nav} aria-label="Primary">
            <NavLink to="/" end className={s.link} onMouseEnter={() => setMenu(false)}>Home</NavLink>
            <NavLink to="/shop" className={s.link} onMouseEnter={() => setMenu(false)}>Shop</NavLink>
            <div className={s.item} onMouseEnter={open}>
              <button type="button" className={`${s.link} ${menu ? s.on : ''}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>Categories<ChevronDown size={14} /></button>
            </div>
            <NavLink to="/product-category/new-offers" className={`${s.link} ${s.offers}`} onMouseEnter={() => setMenu(false)}>New Offers</NavLink>
            <NavLink to="/brands" className={s.link} onMouseEnter={() => setMenu(false)}>Brands</NavLink>
            <NavLink to="/contact" className={s.link} onMouseEnter={() => setMenu(false)}>Contact Us</NavLink>
          </nav>
          <div className={s.search}><SearchBox placeholder="Search products, brands, categories..." /></div>
          <div className={s.actions}>
            <button type="button" className={`${s.iconBtn} ${s.searchBtn}`} aria-label="Search" onClick={() => setSearchOpen((v) => !v)}>{searchOpen ? <CloseIcon /> : <SearchIcon />}</button>
            <Link to="/compare" className={`${s.iconBtn} ${s.hideSm2}`} aria-label={`Compare, ${compare.length} items`} title="Compare"><CompareIcon />{compare.length > 0 && <span className={s.badge}>{compare.length > 99 ? '99+' : compare.length}</span>}</Link>
            <Link to="/wishlist" className={`${s.iconBtn} ${s.hideSm2}`} aria-label={`Wishlist, ${wishlist.length} items`} title="Wishlist"><HeartIcon />{wishlist.length > 0 && <span className={s.badge}>{wishlist.length > 99 ? '99+' : wishlist.length}</span>}</Link>
            <Link to={unread ? '/account?tab=messages' : '/account'} className={`${s.iconBtn} ${s.hideSm2}`} aria-label={user ? `My account${unread ? `, ${unread} new ${unread === 1 ? 'reply' : 'replies'} from DMD` : ''}` : 'Sign in'} title={unread ? 'New reply from DMD' : 'Account'}><UserIcon />{unread > 0 && <span className={s.badge}>{unread}</span>}</Link>
            <button type="button" className={s.cart} aria-label={`Cart, ${count} items, ${money(subtotal)}`} onClick={() => setDrawer(true)}>
              <span className={s.cartIcon}><BagIcon />{count > 0 && <span className={s.count}>{count}</span>}</span>
              <span className={s.cartTxt}><small>Cart</small><b>{money(subtotal)}</b></span>
            </button>
          </div>
        </div>
        {searchOpen && <div className={s.searchRow}><div className="container"><SearchBox autoFocus variant="overlay" placeholder="Search products, brands, categories..." onDone={() => setSearchOpen(false)} /></div></div>}
      </div>
      {menu && <MegaMenu onNavigate={() => setMenu(false)} />}
      {createPortal(<MobileNav open={mobile} onClose={() => setMobile(false)} />, document.body)}
    </header>
  );
}
