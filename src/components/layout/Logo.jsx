import { Link } from '../../router/index.jsx';

/* The official DMD World logo, served from this site (public/images/dmd-world-logo.png), never from WordPress.
   Shown at its own aspect ratio: only the height is set. The width and height attributes are the file's own size,
   so the browser keeps the right space for it before it loads. `size` is the display height in px. */
export const LOGO = { src: '/images/dmd-world-logo.png', width: 297, height: 107 };

export default function Logo({ size = 44, light = false }) {
  const h = size < 30 ? 40 : size;
  return (
    <Link to="/" aria-label="DMD World — home" style={{ display: 'inline-flex', alignItems: 'center', background: light ? '#fff' : 'transparent', borderRadius: light ? 8 : 0, padding: light ? '4px 8px' : 0 }}>
      <img src={LOGO.src} alt="DMD World" width={LOGO.width} height={LOGO.height} style={{ height: h, width: 'auto', display: 'block' }} />
    </Link>
  );
}
