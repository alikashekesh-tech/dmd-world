import { useLocation } from '../../router/index.jsx';
import { CONTACT } from '../../data/dmdMenu.js';
import { getProduct } from '../../data/index.js';

/** A wa.me link to the store's WhatsApp (the contact number set in the admin) with this message typed in. */
export const whatsAppUrl = (text) => `https://wa.me/${CONTACT.tel.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/** The message about a product: its name, the options chosen ([['Colour', 'Black']]) and its link. */
export function productMessage(product, options = []) {
  const chosen = options.filter(([, value]) => value).map(([name, value]) => `${name}: ${value}`).join(', ');
  return `Hi DMD World, I'm interested in ${product.name}${chosen ? ` (${chosen})` : ''}: ${location.origin}/product/${product.slug}`;
}

/* WhatsApp with the store (offered by the contact button, LiveChat.jsx). On a product page the message already names
   the product and its link, so the team knows what it's about; everywhere else it's a plain hello. */
export function useWhatsAppLink() {
  const { pathname } = useLocation();
  const slug = pathname.startsWith('/product/') ? decodeURIComponent(pathname.slice('/product/'.length)) : null;
  const product = slug ? getProduct(slug) : null;
  return whatsAppUrl(product ? productMessage(product) : 'Hi DMD World, I have a question.');
}

export function WhatsAppIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M16.02 3C8.84 3 3 8.83 3 16c0 2.3.6 4.53 1.75 6.5L3 29l6.68-1.74A12.95 12.95 0 0 0 16.02 29C23.2 29 29 23.17 29 16S23.2 3 16.02 3Zm0 23.62c-2.02 0-3.99-.54-5.71-1.57l-.41-.24-3.96 1.03 1.06-3.86-.27-.4A10.56 10.56 0 0 1 5.4 16c0-5.86 4.77-10.62 10.63-10.62 5.85 0 10.6 4.76 10.6 10.62 0 5.86-4.76 10.62-10.6 10.62Zm5.83-7.95c-.32-.16-1.89-.93-2.18-1.04-.3-.1-.51-.16-.72.16-.21.32-.83 1.04-1.01 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.99-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66 0 1.57 1.14 3.09 1.3 3.3.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.81.67.76.24 1.46.21 2 .13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}
