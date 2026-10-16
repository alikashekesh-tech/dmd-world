import { useEffect, useMemo, useState } from 'react';
import { api, changed } from '../../lib/api.js';
import { Button, Field, Icon, Toggle, useUi } from '../../ui/kit.jsx';
import DateTimeField, { whenLabel, zoneLabel } from '../../ui/DateTimeField.jsx';
import ImageDrop from './ImageDrop.jsx';
import BannerPreview from './BannerPreview.jsx';

/* Same rules as the server (backend/app/Http/Requests/Admin/BannerRequest.php), checked as the owner types. */
const LINK = /^(\/(?!\/)\S*|https:\/\/\S+)$/;
const IMAGE = /^(\/storage\/[A-Za-z0-9/_.-]+|https:\/\/\S+)$/;
const LIMIT = { title: 120, text: 300, link_label: 40 };
const LINKS = [['All products', '/shop'], ['On sale', '/shop?on_sale=1'], ['Categories', '/categories'], ['Brands', '/brands'], ['Contact', '/contact']];
const OVERLAYS = [['none', 'None', 'The image as it is. For images with a calm, dark area behind the text.'], ['soft', 'Soft', 'A light shade on the text side. Right for most photos.'], ['strong', 'Strong', 'A deep shade, for busy or bright images.']];

const at = (days, h = 9, m = 0, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
const nextMonday = () => { const d = new Date(); return at(((8 - d.getDay()) % 7) || 7); };
const monthEnd = (from = new Date()) => new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 45);
const span = (a, b) => { const days = Math.round((b - a) / 864e5); return days >= 2 ? `${days} days` : `${Math.max(1, Math.round((b - a) / 36e5))} hours`; };

function blank(b) {
  return {
    placement: b.placement || 'home', title: b.title || '', text: b.text || '', link_url: b.link_url || '', link_label: b.link_label || '',
    image_url: b.image_url || '', image_mobile_url: b.image_mobile_url || '', focal_point: b.focal_point || null, overlay: b.overlay || 'soft',
    is_active: b.is_active ?? true, starts_at: b.starts_at || null, ends_at: b.ends_at || null,
  };
}

function check(f) {
  const e = {};
  const title = f.title.trim();
  if (title.length < 2) e.title = title ? 'Use at least 2 characters.' : 'Give the banner a title.';
  const url = f.link_url.trim(); const label = f.link_label.trim();
  if (url && !LINK.test(url)) e.link_url = 'Link to a page of the store (starting with /) or a secure https:// address.';
  if (url && !label) e.link_label = 'Say what the button does, e.g. “Shop the sale”.';
  if (!url && label && f.placement === 'home') e.link_url = 'Add where the button goes, or clear the button text.';
  if (f.placement === 'home') {
    if (f.image_url.trim() && !IMAGE.test(f.image_url.trim())) e.image_url = 'Upload the image, or use a secure https:// address.';
    if (f.image_mobile_url.trim() && !IMAGE.test(f.image_mobile_url.trim())) e.image_mobile_url = 'Upload the image, or use a secure https:// address.';
  }
  if (f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) e.ends_at = 'The end must be after the start.';
  return e;
}

/** What the schedule means, in words. */
function scheduleText(f) {
  const now = new Date(); const s = f.starts_at && new Date(f.starts_at); const e = f.ends_at && new Date(f.ends_at);
  if (!f.is_active) return { tone: 'muted', text: 'Switched off: it won’t show until you switch it on.' };
  if (e && e <= now) return { tone: 'amber', text: `Ended ${whenLabel(f.ends_at)}. Move the end date to show it again.` };
  const from = s && s > now ? `Starts ${whenLabel(f.starts_at)}` : 'Shows right away';
  const to = e ? `ends ${whenLabel(f.ends_at)} (${span(s && s > now ? s : now, e)})` : 'stays until you switch it off';
  return { tone: s && s > now ? 'blue' : 'green', text: `${from} and ${to}.` };
}

function Counter({ value, max }) {
  const n = value.length;
  return <span className={`be-count ${n > max * 0.9 ? 'warn' : ''}`}>{n}/{max}</span>;
}

export default function BannerEditor({ banner, onClose }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !banner.id;
  const initial = useMemo(() => blank(banner), [banner]);
  const [f, setF] = useState(initial);
  const [device, setDevice] = useState('desktop');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [server, setServer] = useState({});
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v })); setServer((s) => ({ ...s, [k]: undefined })); };
  const errors = { ...check(f), ...Object.fromEntries(Object.entries(server).filter(([, v]) => v)) };
  const show = (k) => (tried || server[k] ? errors[k] : undefined);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const home = f.placement === 'home';
  const sched = scheduleText(f);

  const close = async (saved = false) => {
    if (!saved && dirty && !(await confirm({ title: 'Discard your changes?', text: 'What you changed in this banner won’t be saved.', confirmLabel: 'Discard', danger: true }))) return;
    onClose(saved);
  };
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal, .dtf-pop')) close(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const save = async () => {
    setTried(true);
    if (Object.keys(check(f)).length) { document.querySelector('.be-form .err')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    setBusy(true);
    try {
      const body = {
        placement: f.placement, title: f.title.trim(), text: home ? (f.text.trim() || null) : null,
        link_url: f.link_url.trim() || null, link_label: f.link_url.trim() ? (f.link_label.trim() || null) : null,
        image_url: home ? (f.image_url.trim() || null) : null, image_mobile_url: home ? (f.image_mobile_url.trim() || null) : null,
        focal_point: home && f.image_url.trim() ? f.focal_point : null, overlay: home ? f.overlay : null,
        is_active: f.is_active, starts_at: f.starts_at, ends_at: f.ends_at,
      };
      if (isNew) await api.post('/banners', body); else await api.put(`/banners/${banner.id}`, body);
      changed('homepage');
      toast(isNew ? 'Banner added. Visitors see it on their next page load.' : 'Banner saved');
      onClose(true);
    } catch (e) {
      if (e.fields) setServer(e.fields);
      fail(e);
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${banner.title}”?`, text: 'It disappears from the shop straight away. This can’t be undone.', confirmLabel: 'Delete banner', danger: true }))) return;
    setBusy(true);
    try { await api.del(`/banners/${banner.id}`); changed('homepage'); toast('Banner deleted'); onClose(true); } catch (e) { fail(e); }
    setBusy(false);
  };

  const startPresets = [{ label: 'Now', at: () => null }, { label: 'Tomorrow 9 AM', at: () => at(1) }, { label: 'Next Monday', at: nextMonday }, { label: 'Next month', at: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1, 9); } }];
  const base = () => (f.starts_at && new Date(f.starts_at) > new Date() ? new Date(f.starts_at) : new Date());
  const endPresets = [{ label: '3 days', at: () => at(3, 23, 45, base()) }, { label: '1 week', at: () => at(7, 23, 45, base()) }, { label: '2 weeks', at: () => at(14, 23, 45, base()) }, { label: 'End of month', at: () => monthEnd(base()) }, { label: 'No end', at: () => null }];
  const count = Object.keys(check(f)).length;

  return (
    <>
      <div className="scrim" onClick={() => close()} />
      <div className="be" role="dialog" aria-modal="true" aria-label={isNew ? 'Add banner' : 'Edit banner'}>
        <header className="be-head">
          <div className="grow">
            <span className="hud"><span className="led blue" />{isNew ? 'New banner' : 'Edit banner'}</span>
            <h2 className="clamp1">{f.title.trim() || (isNew ? 'Add a banner' : 'Untitled banner')}</h2>
          </div>
          <Button variant="quiet" icon="close" onClick={() => close()} aria-label="Close" />
        </header>

        <div className="be-main">
          <div className="be-form">
            <div className="seg" role="radiogroup" aria-label="Where it shows">
              {[['home', 'image', 'Home page banner', 'A large banner in the “Promo banners” section'], ['announcement', 'bell', 'Announcement line', 'One short line at the top of every page']].map(([v, ic, t, d]) => (
                <button key={v} type="button" role="radio" aria-checked={f.placement === v} className={`seg-opt ${f.placement === v ? 'on' : ''}`} onClick={() => set('placement')(v)}>
                  <Icon name={ic} size={18} /><span><b>{t}</b><small>{d}</small></span>
                </button>
              ))}
            </div>

            <section className="be-sec">
              <h3>Message</h3>
              <Field label={<>Title <Counter value={f.title} max={LIMIT.title} /></>} error={show('title')} hint={home ? 'Short and specific: “Up to 30% off headsets”.' : 'One short line, e.g. “Free pickup from Hamra this week”.'}>
                <input className="input" maxLength={LIMIT.title} value={f.title} onChange={set('title')} placeholder={home ? 'e.g. Back to school deals' : 'e.g. Free pickup from Hamra'} autoFocus={isNew} />
              </Field>
              {home && (
                <Field label={<>Description <Counter value={f.text} max={LIMIT.text} /></>} hint="Optional. One or two lines; longer text is cut off on phones.">
                  <textarea className="textarea" rows={3} maxLength={LIMIT.text} value={f.text} onChange={set('text')} placeholder="e.g. Controllers, headsets and games for every platform." />
                </Field>
              )}
            </section>

            <section className="be-sec">
              <h3>{home ? 'Button' : 'Link'}</h3>
              <div className={home ? 'grid-2' : ''}>
                {home && (
                  <Field label={<>Button text <Counter value={f.link_label} max={LIMIT.link_label} /></>} error={show('link_label')}>
                    <input className="input" maxLength={LIMIT.link_label} value={f.link_label} onChange={set('link_label')} placeholder="e.g. Shop the sale" />
                  </Field>
                )}
                <Field label={home ? 'Button link' : 'Link (optional)'} error={show('link_url')} hint={home ? 'Leave both empty for a banner without a button.' : 'The whole line becomes a link.'}>
                  <input className="input mono" value={f.link_url} onChange={(e) => { set('link_url')(e); if (!home) setF((x) => ({ ...x, link_label: e.target.value.trim() ? 'Open' : '' })); }} placeholder="/shop?on_sale=1 or https://…" />
                </Field>
              </div>
              <div className="be-links">
                <span className="muted">Quick links:</span>
                {LINKS.map(([t, u]) => (
                  <button key={u} type="button" className={`dtf-chip ${f.link_url === u ? 'on' : ''}`} onClick={() => setF((x) => ({ ...x, link_url: u, link_label: x.link_label || (home ? (u.includes('on_sale') ? 'Shop the sale' : 'Shop now') : 'Open') }))}>{t}</button>
                ))}
              </div>
            </section>

            {home && (
              <section className="be-sec">
                <h3>Image</h3>
                <Field label="Desktop image" error={show('image_url')} hint="Best at 2100 × 800 px or larger (21:8). Click the image to choose what stays in view when it is cropped.">
                  <ImageDrop value={f.image_url} onChange={set('image_url')} focal={f.focal_point} onFocal={set('focal_point')} aspect="21 / 8" />
                </Field>
                <div className="be-two">
                  <Field label="Phone image (optional)" error={show('image_mobile_url')} hint="A taller crop, best 1080 × 1350 px (4:5). Without one, the desktop image is cropped to fit.">
                    <ImageDrop value={f.image_mobile_url} onChange={set('image_mobile_url')} aspect="4 / 5" compact hint="Optional · 4:5" />
                  </Field>
                  <div className="field">
                    <span className="label">Shade behind the text</span>
                    <div className="be-overlays" role="radiogroup" aria-label="Shade behind the text">
                      {OVERLAYS.map(([v, t, d]) => (
                        <button key={v} type="button" role="radio" aria-checked={f.overlay === v} className={`be-ov ${f.overlay === v ? 'on' : ''}`} onClick={() => set('overlay')(v)} disabled={!f.image_url}>
                          <span className={`be-ov-sw ov-${v}`} aria-hidden="true" /><span><b>{t}</b><small>{d}</small></span>
                        </button>
                      ))}
                    </div>
                    {!f.image_url && <span className="hint">Without an image the banner uses the store’s navy background.</span>}
                  </div>
                </div>
              </section>
            )}

            <section className="be-sec">
              <h3>Schedule</h3>
              <div className="grid-2">
                <DateTimeField label="Starts" value={f.starts_at} onChange={set('starts_at')} presets={startPresets} emptyLabel="Right away" error={show('starts_at')} />
                <DateTimeField label="Ends" value={f.ends_at} onChange={set('ends_at')} presets={endPresets} emptyLabel="No end date" min={f.starts_at || undefined} defaultMinutes={23 * 60 + 45} error={show('ends_at')} />
              </div>
              <div className={`be-sched ${sched.tone}`}><Icon name={sched.tone === 'amber' ? 'alert' : 'clock'} size={15} /><span>{sched.text}</span></div>
              <p className="muted" style={{ fontSize: 12 }}>Times are in your time zone, {zoneLabel()}.</p>
              <Toggle label={f.is_active ? 'Switched on' : 'Switched off'} checked={f.is_active} onChange={set('is_active')} />
            </section>
          </div>

          <aside className="be-preview">
            <div className="be-preview-head">
              <span className="label">Live preview</span>
              <div className="tabs" role="tablist" aria-label="Preview size">
                {[['desktop', 'Desktop'], ['mobile', 'Phone']].map(([v, t]) => <button key={v} type="button" role="tab" aria-selected={device === v} className={`tab ${device === v ? 'on' : ''}`} onClick={() => setDevice(v)}>{t}</button>)}
              </div>
            </div>
            <div className={`be-stage ${device}`}><BannerPreview banner={f} device={device} /></div>
            <p className="muted" style={{ fontSize: 12 }}>{home ? 'Shown at the storefront’s real size, scaled to fit. With two or three banners running they sit side by side; with more, visitors swipe through them.' : 'The announcement replaces the left side of the top bar on every page.'}</p>
          </aside>
        </div>

        <footer className="be-foot">
          {!isNew && <Button variant="danger" icon="trash" onClick={remove} disabled={busy}>Delete</Button>}
          <span className="grow" />
          {tried && count > 0 && <span className="be-errs"><Icon name="alert" size={14} />{count === 1 ? '1 thing to fix' : `${count} things to fix`}</span>}
          <Button variant="quiet" onClick={() => close()}>Cancel</Button>
          <Button variant="primary" icon="check" loading={busy} onClick={save}>{isNew ? 'Add banner' : 'Save changes'}</Button>
        </footer>
      </div>
    </>
  );
}
