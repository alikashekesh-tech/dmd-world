import { Link } from '../../router/index.jsx';
/* Official DMD World logo. public/images/dmd-logo-transparent.png is the original artwork with its white background and
   the crop strip removed (alpha edges, letter counters see-through), so it sits directly on any light surface.
   `size` is the display height in px; parents can override it per breakpoint with --logo-h. `light` puts the logo on
   a white plate for dark surfaces (footer, mobile menu): the grey DMD letters need a light ground. The plate is a
   literal white because ink surfaces re-scope --surface to a dark value. */
const SRC = '/images/dmd-logo-transparent.png';
const FALLBACK = 'https://dmdworld.store/wp-content/uploads/2022/11/LOGO-2048x803.png';
const RATIO = 247 / 100;

export default function Logo({ size = 40, light = false }) {
  const h = Math.max(size, 28);
  return (
    <Link
      to="/"
      aria-label="DMD World — home"
      style={{ display: 'inline-flex', alignItems: 'center', background: light ? '#fff' : 'transparent', borderRadius: light ? 10 : 0, padding: light ? '6px 10px' : 0 }}
    >
      <img
        src={SRC}
        alt="DMD World"
        width={Math.round(h * RATIO)}
        height={h}
        decoding="async"
        onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = 1; e.currentTarget.referrerPolicy = 'no-referrer'; e.currentTarget.src = FALLBACK; } }}
        style={{ height: `var(--logo-h, ${h}px)`, width: 'auto', display: 'block' }}
      />
    </Link>
  );
}
