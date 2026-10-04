import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { useRoute, match } from './lib/router.jsx';
import { UiProvider, SkeletonRows } from './ui/kit.jsx';
import Shell from './shell/Shell.jsx';
import { Login, Setup, Offline, Spinner } from './shell/Gate.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PageError from './shell/PageError.jsx';

// The dashboard comes with the first download; other screens load the first time they're opened.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const ProductsPage = named(() => import('./pages/Products.jsx'), 'ProductsPage');
const ProductEditor = named(() => import('./pages/Products.jsx'), 'ProductEditor');
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Brands = lazy(() => import('./pages/Brands.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Offers = lazy(() => import('./pages/Offers.jsx'));
const OrdersPage = named(() => import('./pages/Orders.jsx'), 'OrdersPage');
const OrderDetail = named(() => import('./pages/Orders.jsx'), 'OrderDetail');
const CustomersPage = named(() => import('./pages/Customers.jsx'), 'CustomersPage');
const CustomerProfile = named(() => import('./pages/Customers.jsx'), 'CustomerProfile');
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Reviews = lazy(() => import('./pages/Reviews.jsx'));
const Homepage = lazy(() => import('./pages/Homepage.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Trash = lazy(() => import('./pages/Trash.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const ROUTES = [
  ['/', Dashboard], ['/products', ProductsPage], ['/products/new', ProductEditor], ['/products/:id', ProductEditor],
  ['/categories', Categories], ['/brands', Brands], ['/inventory', Inventory], ['/offers', Offers],
  ['/orders', OrdersPage], ['/orders/:id', OrderDetail], ['/customers', CustomersPage], ['/customers/guest/:email', CustomerProfile], ['/customers/:id', CustomerProfile],
  ['/messages', Messages], ['/messages/:id', Messages], ['/reviews', Reviews], ['/homepage', Homepage], ['/notifications', Notifications], ['/trash', Trash], ['/settings', Settings],
];

export default function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const route = useRoute();
  const load = useCallback(async () => {
    setError(null);
    try { setSession(await api.get('/session')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const on = () => setSession((s) => (s ? { ...s, authed: false } : s)); window.addEventListener('adm:signedout', on); return () => window.removeEventListener('adm:signedout', on); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [route.path]);
  const signOut = async () => { await api.post('/logout').catch(() => {}); setSession((s) => ({ ...s, authed: false })); };

  let body;
  if (error) body = <Offline error={error} retry={load} />;
  else if (!session) body = <Spinner />;
  else if (!session.configured) body = <Setup missing={session.missing} />;
  else if (!session.authed) body = <Login store={session.store} onIn={load} />;
  else {
    let Page = null; let params = {};
    for (const [pattern, C] of ROUTES) { const m = match(pattern, route.path); if (m) { Page = C; params = m; break; } }
    body = (
      <Shell session={session} path={route.path} onSignOut={signOut}>
        {Page ? (
          <PageError key={route.path}>
            <Suspense fallback={<div className="surface" style={{ marginTop: 16 }}><SkeletonRows /></div>}><Page params={params} query={route.query} session={session} /></Suspense>
          </PageError>
        ) : <div className="empty"><h3>Nothing here</h3><p><a className="linkish" href="#/">Back to the dashboard</a></p></div>}
      </Shell>
    );
  }
  return <UiProvider>{body}</UiProvider>;
}
