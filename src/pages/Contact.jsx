import PageHero from '../components/ui/PageHero.jsx';
import LineArt from '../components/art/LineArt.jsx';
import { CONTACT, STORE_LOCATION } from '../data/dmdMenu.js';
import { PhoneIcon, MailIcon, PinIcon, ArrowRight } from '../components/common/icons.jsx';
import { usePageMeta } from '../lib/meta.js';
import s from './Contact.module.css';

const READY = ['Your order number, if you have one', 'Your console or PC model', 'A photo of the port or connector, if it’s about compatibility'];

export default function Contact() {
  usePageMeta({ title: 'Contact us', description: `Talk to a person at DMD World: call ${CONTACT.phone} or email ${CONTACT.email.toLowerCase()} about orders, compatibility, stock and delivery.` });
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Contact Us' }]}
        eyebrow="Contact · DMD World"
        title="Talk to a person."
        lead="Questions about compatibility, condition, stock or an order you placed. Call, message or email the store."
        art={<LineArt type="headset" />}
      />
      <div className={`container ${s.grid}`}>
        <a href={`tel:${CONTACT.tel}`} className={`${s.card} ${s.primary}`}>
          <span className={s.icon}><PhoneIcon size={22} /></span>
          <small>Call or WhatsApp</small>
          <b>{CONTACT.phone}</b>
          <em>Tap to call <ArrowRight size={15} /></em>
        </a>
        <a href={`mailto:${CONTACT.email.toLowerCase()}`} className={s.card}>
          <span className={s.icon}><MailIcon size={22} /></span>
          <small>Email</small>
          <b>{CONTACT.email.toLowerCase()}</b>
          <em>Write to us <ArrowRight size={15} /></em>
        </a>
        <div className={`${s.card} ${s.ready}`}>
          <small>Have this ready</small>
          <ul>{READY.map((r, i) => <li key={r}><span>0{i + 1}</span>{r}</li>)}</ul>
        </div>
        <div className={`${s.card} ${s.store}`}>
          <div className={s.storeInfo}>
            <span className={s.icon}><PinIcon size={22} /></span>
            <small>Visit the store</small>
            <b>{STORE_LOCATION.short}</b>
            <p>{STORE_LOCATION.address}</p>
            <p>{STORE_LOCATION.hours}</p>
            <a href={STORE_LOCATION.map} target="_blank" rel="noopener noreferrer"><em>Get directions <ArrowRight size={15} /></em></a>
          </div>
          <iframe className={s.map} src={STORE_LOCATION.embed} title="DMD Megastore on Google Maps" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </div>
      </div>
    </>
  );
}
