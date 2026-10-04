// Navigation structure — kept as data so the mega menu, mobile drawer and footer all share it.
import { categoryBySlug, BRANDS } from './meta.js';
const cat = (slug, label) => ({ label: label || categoryBySlug[slug].name, to: `/category/${slug}` });

export const MEGA_SHOP = [
  { title: 'Gaming Gear', links: [cat('gaming-chairs', 'Chairs'), cat('gaming-desks', 'Desks'), cat('headsets'), cat('keyboards'), cat('gaming-mice', 'Mice'), cat('mouse-pads'), cat('monitors'), cat('microphones'), cat('speakers'), cat('racing-sim-gear')] },
  { title: 'Consoles', links: [
    { label: 'PlayStation 5', to: '/platform/playstation/ps5/consoles' }, { label: 'PlayStation 4', to: '/platform/playstation/ps4/consoles' },
    { label: 'Xbox Series X|S', to: '/platform/xbox/xbox-series/consoles' }, { label: 'Xbox One & 360', to: '/platform/xbox/xbox-one/consoles' },
    { label: 'Nintendo Switch', to: '/platform/nintendo/switch/consoles' }, cat('games'),
  ] },
  { title: 'Controllers', links: [
    { label: 'PS5 Controllers', to: '/platform/playstation/ps5/controllers' }, { label: 'Xbox Controllers', to: '/platform/xbox/xbox-series/controllers' },
    { label: 'PC Controllers', to: '/category/controllers?platform=pc' }, { label: 'Nintendo Controllers', to: '/platform/nintendo/switch/controllers' },
    { label: 'Multi-platform', to: '/category/controllers?platform=multi' }, cat('charging-stations'),
  ] },
  { title: 'PC Gaming', links: [cat('gaming-pcs'), cat('gaming-laptops', 'Gaming Laptops'), cat('pc-components', 'Components'), cat('storage'), cat('pc-accessories'), { label: 'All PC Gaming', to: '/platform/pc' }] },
  { title: 'Accessories', links: [cat('console-accessories'), cat('other-accessories'), cat('full-gaming-setups'), { label: 'Build Your Setup', to: '/build' }, { label: 'Deals', to: '/deals' }] },
];

export const MEGA_PLATFORMS = [
  { slug: 'playstation', name: 'PlayStation', to: '/platform/playstation', gens: [
    { name: 'PS5', to: '/platform/playstation/ps5', subs: ['Consoles', 'Controllers', 'Headsets', 'Games', 'Accessories', 'Charging Stations', 'Storage'].map((n) => ({ label: n, to: `/platform/playstation/ps5/${n.toLowerCase().replace(' ', '-')}` })) },
    { name: 'PS4', to: '/platform/playstation/ps4', subs: ['Consoles', 'Controllers', 'Games', 'Accessories'].map((n) => ({ label: n, to: `/platform/playstation/ps4/${n.toLowerCase()}` })) },
  ] },
  { slug: 'xbox', name: 'Xbox', to: '/platform/xbox', gens: [
    { name: 'Xbox Series X|S', to: '/platform/xbox/xbox-series', subs: ['Consoles', 'Controllers', 'Headsets', 'Games', 'Accessories'].map((n) => ({ label: n, to: `/platform/xbox/xbox-series/${n.toLowerCase()}` })) },
    { name: 'Xbox One', to: '/platform/xbox/xbox-one', subs: [] }, { name: 'Xbox 360', to: '/platform/xbox/xbox-360', subs: [] },
  ] },
  { slug: 'nintendo', name: 'Nintendo', to: '/platform/nintendo', gens: [
    { name: 'Nintendo Switch', to: '/platform/nintendo/switch', subs: ['Consoles', 'Controllers', 'Games', 'Accessories'].map((n) => ({ label: n, to: `/platform/nintendo/switch/${n.toLowerCase()}` })) },
  ] },
  { slug: 'pc', name: 'PC Gaming', to: '/platform/pc', gens: [
    { name: 'Peripherals', to: '/platform/pc', subs: [['Keyboards', 'keyboards'], ['Mice', 'mice'], ['Headsets', 'headsets'], ['Microphones', 'microphones'], ['Speakers', 'speakers']].map(([n, s]) => ({ label: n, to: `/platform/pc/${s}` })) },
    { name: 'Setup & Rig', to: '/platform/pc', subs: [['Gaming Chairs', 'gaming-chairs'], ['Desks', 'desks'], ['Monitors', 'monitors'], ['Components', 'pc-components'], ['Storage', 'storage'], ['Gaming Laptops', 'gaming-laptops']].map(([n, s]) => ({ label: n, to: `/platform/pc/${s}` })) },
  ] },
];

export const MEGA_BRANDS = BRANDS.map((b) => ({ label: b.name, to: `/brand/${b.slug}` }));

export const FOOTER_COLS = [
  { title: 'Categories', links: [['PC Parts', 'pc-parts'], ['PlayStation', 'playstation'], ['Nintendo Switch', 'nintendo-switch'], ['Xbox', 'xbox'], ['Laptops', 'laptops'], ['Tablets', 'tablets'], ['Other', 'other']].map(([label, sl]) => ({ label, to: `/product-category/${sl}` })).concat([{ label: 'All Categories', to: '/categories' }]) },
  { title: 'Brands', links: ['Razer', 'HyperX', 'Logitech', 'Marvo', 'Onikuma', 'Fantech', 'Xiaomi'].map((b) => ({ label: b, to: `/product-category/${b.toLowerCase()}` })).concat([{ label: 'All brands', to: '/brands' }]) },
  { title: 'Store', links: [{ label: 'Shop', to: '/shop' }, { label: 'New Offers', to: '/product-category/new-offers' }, { label: 'Compare', to: '/compare' }, { label: 'Wishlist', to: '/wishlist' }, { label: 'Contact Us', to: '/contact' }] },
  { title: 'Support', links: [{ label: 'My Account', to: '/account' }, { label: 'Order History', to: '/account?tab=orders' }, { label: 'Shipping & Delivery', to: '/account?tab=help' }, { label: 'Returns', to: '/account?tab=help' }] },
];
