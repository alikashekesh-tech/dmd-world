import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { HOMEPAGE } from '../../data/index.js';
import s from './PromoBanners.module.css';

/* The owner's promotional banners (Laravel: managed in the admin, sent with the catalog). Links are a store path
   or an https address, both checked by the server; text is plain. Nothing shows when there are none. */
const isStorePath = (url) => url.startsWith('/') && !url.startsWith('//');

function BannerLink({ b }) {
  if (!b.link_url) return null;
  const inner = <>{b.link_label}<ArrowRight size={15} /></>;
  return isStorePath(b.link_url)
    ? <Link to={b.link_url} className="btn btn--primary btn--sm">{inner}</Link>
    : <a href={b.link_url} className="btn btn--primary btn--sm" target="_blank" rel="noopener noreferrer">{inner}</a>;
}

export default function PromoBanners() {
  const list = HOMEPAGE.banners;
  if (!list.length) return null;
  return (
    <section className={s.sec} aria-label="Promotions">
      <div className={`container ${s.row}`} data-count={Math.min(list.length, 3)}>
        {list.map((b) => (
          <article key={b.id} className={`${s.card} ${b.image_url ? s.withImage : ''}`}>
            {b.image_url && <img src={b.image_url} alt="" className={s.img} loading="lazy" decoding="async" />}
            <div className={s.body}>
              <h2 className={s.title}>{b.title}</h2>
              {b.text && <p className={s.text}>{b.text}</p>}
              <BannerLink b={b} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
