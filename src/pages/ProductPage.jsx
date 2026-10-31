import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from '../router/index.jsx';
import { useStore } from '../context/StoreContext.jsx';
import Breadcrumbs from '../components/ui/Breadcrumbs.jsx';
import useTween from '../components/landing/useTween.js';
import { dealBadge } from '../components/product/ProductCard.jsx';
import { ProductImage } from '../components/art/Media.jsx';
import { Rating, Price, Stock, Compat } from '../components/common/bits.jsx';
import { QtyStepper } from '../components/layout/CartDrawer.jsx';
import ProductGrid from '../components/product/ProductGrid.jsx';
import { HeartIcon, TruckIcon, PhoneIcon, MailIcon, CheckIcon, ArrowRight, BellIcon } from '../components/common/icons.jsx';
import { getProduct, groupOf, PRODUCTS, COLORS, money, isNew, purchaseLimit, variantLimit, deliveryFee } from '../data/index.js';
import { useCatalog } from '../data/live.js';
import Reviews from '../components/product/Reviews.jsx';
import RoomView from '../components/product/RoomView.jsx';
import OptionPicker from '../components/product/OptionPicker.jsx';
import { isVariable, findVariant, missingOptions, initialSelection, optionList, conditionOf, withVariantImage } from '../lib/variants.js';
import { whatsAppUrl, productMessage, WhatsAppIcon } from '../components/layout/WhatsAppButton.jsx';
import { CONTACT } from '../data/dmdMenu.js';
import { catName } from '../data/dmdProducts.js';
import { usePageMeta } from '../lib/meta.js';
import { recentIds, rememberView } from '../lib/recent.js';
import { laravelApi } from '../lib/laravelApi.js';
import { SIGN_IN, authUrl } from '../lib/authRoutes.js';
import NotFound from './NotFound.jsx';
import s from './ProductPage.module.css';

const ART_VIEWS = ['Front', 'Angle', 'Detail', 'In use'];

/* On a reduced item the price counts down from what it used to cost, so the saving is something you watch happen. */
function DropPrice({ p }) {
  const v = useTween(p.was, p.price, true, { delay: 350, duration: 1200 });
  const done = Math.abs(v - p.price) < 0.01;
  return (
    <span className={s.drop}>
      <strong className={done ? s.landed : undefined} aria-hidden={!done || undefined}>{done ? money(p.price) : `$${Math.ceil(v)}`}</strong>
      {!done && <span className="sr-only">{money(p.price)}</span>}
      <del><span className="sr-only">Was </span>{money(p.was)}</del>
      <em>{dealBadge(p)}</em>
    </span>
  );
}

/** Sold out: signed-in buyers get an email when it's back; guests are asked to sign in first. */
function NotifyMe({ p }) {
  const { buyer, hasAlert, toggleAlert, setToast } = useStore();
  const [busy, setBusy] = useState(false);
  const on = hasAlert(p.id);
  if (!buyer) return <Link to={authUrl(SIGN_IN, `/product/${p.slug}`)} className="btn btn--secondary btn--lg btn--block"><BellIcon size={17} />Sign in to get a back-in-stock email</Link>;
  const flip = async () => {
    setBusy(true);
    try { const now = await toggleAlert(p.id); setToast(now ? `We’ll email you when ${p.name} is back` : 'Back-in-stock email cancelled'); }
    catch (e) { setToast(e.message); }
    setBusy(false);
  };
  return (
    <button type="button" className={`btn btn--lg btn--block ${on ? 'btn--secondary' : 'btn--primary'}`} onClick={flip} disabled={busy} aria-pressed={on}>
      <BellIcon size={17} />{on ? 'You’ll get an email when it’s back · Cancel' : 'Email me when it’s back in stock'}
    </button>
  );
}

const TABS = [['overview', 'Details'], ['specs', 'Specifications'], ['reviews', 'Reviews']];

/** Laravel's product detail → the details shape this page reads (paragraphs, attributes, size and weight). */
const detailsFromApi = (d) => ({
  short: d.short_description || '',
  description: String(d.description || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean),
  attributes: (d.specifications || []).map((x) => ({ name: x.name, value: x.value })),
  weight: d.weight_kg ?? null,
  dimensions: d.dimensions_cm ? `${d.dimensions_cm.join(' × ')} cm` : null,
  video: d.video?.type === 'file' || d.video?.type === 'youtube' ? d.video : null, // {type: file, url} or {type: youtube, id}
});

/** The product's video on the stage: its own file, or YouTube's privacy-enhanced player (no cookies until played). */
function ProductVideo({ video, name }) {
  if (video.type === 'youtube') {
    return <iframe className={s.stageVideo} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?rel=0`} title={`${name}, video`} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />;
  }
  return <video className={s.stageVideo} src={video.url} controls playsInline preload="metadata" aria-label={`${name}, video`} />;
}

export default function ProductPage() {
  const { slug } = useParams();
  const version = useCatalog();
  const p = getProduct(slug);
  const nav = useNavigate();
  const { addToCart, toggleWish, isWished, catalogVersion, roomFor } = useStore();
  const [color, setColor] = useState(p?.colors[0]);
  const [sel, setSel] = useState(() => initialSelection(p)); // the options chosen, for a product sold in variants
  const [tried, setTried] = useState(false); // tried to add before choosing every option: say which is missing
  const [view, setView] = useState(0);
  const [qty, setQty] = useState(1);
  const [params] = useSearchParams();
  const wantReview = params.get('review') === '1'; // from "Review" in order history
  const [tab, setTab] = useState(wantReview ? 'reviews' : 'overview');
  const [details, setDetails] = useState(null); // description and attributes from WooCommerce, loaded per product
  const tabRefs = useRef({});
  useEffect(() => {
    let live = true;
    setDetails(null);
    const load = laravelApi.get(`/products/${encodeURIComponent(slug)}`).then(({ data: d }) => detailsFromApi(d));
    load.then((d) => { if (live) setDetails(d); }).catch(() => {});
    return () => { live = false; };
  }, [slug]);
  useEffect(() => {
    setColor(p?.colors[0]); setSel(initialSelection(p)); setTried(false); setView(0); setQty(1); setTab(wantReview ? 'reviews' : 'overview');
    if (wantReview) setTimeout(() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' }), 150); else window.scrollTo(0, 0);
    if (p) rememberView(p.id);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when the product changes

  const related = useMemo(() => {
    if (!p) return [];
    const mine = new Set(p.cats || []);
    const scored = PRODUCTS.filter((x) => x.id !== p.id && x.stock !== 'out').map((x) => {
      const shared = (x.cats || []).filter((c) => mine.has(c)).length;
      return { x, score: (x.cat === p.cat ? 100 : 0) + shared * 10 + (x.brand === p.brand ? 5 : 0) };
    }).filter((r) => r.score > 0);
    scored.sort((a, b) => b.score - a.score || b.x.sold - a.x.sold);
    return scored.slice(0, 8).map((r) => r.x);
  }, [p, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentIds().filter((id) => id !== slug).map(getProduct).filter(Boolean).slice(0, 4), [slug, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const brand = p ? groupOf(p) : null; // its brand, or the category it's listed under
  const cat = p ? { slug: p.brand, name: catName(Number(p.cat)) } : null;
  // Sold in variants: until every option is chosen the page shows the product's summary ("From $X"); then the variant.
  const variable = isVariable(p);
  const chosen = variable ? findVariant(p, sel) : null;
  const missing = variable ? missingOptions(p, sel) : [];
  const at = chosen ? { ...p, price: chosen.price, was: chosen.was, discount: chosen.discount, stock: chosen.stock, stockCount: chosen.stockCount } : p;
  const out = at?.stock === 'out';
  const fee = p ? deliveryFee('delivery', [p]) : null; // its own delivery price, or the store's
  const catNames = (p?.cats || []).map((id) => catName(Number(id)));
  const used = conditionOf(p); // Buy Used: its grade, or "Used" for one filed under a Used category
  const condition = used ? (used.key === 'used' ? 'Used' : `Used · ${used.label}`) : catNames.includes('New') ? 'New' : null;
  const blurb = details?.short || p?.blurb || '';
  usePageMeta(p ? {
    title: p.name,
    description: blurb || `${p.name} from ${brand.name} at DMD World: ${money(p.price)}${p.was ? ` (was ${money(p.was)})` : ''}. ${out ? 'Currently out of stock.' : 'In stock, order online and pay on delivery in Lebanon.'}`,
    image: p.img || undefined,
    type: 'product',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku || p.id, image: p.gallery?.length ? p.gallery : undefined,
      brand: { '@type': 'Brand', name: brand.name }, category: cat.name, description: blurb || undefined,
      offers: {
        '@type': 'Offer', priceCurrency: 'USD', price: p.price.toFixed(2), url: `${location.origin}/product/${p.slug}`,
        availability: out ? 'https://schema.org/OutOfStock' : p.stock === 'low' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
        itemCondition: used ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'DMD World' },
      },
      ...(p.n > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(p.r).toFixed(1), reviewCount: p.n } } : {}),
    },
  } : { title: 'Product not found', noindex: true });
  useEffect(() => { setView(0); }, [chosen?.id]); // a newly chosen variant opens on its own photo

  if (!p) return <NotFound />;
  const descParas = details?.description?.length ? details.description : (blurb || `${p.name} from ${brand.name}, available at DMD World. Ask DMD about compatibility, condition or what's in the box.`).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const specRows = [...(details?.attributes || []).map((a) => [a.name, a.value]), ...Object.entries(p.specs), ...(details?.dimensions ? [['Dimensions', details.dimensions]] : []), ...(details?.weight ? [['Weight', `${details.weight} kg`]] : [])];
  const platformGroup = ['playstation', 'nintendo-switch', 'xbox'].includes(p.brand) ? brand.name : null;
  const sku = chosen?.sku || p.sku;
  const infoRows = [['Brand', brand.name], ['Category', cat.name], ['Availability', variable && !chosen ? (out ? 'Out of stock' : 'Choose your options') : out ? 'Out of stock' : at.stock === 'low' ? `Only ${at.stockCount} left` : 'In stock'], ...(sku ? [['SKU', sku]] : []), ...(platformGroup ? [['Platform', platformGroup]] : []), ...(condition ? [['Condition', condition]] : [])];
  const wished = isWished(p.id);
  const bundle = p.bundle?.map(getProduct).filter(Boolean);
  // The stock left after what's already in the cart: 18 in stock with 15 in the cart leaves 3 to choose from.
  const room = roomFor(p.id, chosen?.id);
  const full = !out && (!variable || chosen) && room < 1;
  const maxQty = Math.max(1, room);
  const choose = missing.length > 0 ? `Choose ${missing[0].toLowerCase()}` : null; // "Choose colour", "Choose dimensions"
  const addLabel = choose || (full ? `All ${chosen ? variantLimit(chosen) : purchaseLimit(p)} in your cart` : 'Add to cart');
  /** Adds what's chosen; with an option still missing, it says which instead. */
  const add = (opts) => {
    if (choose) { setTried(true); document.getElementById('options')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
    return addToCart(p.id, Math.min(qty, maxQty), chosen ? { variant: chosen.id } : color, opts);
  };
  const buyNow = () => { if (full) { nav('/checkout'); return; } if (add({ open: false }) !== false) nav('/checkout'); };
  const shown = withVariantImage(p, chosen); // a variant with its own photo shows it first
  const shots = shown.img ? shown.gallery || [shown.img] : ART_VIEWS;
  const video = details?.video || null; // shown after the photos, as the last thumbnail
  const onVideo = !!video && view === shots.length;
  const tabs = TABS.filter(([k]) => k !== 'specs' || specRows.length).map(([k, l]) => [k, k === 'reviews' && p.n > 0 ? `Reviews (${p.n.toLocaleString()})` : l]);
  const onTabKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : step ? (i + step + tabs.length) % tabs.length : null;
    if (to == null) return;
    e.preventDefault();
    setTab(tabs[to][0]);
    tabRefs.current[tabs[to][0]]?.focus();
  };

  return (
    <div className="container" data-catalog={catalogVersion}>
      <div className={s.head}>
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: brand.name, to: brand.to }, { label: p.name }]} />
      </div>

      <div className={s.top}>
        <div className={s.gallery}>
          <div className={s.stage}>
            {onVideo ? <ProductVideo video={video} name={p.name} /> : <ProductImage product={shown} color={color} view={view} eager className={s.stageImg} />}
            {!onVideo && at.discount > 0 && <span className={s.badge}>{dealBadge(at)}</span>}
            {!onVideo && used && <span className={`${s.badge} ${s.used}`}>{used.key === 'used' ? 'Used' : `Used · ${used.label}`}</span>}
            {!onVideo && !used && isNew(p) && !at.discount && <span className={`${s.badge} ${s.new}`}>New</span>}
            {!onVideo && shown.img && <RoomView src={shots[view] || shown.img} name={p.name} />}
          </div>
          {(shots.length > 1 || video) && (
            <ul className={s.thumbs} aria-label="Product photos and video">
              {shots.map((v, i) => (
                <li key={typeof v === 'string' ? v : i}><button type="button" className={`${s.thumb} ${view === i ? s.on : ''}`} onClick={() => setView(i)} aria-label={shown.img ? `Photo ${i + 1} of ${shots.length}` : `${v} view`} aria-pressed={view === i}><ProductImage product={shown} color={color} view={i} className={s.thumbImg} /></button></li>
              ))}
              {video && (
                <li><button type="button" className={`${s.thumb} ${s.videoThumb} ${onVideo ? s.on : ''}`} onClick={() => setView(shots.length)} aria-label="Play video" aria-pressed={onVideo}>
                  {video.type === 'youtube'
                    ? <img className={s.thumbCover} src={`https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    : <video className={s.thumbCover} src={`${video.url}#t=0.5`} muted playsInline preload="metadata" aria-hidden tabIndex={-1} />}
                  <span className={s.play} aria-hidden />
                </button></li>
              )}
            </ul>
          )}
        </div>

        <div className={s.buy}>
          <div className={s.kicker}>
            <Link to={brand.to}>{brand.name}</Link>
            <span aria-hidden>·</span><span>{cat.name}</span>
          </div>
          <h1>{p.name}</h1>
          {p.sub && <p className={s.sub}>{p.sub}</p>}
          {p.n > 0 && <a href="#reviews" className={s.rateLink} onClick={() => setTab('reviews')}><Rating value={p.r} count={p.n} /><span>Read reviews</span></a>}

          <div className={s.priceBox}>
            {variable && !chosen
              ? <span className={s.from}><small>From</small><Price price={p.price} size="lg" /></span>
              : at.was ? <DropPrice key={`${p.id}-${chosen?.id || ''}`} p={at} /> : <Price price={at.price} size="lg" />}
            <Stock p={at} />
          </div>
          {blurb && <p className={s.blurb}>{blurb}</p>}

          {used && (
            <div className={s.condition}>
              <p><b>Condition: {used.label}</b>{used.key !== 'used' && <span> · Used, sold by DMD World</span>}</p>
              <p>{used.description}</p>
              {p.conditionNote && <p className={s.condNote}>{p.conditionNote}</p>}
              <Link to="/buy-used#grades">What our condition grades mean</Link>
            </div>
          )}

          {variable && <div id="options"><OptionPicker product={p} selected={sel} onChange={(next) => { setSel(next); setTried(false); }} invalid={tried} /></div>}

          {p.colors.length > 1 && (
            <div className={s.block}>
              <h3>Colour <span>{COLORS[color]?.label}</span></h3>
              <div className={s.swatches} role="radiogroup" aria-label="Colour">
                {p.colors.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={COLORS[c].label} title={COLORS[c].label} className={`${s.sw} ${color === c ? s.on : ''}`} onClick={() => setColor(c)}><i style={{ background: COLORS[c].hex }} /></button>
                ))}
              </div>
            </div>
          )}

          {out ? (
            <div className={s.actions}>
              <NotifyMe p={p} />
              <button type="button" className={`${s.heart} ${wished ? s.hearted : ''}`} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWish(p.id)}><HeartIcon size={20} fill={wished ? 'currentColor' : 'none'} /></button>
            </div>
          ) : (
            <>
              <div className={s.actions}>
                <QtyStepper value={Math.min(qty, maxQty)} onChange={setQty} max={maxQty} label={p.name} />
                <button type="button" className="btn btn--primary btn--lg" disabled={full} aria-describedby={choose ? 'options' : undefined} onClick={() => add()}>{addLabel}</button>
                <button type="button" className={`${s.heart} ${wished ? s.hearted : ''}`} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWish(p.id)}><HeartIcon size={20} fill={wished ? 'currentColor' : 'none'} /></button>
              </div>
              <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={buyNow}>Buy now</button>
            </>
          )}

          <p className={s.deliveryNote}><TruckIcon size={17} />{out ? 'Out of stock right now. Ask DMD when more is expected.' : fee == null ? 'Delivery is arranged by DMD. Cost and timing are confirmed with you after you order.' : `${fee > 0 ? `Delivery ${money(fee)}` : 'Free delivery'} anywhere in Lebanon, or pick it up from the store for free.`}</p>
          <div className={s.ask}>
            <p className={s.askHud}>Ask before you buy</p>
            <p className={s.askText}>Compatibility, condition or stock: a person at DMD World will answer.</p>
            <div className={s.askBtns}>
              <a href={`tel:${CONTACT.tel}`}><PhoneIcon size={16} />{CONTACT.phone}</a>
              <a href={whatsAppUrl(productMessage(p, [...(chosen ? optionList(p, chosen) : Object.entries(sel)), ...(p.colors.length > 1 ? [['Colour', COLORS[color]?.label]] : []), ...(condition && used ? [['Condition', condition]] : [])]))} target="_blank" rel="noopener noreferrer" className={s.wa}><WhatsAppIcon size={16} />Ask on WhatsApp</a>
              <a href={`mailto:${CONTACT.email.toLowerCase()}?subject=${encodeURIComponent(`Question about ${p.name}`)}`}><MailIcon size={16} />Email</a>
            </div>
          </div>
        </div>
      </div>

      {bundle && (
        <section className={s.bundle} aria-labelledby="inc">
          <h2 id="inc">What's in this setup</h2>
          <ul>{bundle.map((b) => (
            <li key={b.id}><Link to={`/product/${b.slug}`}><span className={s.bThumb}><ProductImage product={b} color={b.colors[0]} /></span><span><small>{groupOf(b).name}</small><b>{b.name}</b></span><em>{money(b.price)}</em></Link></li>
          ))}</ul>
        </section>
      )}

      <section className={s.tabs} id="reviews">
        <div role="tablist" aria-label="Product information" className={s.tabList}>
          {tabs.map(([k, l], i) => (
            <button key={k} ref={(el) => { tabRefs.current[k] = el; }} type="button" role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} className={tab === k ? s.on : ''} onClick={() => setTab(k)} onKeyDown={(e) => onTabKey(e, i)}>{l}</button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'overview' && (
            <div className={s.panel}>
              <div>
                <h2>About this product</h2>
                {descParas.map((d) => <p key={d} className={s.desc}>{d}</p>)}
                {p.features.length > 0 && <><h3>Key features</h3>
                <ul className={s.features}>{p.features.map((f) => <li key={f}><CheckIcon size={16} />{f}</li>)}</ul></>}
              </div>
              <aside className={s.glance}>
                <h3>Product info</h3>
                <dl>{infoRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              </aside>
            </div>
          )}

          {tab === 'specs' && (
            <div className={s.panel}>
              <table className={s.specs}><tbody>
                <tr><th>Brand</th><td>{brand.name}</td></tr>
                <tr><th>Type</th><td>{cat?.name}</td></tr>
                {p.conn && <tr><th>Connection</th><td>{p.conn}</td></tr>}
                {specRows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
                <tr><th>Compatibility</th><td><Compat p={p} max={10} /></td></tr>
              </tbody></table>
            </div>
          )}

          {tab === 'reviews' && <Reviews product={p} open={wantReview} />}
        </div>
      </section>

      {related.length > 0 && (
        <section className={s.related} aria-labelledby="rel">
          <div className="section-head"><div><p className="eyebrow">Keep exploring</p><h2 id="rel">You might also want</h2></div>{cat && <Link to={brand.to} className="link">More {brand.name} <ArrowRight size={16} /></Link>}</div>
          <ProductGrid products={related} cols={4} />
        </section>
      )}

      {recent.length > 0 && (
        <section className={s.related} aria-labelledby="recent">
          <div className="section-head"><div><p className="eyebrow">Your history</p><h2 id="recent">Recently viewed</h2></div></div>
          <ProductGrid products={recent} cols={4} />
        </section>
      )}

      <div className={s.sticky}>
        <div><b>{p.name}</b><Price price={at.price} was={at.was} size="sm" /></div>
        {out ? <a href="#top" className="btn btn--secondary" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Sold out</a>
          : <button type="button" className="btn btn--primary" disabled={full} onClick={() => add()}>{addLabel}</button>}
      </div>
    </div>
  );
}
