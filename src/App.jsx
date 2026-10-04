import { lazy, Suspense } from 'react';
import { Router, Routes, useLocation } from './router/index.jsx';
import { StoreProvider } from './context/StoreContext.jsx';
import Layout from './components/layout/Layout.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';

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
const Compare = lazy(() => import('./pages/Compare.jsx'));
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
  { path: '/account/reset', element: <ResetPassword /> },
  { path: '/wishlist', element: <Wishlist /> },
  { path: '/product-category/*', element: <ProductCategory /> },
  { path: '/compare', element: <Compare /> },
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

export default function App() {
  return (
    <StoreProvider>
      <Router>
        <Layout><Pages /></Layout>
      </Router>
    </StoreProvider>
  );
}
