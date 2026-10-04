/* Per-page <title>, description, social preview tags, canonical link and structured data (JSON-LD) for a
   single-page app: search engines and link previews see what each page is about, not one generic title. */
import { useEffect } from 'react';

export const SITE = 'DMD World';
const DEFAULT_TITLE = 'DMD World — Gaming, Consoles & Electronics in Lebanon';
const DEFAULT_DESC = 'Consoles, new and used games, controllers, headsets, keyboards, mice, chairs and gadgets from PlayStation, Nintendo, Xbox, Razer, HyperX, Logitech and more. Order online, pay on delivery.';
const DEFAULT_IMAGE = '/images/dmd-logo.png';

function meta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!value) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', value);
}
function link(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { el?.remove(); return; }
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
  el.setAttribute('href', href);
}
const clip = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };

/**
 * @param {object} m
 * @param {string} [m.title]       page title (the site name is added)
 * @param {string} [m.description] up to ~160 characters are used
 * @param {string} [m.image]       absolute or site-relative image for link previews
 * @param {boolean} [m.noindex]    private or thin pages (cart, account, search results)
 * @param {object} [m.jsonLd]      schema.org data for this page
 * @param {string} [m.type]        og:type, "website" by default
 */
export function usePageMeta({ title, description, image, noindex = false, jsonLd, type = 'website' } = {}) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    const full = title ? `${title} · ${SITE}` : DEFAULT_TITLE;
    const desc = clip(description || DEFAULT_DESC);
    const url = `${location.origin}${location.pathname}`;
    const img = image ? new URL(image, location.origin).href : new URL(DEFAULT_IMAGE, location.origin).href;
    document.title = full;
    meta('name', 'description', desc);
    meta('name', 'robots', noindex ? 'noindex, follow' : null);
    meta('property', 'og:title', full);
    meta('property', 'og:description', desc);
    meta('property', 'og:url', url);
    meta('property', 'og:image', img);
    meta('property', 'og:type', type);
    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    link('canonical', noindex ? null : url);
    let script = null;
    if (ld) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.page = '1';
      script.textContent = ld.replace(/</g, '\\u003c'); // can't close the script element early
      document.head.appendChild(script);
    }
    return () => { script?.remove(); };
  }, [title, description, image, noindex, ld, type]);
}
