import PageHero from '../components/ui/PageHero.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { Link } from '../router/index.jsx';
import { CONTACT, STORE_LOCATION as STORE } from '../data/dmdMenu.js';
import { PinIcon, ClockIcon, PhoneIcon, ArrowRight } from '../components/common/icons.jsx';
import { usePageMeta } from '../lib/meta.js';
import s from './About.module.css';

export default function About() {
  usePageMeta({
    title: 'About us',
    description: 'DMD Megastore in Saida, Lebanon: gaming, electronics and accessories for every budget, new, open-box and used. Visit us at Illiya Intersection or shop online with delivery across Lebanon.',
  });
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'About Us' }]}
        eyebrow="About · DMD Megastore"
        title="Your next game, setup, and everyday essentials—all in one place."
        lead="Based in Saida, Lebanon, DMD Megastore brings together gaming, electronics, and accessories for every budget."
        art={<LineArt type="controller" />}
      />

      <div className="container">
        <section className={s.story} aria-label="About DMD Megastore">
          <p className={s.big}>From consoles and the latest games to gaming chairs, desks, audio, and collectibles, we help you find something that fits your needs and your style.</p>
          <div className={s.paras}>
            <p>Whether you’re upgrading your setup, choosing a gift, or buying your first console, our team is here to guide you. With new, open-box, and used options, we give you more ways to enjoy the products you love.</p>
            <p>We believe a great shopping experience starts with clear advice, friendly service, and support you can count on before and after your purchase.</p>
            <p>Visit us in Saida or shop online at <Link to="/shop">dmdworld.store</Link>, with delivery available across Lebanon.</p>
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

        <section className={s.visit} aria-labelledby="visit-title">
          <div className={s.visitCopy}>
            <small>03 · Saida, Lebanon</small>
            <h2 id="visit-title">Visit Our Store</h2>
            <p>Visit DMD Megastore at Illiya Intersection, Jad Center, next to Morjen Pharmacy, Saida, Lebanon. Explore our gaming, electronics, and accessories collections, and let our team help you find what you need.</p>
            <p className={s.online}>Can’t visit? <Link to="/shop">Shop online</Link> and enjoy delivery across Lebanon.</p>
          </div>
          <ul className={s.facts}>
            <li><span className={s.icon}><PinIcon size={20} /></span><div><small>Address</small><b>{STORE.address}</b><a href={STORE.map} target="_blank" rel="noopener noreferrer">Get directions <ArrowRight size={14} /></a></div></li>
            <li><span className={s.icon}><ClockIcon size={20} /></span><div><small>Hours</small><b>{STORE.hours}</b></div></li>
            <li><span className={s.icon}><PhoneIcon size={20} /></span><div><small>Call or WhatsApp</small><b><a href={`tel:${CONTACT.tel}`}>{CONTACT.phone}</a></b></div></li>
          </ul>
          <iframe className={s.map} src={STORE.embed} title="DMD Megastore on Google Maps" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </section>

        <p className={s.tagline}>DMD Megastore — <span>Level up your everyday.</span></p>
      </div>
    </>
  );
}
