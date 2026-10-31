// Fixed footer links. The footer's category and brand columns are built from the store's own tree (Footer.jsx), so
// they follow what the owner manages instead of a hand-kept copy.
export const FOOTER_COLS = [
  { title: 'Store', links: [{ label: 'Shop', to: '/shop' }, { label: 'New Offers', to: '/product-category/new-offers' }, { label: 'Buy Used', to: '/buy-used' }, { label: 'Wishlist', to: '/wishlist' }, { label: 'About Us', to: '/about' }, { label: 'Contact Us', to: '/contact' }] },
  { title: 'Support', links: [{ label: 'My Account', to: '/account' }, { label: 'Order History', to: '/account?tab=orders' }, { label: 'Shipping & Delivery', to: '/account?tab=help' }, { label: 'Returns', to: '/account?tab=help' }] },
];

// The top menu's links (header and phone menu). The owner picks which show and their order in Admin › Settings ›
// Top menu (STORE.menu); `categories` is the dropdown of categories and brands, ordered in Admin › Categories / Brands.
export const MENU_LINKS = {
  home: { label: 'Home', to: '/' },
  shop: { label: 'Shop', to: '/shop' },
  categories: { label: 'Categories' },
  offers: { label: 'New Offers', to: '/product-category/new-offers' },
  used: { label: 'Buy Used', to: '/buy-used' },
  brands: { label: 'Brands', to: '/brands' },
  about: { label: 'About Us', to: '/about' },
  contact: { label: 'Contact Us', to: '/contact' },
};
export const DEFAULT_MENU = Object.keys(MENU_LINKS);
