import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { HOMEPAGE } from '../../data/index.js';
import s from './PromoBanners.module.css';

/* The owner's promotional banners (Laravel: managed in the admin, sent with the catalog). Links are a store path
   or an https address and images an upload or an https address, all checked by the server; text is plain.
   One banner shows full width; two or three sit side by side; more become a swipeable row (as do all on phones).
   The admin's live preview (admin/src/pages/homepage/BannerPreview.jsx) mirrors this markup and these styles.
   Nothing shows when there are none. */
const isStorePath = (url) => url.startsWith('/') && !url.startsWith('//');
const OVERLAY = { none: s.ovNone, soft: s.ovSoft, strong: s.ovStrong };

function BannerLink({ b }) {
  if (!b.link_url || !b.link_label) return null;
  const inner = <>{b.link_label}<ArrowRight size={15} /></>;
  return isStorePath(b.link_url)
    ? <Link to={b.link_url} className={`btn btn--primary ${s.cta}`}>{inner}</Link>
    : <a href={b.link_url} className={`btn btn--primary ${s.cta}`} target="_blank" rel="noopener noreferrer">{inner}</a>;
}

/** "Ends Fri 23 Oct" when the banner ends within two weeks. */
function endsSoon(iso) {
  if (!iso) return null;
  const d = new Date(iso); const left = d.getTime() - Date.now();
  if (!(left > 0) || left > 14 * 864e5) return null;
  return `Ends ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function Banner({ b, first }) {
  const tag = endsSoon(b.ends_at);
  const classes = [s.card, b.image_url ? `${s.withImage} ${OVERLAY[b.overlay] || s.ovSoft}` : s.plain, b.image_mobile_url ? s.tall : ''].join(' ');
  return (
    <article className={classes}>
      {b.image_url && (
        <picture className={s.media}>
          {b.image_mobile_url && <source media="(max-width: 640px)" srcSet={b.image_mobile_url} />}
          <img src={b.image_url} alt="" className={s.img} style={b.focal_point ? { objectPosition: b.focal_point } : undefined}
            loading={first ? 'eager' : 'lazy'} fetchPriority={first ? 'high' : undefined} decoding="async" />
        </picture>
      )}
      <div className={s.body}>
        {tag && <span className={s.tag}>{tag}</span>}
        <h2 className={s.title}>{b.title}</h2>
        {b.text && <p className={s.text}>{b.text}</p>}
        <BannerLink b={b} />
      </div>
    </article>
  );
}

export default function PromoBanners() {
  const list = HOMEPAGE.banners;
  if (!list.length) return null;
  const layout = list.length === 1 ? 'hero' : list.length <= 3 ? 'grid' : 'track';
  return (
    <section className={s.sec} aria-label="Promotions">
      <div className="container">
        <div className={s.row} data-layout={layout} data-count={list.length} role={list.length > 1 ? 'list' : undefined}>
          {list.map((b, i) => (
            <div key={b.id} className={s.cell} role={list.length > 1 ? 'listitem' : undefined}><Banner b={b} first={i === 0} /></div>
          ))}
        </div>
      </div>
    </section>
  );
}
