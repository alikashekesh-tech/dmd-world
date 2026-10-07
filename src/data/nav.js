// Fixed footer links. The footer's category and brand columns are built from the store's own tree (Footer.jsx), so
// they follow what the owner manages instead of a hand-kept copy.
export const FOOTER_COLS = [
  { title: 'Store', links: [{ label: 'Shop', to: '/shop' }, { label: 'New Offers', to: '/product-category/new-offers' }, { label: 'Wishlist', to: '/wishlist' }, { label: 'Contact Us', to: '/contact' }] },
  { title: 'Support', links: [{ label: 'My Account', to: '/account' }, { label: 'Order History', to: '/account?tab=orders' }, { label: 'Shipping & Delivery', to: '/account?tab=help' }, { label: 'Returns', to: '/account?tab=help' }] },
];
