import { lazy, Suspense } from 'react';
import { Router, Routes, useLocation } from './router/index.jsx';
import { StoreProvider } from './context/StoreContext.jsx';
import Layout from './components/layout/Layout.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';
import { useCatalogStatus, refreshCatalog } from './data/live.js';

// The home page ships with the first download; every other page is fetched when it's first opened.
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const BrandsIndex = lazy(() => import('./pages/Brands.jsx').then((m) => ({ default: m.BrandsIndex })));
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Order = lazy(() => import('./pages/Order.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'));
const ProductCategory = lazy(() => import('./pages/ProductCategory.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));

const routes = [
  { path: '/', element: <Home /> },
  { path: '/shop', element: <Shop /> },
  { path: '/categories', element: <Categories /> },
  { path: '/brands', element: <BrandsIndex /> },
  { path: '/product/:slug', element: <ProductPage /> },
  { path: '/cart', element: <Cart /> },
  { path: '/checkout', element: <Checkout /> },
  { path: '/order/:id', element: <Order /> },
  { path: '/account', element: <Account /> },
  // One address per form, so a link always opens the form it names (src/lib/authRoutes.js).
  { path: '/account/sign-in', element: <Account auth="in" /> },
  { path: '/account/register', element: <Account auth="up" /> },
  { path: '/account/forgot-password', element: <Account auth="forgot" /> },
  { path: '/account/reset', element: <ResetPassword /> },
  { path: '/wishlist', element: <Wishlist /> },
  { path: '/product-category/*', element: <ProductCategory /> },
  { path: '/contact', element: <Contact /> },
];

/** Shown for the moment a page's code is downloading: keeps the layout steady instead of flashing empty. */
function PageLoading() {
  return <div className="container" style={{ minHeight: '60vh', paddingBlock: 48 }} role="status" aria-live="polite"><span className="sr-only">Loading…</span><div className="skeleton" style={{ height: 180, borderRadius: 24 }} /></div>;
}

function Pages() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}><Routes routes={routes} fallback={<NotFound />} /></Suspense>
    </ErrorBoundary>
  );
}

/**
 * With the Laravel backend the catalog (and the menus built from it) comes from the API; pages wait for it, or for
 * this device's cached copy, instead of rendering half a store. If the store can't be reached the visitor is told so
 * and can try again; nothing made-up is ever shown in its place.
 */
function CatalogGate({ children }) {
  const status = useCatalogStatus();
  if (status === 'ready') return children;
  if (status === 'failed') {
    return (
      <main className="container" style={{ minHeight: '70vh', display: 'grid', placeContent: 'center', textAlign: 'center', gap: 16 }} role="alert">
        <h1 style={{ fontSize: 28 }}>The store can’t be reached right now</h1>
        <p style={{ color: 'var(--muted)' }}>Check your connection, then try again. Nothing in your cart is lost.</p>
        <p><button type="button" className="btn btn--primary" onClick={() => refreshCatalog()}>Try again</button></p>
      </main>
    );
  }
  return <main className="container" style={{ minHeight: '70vh', paddingBlock: 48 }} role="status" aria-live="polite"><span className="sr-only">Loading the store…</span><div className="skeleton" style={{ height: 64, borderRadius: 16, marginBottom: 24 }} /><div className="skeleton" style={{ height: 320, borderRadius: 24 }} /></main>;
}

export default function App() {
  return (
    <StoreProvider>
      <CatalogGate>
        <Router>
          <Layout><Pages /></Layout>
        </Router>
      </CatalogGate>
    </StoreProvider>
  );
}
