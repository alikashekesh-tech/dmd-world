import { useEffect, useMemo, useRef, useState } from 'react';
import { api, changed } from '../../lib/api.js';
import { money, num } from '../../lib/format.js';
import { emptyTargets, hasTargets, targetsBody, targetsFromApi } from '../../lib/offerTargets.js';
import { Button, Field, Icon, SkeletonRows, Tabs, Toggle, Drawer, useUi } from '../../ui/kit.jsx';
import ScheduleRange, { scheduleOk } from '../../ui/ScheduleRange.jsx';
import TargetPicker from './TargetPicker.jsx';
import OfferPreview from './OfferPreview.jsx';
import '../../styles/offers.css';

const STATE = { running: 'Running', scheduled: 'Scheduled', ended: 'Ended', off: 'Off' };

/** Create or edit an offer: details, schedule (store time zone), what it covers, and a live preview of the prices. */
export default function OfferForm({ o, brands, categories, onClose }) {
  const { toast, fail } = useUi();
  const isNew = !o.id;
  const [f, setF] = useState({ name: o.name || '', label: o.label || '', type: o.discount_type || 'percent', value: o.discount_value != null ? String(o.discount_value) : '', active: o.is_active ?? true });
  const saved = useMemo(() => ({ start: o.starts_at || null, end: o.ends_at || null }), [o.starts_at, o.ends_at]);
  const [when, setWhen] = useState(saved);
  const [targets, setTargets] = useState(isNew ? emptyTargets() : null); // an existing offer's targets load with their details
  const [serverErrors, setServerErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const seq = useRef(0);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  useEffect(() => {
    if (isNew) return undefined;
    let live = true;
    api.get(`/offers/${o.id}`).then(({ data }) => live && setTargets(targetsFromApi(data.targets))).catch((e) => { fail(e); setTargets(emptyTargets()); });
    return () => { live = false; };
  }, [isNew, o.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: what saving now would do (debounced; only the latest answer is shown).
  const value = Number(f.value);
  const valueOk = f.value !== '' && value > 0 && (f.type !== 'percent' || value < 100);
  const payload = targets && JSON.stringify({ offer_id: o.id || null, name: f.name.trim() || null, discount_type: f.type, discount_value: valueOk ? value : null, starts_at: when.start, ends_at: when.end, ...targetsBody(targets) });
  useEffect(() => {
    if (!targets || !hasTargets(targets)) { seq.current++; setPreview(null); setPreviewing(false); return undefined; }
    const n = ++seq.current;
    setPreviewing(true);
    const timer = setTimeout(() => {
      api.post('/offers/preview', JSON.parse(payload)).then(({ data }) => { if (n === seq.current) setPreview(data); })
        .catch(() => {}).finally(() => { if (n === seq.current) setPreviewing(false); });
    }, 350);
    return () => clearTimeout(timer);
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = [!f.name.trim() && 'a name', !valueOk && 'the discount', targets && !hasTargets(targets) && 'what it covers', !scheduleOk(when, saved) && 'valid dates'].filter(Boolean);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name.trim(), label: f.label.trim() || null, discount_type: f.type, discount_value: value, starts_at: when.start, ends_at: when.end, is_active: f.active, ...targetsBody(targets) };
      const { data: r } = isNew ? await api.post('/offers', body) : await api.put(`/offers/${o.id}`, body);
      changed('offers');
      toast(`“${r.name}” ${isNew ? 'created' : 'saved'}: ${num(r.products_covered)} product${r.products_covered === 1 ? '' : 's'} in the shop covered`);
      onClose();
    } catch (e) {
      if (e.fields) setServerErrors({ start: e.fields.starts_at, end: e.fields.ends_at, targets: e.fields.targets || e.fields.product_ids || e.fields.brand_ids || e.fields.category_ids });
      fail(e);
    }
    setBusy(false);
  };
  const example = valueOk ? (f.type === 'percent' ? 100 * (1 - value / 100) : Math.max(0, 100 - value)) : null;
  const startsLater = when.start && new Date(when.start) > new Date();

  return (
    <Drawer className="offer-drawer" title={isNew ? 'Create offer' : `Edit “${o.name}”`} hud={isNew ? 'New offer' : `${STATE[o.state] || ''} · ${num(o.products_covered)} products in the shop`} onClose={onClose}
      footer={<>
        {missing.length > 0 && <span className="of-missing"><Icon name="info" size={14} />To save, add {missing.join(', ')}.</span>}
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" loading={busy} onClick={save} disabled={missing.length > 0 || !targets}>{isNew ? 'Create offer' : 'Save changes'}</Button>
      </>}>
      <div className="of-layout">
        <div className="of-main">
          <section className="of-sec">
            <h3 className="of-h"><span>1</span>Offer details</h3>
            <div className="grid-2">
              <Field label="Offer name" hint="Only you see this: in the offers list and reports."><input className="input" maxLength={120} value={f.name} onChange={set('name')} placeholder="e.g. Back to school headsets" autoFocus={isNew} /></Field>
              <Field label="Badge in the shop (optional)" hint="Shown on discounted products. Up to 40 characters."><input className="input" maxLength={40} value={f.label} onChange={set('label')} placeholder="e.g. School sale" /></Field>
            </div>
            <div className="grid-2">
              <Field label="Discount type">
                <Tabs label="Discount type" value={f.type} onChange={set('type')} items={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]} />
              </Field>
              <Field label={f.type === 'percent' ? 'Percentage off' : 'Amount off each product'} hint={example != null ? `A ${money(100)} product would sell for ${money(example)}.` : f.type === 'percent' ? 'Between 0 and 100.' : 'Taken off each product’s regular price.'}>
                <span className="input-affix"><span>{f.type === 'percent' ? '%' : '$'}</span><input className="input mono" inputMode="decimal" value={f.value} onChange={set('value')} placeholder={f.type === 'percent' ? '15' : '10.00'} /></span>
              </Field>
            </div>
          </section>

          <section className="of-sec">
            <h3 className="of-h"><span>2</span>Products in this offer</h3>
            <p className="of-sub">Combine products, brands and categories, or apply it to the entire store. A product covered more than once is discounted once.</p>
            {!targets ? <SkeletonRows rows={3} /> : (
              <TargetPicker value={targets} onChange={(t) => { setTargets(t); setServerErrors((x) => ({ ...x, targets: undefined })); }} brands={brands} categories={categories}
                counts={preview?.per_target} eligible={preview?.eligible} error={serverErrors.targets} />
            )}
          </section>
          <section className="of-sec">
            <h3 className="of-h"><span>3</span>Schedule</h3>
            <ScheduleRange value={when} initial={saved} serverErrors={serverErrors} onChange={(v) => { setWhen(v); setServerErrors((x) => ({ ...x, start: undefined, end: undefined })); }} />
            <Toggle label={f.active ? 'Offer is switched on' : 'Offer is switched off (it won’t run until you switch it on)'} checked={f.active} onChange={set('active')} />
          </section>

        </div>
        <aside className="of-side">
          <OfferPreview data={preview} loading={previewing} hasTargets={!!targets && hasTargets(targets)} startsLater={startsLater} />
        </aside>
      </div>
    </Drawer>
  );
}
