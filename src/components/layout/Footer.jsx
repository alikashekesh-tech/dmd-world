import { Link, useLocation } from '../../router/index.jsx';
import { FOOTER_COLS } from '../../data/nav.js';
import { CONTACT, MENU_SECTIONS, groupBySlug, catUrl } from '../../data/dmdMenu.js';
import { useCatalog } from '../../data/live.js';
import Logo from './Logo.jsx';
import LineArt from '../art/LineArt.jsx';
import { PhoneIcon, MailIcon } from '../common/icons.jsx';
import s from './Footer.module.css';

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

/* The first two columns follow the store's own categories and brands (the same tree as the menus); the last two are
   fixed links. */
function columns() {
  const pick = (i, all) => (MENU_SECTIONS[i]?.slugs || []).filter((sl) => groupBySlug[sl]).slice(0, 7).map((sl) => ({ label: groupBySlug[sl].name, to: catUrl(sl) })).concat([all]);
  return [
    { title: 'Categories', links: pick(0, { label: 'All Categories', to: '/categories' }) },
    { title: 'Brands', links: pick(1, { label: 'All brands', to: '/brands' }) },
    ...FOOTER_COLS,
  ];
}

export default function Footer() {
  const { pathname } = useLocation();
  useCatalog();
  // Home already ends on its own "ask a person" section, and the contact page is that pitch.
  const showAsk = pathname !== '/' && pathname !== '/contact';
  return (
    <footer className={s.footer}>
      {showAsk && (
        <div className={`container ${s.ask}`}>
          <div className={s.askArt} aria-hidden="true"><LineArt type="controller" /></div>
          <div className={s.askCopy}>
            <p className={s.hud}>Need a hand?</p>
            <h2>Ask before you buy.</h2>
            <p>Not sure it works with your console, or which size fits? Call or email DMD World and a person will answer.</p>
          </div>
          <div className={s.askBtns}>
            <a href={`tel:${CONTACT.tel}`} className="btn btn--primary btn--lg"><PhoneIcon size={18} />{CONTACT.phone}</a>
            <a href={`mailto:${CONTACT.email.toLowerCase()}`} className="btn btn--ghost btn--lg"><MailIcon size={18} />Email us</a>
          </div>
        </div>
      )}
      <div className={`container ${s.top}`}>
        <div className={s.brand}>
          <Logo light />
          <p>Consoles, games, gaming gear and electronics, from PlayStation, Nintendo, Xbox, Razer, HyperX, Logitech and more.</p>
          <ul className={s.contact}>
            <li><a href={`tel:${CONTACT.tel}`}>{CONTACT.phone}</a></li>
            <li><a href={`mailto:${CONTACT.email.toLowerCase()}`}>{CONTACT.email.toLowerCase()}</a></li>
          </ul>
        </div>
        {columns().map((c, i) => (
          <nav key={c.title} aria-label={c.title} className={s.col}>
            <h4><span>0{i + 1}</span>{c.title}</h4>
            <ul>{c.links.map((l) => <li key={l.label}><Link to={l.to}>{l.label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className={s.bottom}>
        <div className={`container ${s.bottomIn}`}>
          <span>© {new Date().getFullYear()} DMD World. All trademarks belong to their respective owners.</span>
          <span className={s.gg}>
            <svg viewBox="0 0 28 24" width="14" height="12" aria-hidden="true">{HEART.flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? <rect key={`${x}-${y}`} x={x * 4} y={y * 4} width="4.1" height="4.1" /> : null)))}</svg>
            GG, thanks for playing
          </span>
        </div>
      </div>
    </footer>
  );
}
