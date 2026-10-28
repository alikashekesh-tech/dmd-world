import { Link } from '../../router/index.jsx';

/* The official DMD World logo, served from this site (public/images/dmd-world-logo.png), never from WordPress.
   Shown at its own aspect ratio: only the height is set. The width and height attributes are the file's own size,
   so the browser keeps the right space for it before it loads. `size` is the display height in px.
   `light` is for dark backgrounds (footer, mobile menu): the same logo with its dark-gray letters made light and its
   deep blue brightened (dmd-world-logo-light.png), straight on the navy with no box behind it. */
export const LOGO = { src: '/images/dmd-world-logo.png', light: '/images/dmd-world-logo-light.png', width: 297, height: 107 };

export default function Logo({ size = 44, light = false }) {
  const h = size < 30 ? 40 : size;
  return (
    <Link to="/" aria-label="DMD World — home" style={{ display: 'inline-flex', alignItems: 'center' }}>
      <img src={light ? LOGO.light : LOGO.src} alt="DMD World" width={LOGO.width} height={LOGO.height} style={{ height: h, width: 'auto', display: 'block' }} />
    </Link>
  );
}
