import { Link } from '../../router/index.jsx';
/* Official DMD World logo (official URL, local copy in public/images/dmd-logo.png as fallback). `size` is the display height in px. */
export default function Logo({ size = 44, light = false }) {
  const h = size < 30 ? 40 : size;
  return (
    <Link to="/" aria-label="DMD World — home" style={{ display: 'inline-flex', alignItems: 'center', background: light ? '#fff' : 'transparent', borderRadius: light ? 8 : 0, padding: light ? '4px 8px' : 0 }}>
      <img src="https://dmdworld.store/wp-content/uploads/2022/11/LOGO-2048x803.png" alt="DMD World" referrerPolicy="no-referrer" onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = 1; e.currentTarget.src = "/images/dmd-logo.png"; } }} height={h} style={{ height: h, width: 'auto', display: 'block' }} />
    </Link>
  );
}
