# DMD World — storefront redesign (React + Vite)

**Data:** `src/data/dmdCatalog.js` is a snapshot of dmdworld.store (112 categories, 187 of 1,993 products, real prices and photos, captured 2026-10-02). The photos are hotlinked from dmdworld.store. The store's public API blocks cross-origin requests, so to use the full catalog either deploy this frontend on the store's domain / behind a proxy and fetch `/wp-json/wc/store/v1/products`, or regenerate the snapshot from a full WooCommerce export.

**Logo:** `public/images/dmd-logo-transparent.png` is the official DMD World logo with its white background and crop strip removed (transparent, 247×100). It sits directly on light surfaces and on a white plate on ink (`Logo.jsx`). A vector or higher-resolution master would make it sharper on 3× screens.

**Placeholders:** delivery, returns and payment are not defined by DMD, so the cart and checkout show "confirmed on order". Checkout is a demo and takes no payment.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Structure

```
src/
  router/        tiny History-API router (Link, NavLink, useParams, useSearchParams, /* splats)
  context/       StoreContext: cart, wishlist, user, orders (persisted to localStorage)
  data/          meta.js (types, platform tree, brands, filters), products/*.js, nav.js, index.js (queries)
  components/
    art/         procedural SVG product renders, hero scene, brand wordmarks, photo override (Media.jsx)
    layout/      Header, MegaMenu, MobileNav, SearchBox, CartDrawer, Footer
    home/        Hero, CategoryGrid, PlatformSection, ProductRail, SetupShowcase, BrandSection, PromoBanner, Newsletter ...
    product/     ProductCard, ProductGrid
    shop/        ProductBrowser, FilterPanel, useFilters (filters live in the URL, so every view is shareable)
    setup/       SetupBuilder
  pages/         Home, Shop, Categories, CategoryPage, PlatformPage, Brands, Deals, ProductPage, Cart, Checkout, Order, Account, Wishlist, Build
```

Styling is CSS Modules plus design tokens in `src/styles/global.css`.

## Real photography

Product and hero art is generated SVG so the project runs with no assets. To use real photos, drop files in `public/images/` and list them in `public/images/manifest.json`; anything listed replaces the generated art. See `public/images/README.md`.

## Before launch

- Product names, prices, specs and ratings are **sample data** (Fantech, Marvo and Onikuma entries especially). Verify against supplier feeds.
- Checkout and account are client-side demos: nothing is sent anywhere and no payment is processed. Connect a real backend and payment provider (Stripe, etc.) before selling.
- Brand names are shown as typographic wordmarks. Use licensed logos only with permission from each brand.
