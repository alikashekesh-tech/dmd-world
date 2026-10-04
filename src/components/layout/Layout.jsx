import { useEffect, useRef } from 'react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CartDrawer from './CartDrawer.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { useLocation } from '../../router/index.jsx';
import s from './Layout.module.css';

export default function Layout({ children }) {
  const { toast, setToast } = useStore();
  const { pathname } = useLocation();
  const first = useRef(true);
  // On every page change, move focus to the content so screen readers announce the new page (not on first load).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  const t = typeof toast === 'string' ? { text: toast } : toast;
  return (
    <>
      <a href="#main" className={s.skip}>Skip to content</a>
      <Header />
      <main id="main" className={s.main} tabIndex={-1}>{children}</main>
      <Footer />
      <CartDrawer />
      <div className={`${s.toast} ${t ? s.show : ''}`} role="status" aria-live="polite">
        {t?.text}
        {t?.undo && <button type="button" className={s.undo} onClick={() => { t.undo(); setToast(null); }}>Undo</button>}
      </div>
    </>
  );
}
