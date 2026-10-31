import PageHero from '../components/ui/PageHero.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { Link } from '../router/index.jsx';
import { group, catUrl } from '../data/dmdMenu.js';
import { useCatalog } from '../data/live.js';
import { ArrowRight } from '../components/common/icons.jsx';
import { usePageMeta } from '../lib/meta.js';
import s from './About.module.css';

export default function About() {
  usePageMeta({
    title: 'About us',
    description: 'DMD Megastore: gaming, electronics and accessories for every budget, new, open-box and used, including Marvo gaming gear and our own brand, Megavolt. Shop online with delivery across Lebanon.',
  });
  useCatalog(); // the brand links below follow the catalog
  // A brand's link is shown while the store lists something of it.
  const shop = (slug, name) => group(slug).count > 0 && <Link to={catUrl(slug)} className={s.more}>Shop {name} <ArrowRight size={14} /></Link>;
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'About Us' }]}
        eyebrow="About · DMD Megastore"
        title="Your next game, setup, and everyday essentials—all in one place."
        lead="DMD Megastore brings together gaming, electronics, and accessories for every budget."
        art={<LineArt type="controller" />}
      />

      <div className="container">
        <section className={s.story} aria-label="About DMD Megastore">
          <p className={s.big}>From consoles and the latest games to gaming chairs, desks, audio, and collectibles, we help you find something that fits your needs and your style.</p>
          <div className={s.paras}>
            <p>Whether you’re upgrading your setup, choosing a gift, or buying your first console, our team is here to guide you. With new, open-box, and used options, we give you more ways to enjoy the products you love.</p>
            <p>We believe a great shopping experience starts with clear advice, friendly service, and support you can count on before and after your purchase.</p>
            <p>Shop online at <Link to="/shop">dmdworld.store</Link>, with delivery available across Lebanon.</p>
          </div>
        </section>

        <section className={s.pair} aria-label="Mission and vision">
          <article className={`${s.card} ${s.dark}`}>
            <small>01 · Our Mission</small>
            <p>To make gaming and technology accessible to everyone by offering a wide range of products, competitive prices, and helpful service. At DMD Megastore, we help customers across Lebanon find the right products for their needs and budget.</p>
          </article>
          <article className={s.card}>
            <small>02 · Our Vision</small>
            <p>To become a trusted destination for gaming and electronics in Lebanon, where customers can discover new products, build their ideal setup, and feel confident in every purchase.</p>
          </article>
        </section>

        {/* Business review: the Marvo wording is deliberately neutral ("we work with"); confirm the exact agency or
            distribution terms before stating more (e.g. "official agent"). */}
        <section className={`${s.pair} ${s.brands}`} aria-label="Our brands">
          <article className={s.card}>
            <small>03 · Marvo at DMD</small>
            <h2>Marvo</h2>
            <p>We work with Marvo to bring its gaming gear to customers across Lebanon: keyboards, mice, headsets, chairs, desks and accessories, with advice and after-sales support from our own team.</p>
            {shop('marvo', 'Marvo')}
          </article>
          <article className={`${s.card} ${s.dark}`}>
            <small>04 · A DMD brand</small>
            <h2>Megavolt</h2>
            <p>Megavolt is DMD’s own brand, built on the same promise as the rest of our store: dependable quality at a fair price, backed by a team you can reach.</p>
            {shop('megavolt', 'Megavolt')}
          </article>
        </section>

        <p className={s.tagline}>DMD Megastore — <span>Level up your everyday.</span></p>
      </div>
    </>
  );
}
