import { useEffect, useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useStore } from '../../context/StoreContext.jsx';
import { Rating } from '../common/bits.jsx';
import { reviews } from '../../lib/community.js';
import { SIGN_IN, authUrl } from '../../lib/authRoutes.js';
import page from '../../pages/ProductPage.module.css';
import s from './Reviews.module.css';

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const day = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={s.stars} role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= shown ? s.lit : ''} onMouseEnter={() => setHover(n)}>
          <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" aria-label={`${n} star${n > 1 ? 's' : ''}, ${WORDS[n]}`} />
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.6l-5.7 2.9 1.1-6.3L2.8 9.7l6.4-.9L12 3Z" /></svg>
        </label>
      ))}
      <span className={s.word} aria-hidden="true">{value ? `${value}/5 · ${WORDS[value]}` : hover ? WORDS[hover] : 'Tap a star'}</span>
    </div>
  );
}

function ReviewForm({ productId, onDone, autoFocus }) {
  const [f, setF] = useState({ rating: 0, title: '', text: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = f.rating >= 1 && f.title.trim().length >= 3 && f.text.trim().length >= 10;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr('');
    try { onDone(await reviews.create(productId, f)); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <form className={s.form} onSubmit={submit} noValidate id="write-review">
      <h3>Write a review</h3>
      <StarPicker value={f.rating} onChange={(rating) => setF((x) => ({ ...x, rating }))} />
      <div className="field">
        <label htmlFor="rv-title">Title</label>
        <input id="rv-title" className="input" maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="Sum it up in a few words" autoFocus={autoFocus} />
      </div>
      <div className="field">
        <label htmlFor="rv-text">Your review</label>
        <textarea id="rv-text" className={`input ${s.text}`} rows={5} maxLength={5000} value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} placeholder="What did you like? How do you use it? Anything others should know?" aria-describedby="rv-help" />
        <span id="rv-help" className={s.help}>{f.text.trim().length < 10 ? `At least 10 characters (${f.text.trim().length}/10)` : `${f.text.length}/5000`}</span>
      </div>
      {err && <p className={s.err} role="alert">{err}</p>}
      <button type="submit" className="btn btn--primary" disabled={!ready || busy}>{busy ? 'Sending…' : 'Submit review'}</button>
      <p className={s.help}>Reviews appear after DMD World checks them. If you bought this product, yours is marked Verified purchase.</p>
    </form>
  );
}

/** Approved reviews for everyone, 20 at a time, plus the signed-in buyer's own (with its status). */
export default function Reviews({ product, open }) {
  const { buyer, checking } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    setData(null); setError('');
    reviews.forProduct(product.id).then(setData).catch((e) => setError(e.message));
  }, [product.id]);
  useEffect(() => {
    if (!buyer) { setMine(null); return; }
    reviews.mine(product.id)
      .then((items) => setMine(items[0] || false)).catch(() => setMine(false));
  }, [product.id, buyer]);
  const loadMore = async () => {
    setMore(true);
    try { const next = await reviews.forProduct(product.id, data.page + 1); setData((d) => ({ ...next, items: [...d.items, ...next.items.filter((r) => !d.items.some((x) => x.id === r.id))] })); } catch (e) { setError(e.message); }
    setMore(false);
  };
  useEffect(() => { if (open && buyer && mine === false) setTimeout(() => document.getElementById('write-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }, [open, buyer, mine]);

  if (error) return <div className={page.panel}><p className={s.err}>{error}</p></div>;
  if (!data) return <div className={page.panel}><p className={s.help} role="status">Loading reviews…</p></div>;
  const max = Math.max(1, ...data.breakdown.map((b) => b.count));
  const signInUrl = authUrl(SIGN_IN, `/product/${product.slug}?review=1`);
  return (
    <div className={`${page.panel} ${page.reviewPanel}`}>
      <div className={s.side}>
        <div className={page.summary}>
          {data.count ? (
            <>
              <div className={page.big}><strong>{data.average.toFixed(1)}</strong><Rating value={data.average} size={16} showValue={false} /><span>{data.count} review{data.count === 1 ? '' : 's'}{data.verified ? ` · ${data.verified} verified` : ''}</span></div>
              <ul className={page.bars}>{data.breakdown.map((b) => <li key={b.stars}><span>{b.stars}★</span><i><b style={{ width: `${(b.count / max) * 100}%` }} /></i><em>{b.count}</em></li>)}</ul>
            </>
          ) : (
            <div className={page.big}><strong>–</strong><span>No reviews yet. Bought it? Be the first to say what you think.</span></div>
          )}
        </div>
        {checking ? null : !buyer ? (
          <div className={s.prompt}>
            <b>Share your thoughts</b>
            <p>Sign in to review this product. Reviews from buyers are marked Verified purchase.</p>
            <Link to={signInUrl} className="btn btn--secondary btn--block">Sign in to write a review</Link>
          </div>
        ) : mine === null ? null : mine ? (
          <div className={s.prompt}>
            <b>Your review</b>
            <Rating value={mine.rating} size={14} showValue={false} />
            {mine.title && <strong className={s.mineTitle}>{mine.title}</strong>}
            <span className={`${s.state} ${s[mine.status]}`}>{mine.status === 'pending' ? 'Pending approval' : mine.status === 'published' ? 'Published' : 'Not published'}</span>
            <Link to="/account?tab=reviews" className="link">All my reviews</Link>
          </div>
        ) : (
          <ReviewForm productId={product.id} autoFocus={open} onDone={(r) => setMine(r)} />
        )}
      </div>
      {data.count ? (
        <ul className={page.reviews}>{data.items.map((r) => (
          <li key={r.id}>
            <div className={page.rHead}><Rating value={r.rating} size={14} showValue={false} />{r.title && <b>{r.title}</b>}</div>
            <p>{r.text}</p>
            <small>{r.name}{r.verified && <span className={s.verified}>Verified purchase</span>} · {day(r.date)}</small>
          </li>
        ))}
          {data.more && <li><button type="button" className="btn btn--secondary" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Show more reviews'}</button></li>}
        </ul>
      ) : <div />}
    </div>
  );
}
