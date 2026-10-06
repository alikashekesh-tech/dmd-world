import { Link } from '../../router/index.jsx';
import { ArrowRight } from '../common/icons.jsx';
import { useLanding } from './data.js';
import { WORLD_ART } from './WorldArt.jsx';
import CategoryArt from '../art/CategoryArt.jsx';
import useInView from './useInView.js';
import s from './WorldGrid.module.css';

const LINE = {
  'action-figures': 'Heroes, villains and collectibles for the shelf above the desk.',
  'retro-games-and-consoles': 'Plug-and-play consoles and game sticks packed with classics.',
};

export default function WorldGrid({ n = 4 }) {
  const { WORLD } = useLanding();
  const [ref, { seen, live }] = useInView({ threshold: 0.12 });
  return (
    <section ref={ref} className={s.sec} data-seen={seen || undefined} data-paused={!live || undefined} aria-labelledby="wg-title">
      <div className="container">
        <div className={s.head}>
          <p className={s.eyebrow}>{String(n).padStart(2, '0')} · Beyond the console</p>
          <h2 id="wg-title" className={s.title}>The rest of the world.</h2>
          <p className={s.sub}>DMD isn’t only games. Figures, gadgets, audio, laptops and the things that keep it all charged and connected.</p>
        </div>
        <ul className={s.grid}>
          {WORLD.map((t, i) => {
            const Art = WORLD_ART[t.art];
            return (
              <li key={t.slug} className={`${s.cell} ${t.size ? s[t.size] : ''}`} style={{ gridArea: t.area, '--i': i }}>
                <Link to={t.to} className={s.tile}>
                  <span className={s.art}>{t.spec ? <CategoryArt spec={t.spec} /> : <Art />}</span>
                  <span className={s.meta}>
                    <span className={s.name}>{t.name}</span>
                    {LINE[t.slug] && <span className={s.line}>{LINE[t.slug]}</span>}
                    <span className={s.count}>{t.count} products <ArrowRight size={14} /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
