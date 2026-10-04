import { useEffect, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, num } from '../lib/format.js';
import { Button, Chip, Empty, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, useUi } from '../ui/kit.jsx';
import { Stars } from './Dashboard.jsx';

const TABS = [['all', 'All'], ['hold', 'Pending'], ['approved', 'Published'], ['spam', 'Spam'], ['trash', 'Trash']];
const VERB = { approved: 'Approved', hold: 'Unpublished', spam: 'Marked as spam', untrash: 'Restored', unspam: 'Moved out of spam' };

export default function Reviews({ query }) {
  const { toast, fail, confirm } = useUi();
  const status = query.get('status') || 'all';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ status, page: query.get('page') || '1' });
  if (query.get('q')) params.set('search', query.get('q'));
  const { data, error, loading } = useApi(`/reviews?${params}`);
  const [busy, setBusy] = useState(null);
  const c = data?.counts || {};

  const set = async (r, next) => {
    setBusy(r.id);
    try { await api.put(`/reviews/${r.id}`, { status: next }); changed('reviews'); toast(`${VERB[next]} ${r.reviewer}’s review`, next === 'approved' || next === 'hold' ? { undo: async () => { await api.put(`/reviews/${r.id}`, { status: r.status }).catch(fail); changed('reviews'); } } : undefined); } catch (e) { fail(e); }
    setBusy(null);
  };
  const trash = async (r) => {
    setBusy(r.id);
    try { await api.post(`/reviews/${r.id}/trash`); changed('reviews'); toast(`Moved ${r.reviewer}’s review to the trash`, { undo: async () => { await api.put(`/reviews/${r.id}`, { status: 'untrash' }).catch(fail); changed('reviews'); } }); } catch (e) { fail(e); }
    setBusy(null);
  };
  const destroy = async (r) => {
    if (!(await confirm({ title: 'Delete this review for good?', text: `${r.reviewer}’s ${r.rating}★ review of ${r.product_name} is removed permanently. This can’t be undone.`, confirmLabel: 'Delete permanently', danger: true }))) return;
    setBusy(r.id);
    try { await api.del(`/reviews/${r.id}`); changed('reviews'); toast('Review deleted'); } catch (e) { fail(e); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className={`led ${c.hold ? 'amber pulse' : 'green'}`} />Sales</>} title="Reviews"
        text={c.hold ? `${num(c.hold)} review${c.hold === 1 ? ' is' : 's are'} pending. They stay hidden from the shop until you approve them.` : 'What buyers say about your products.'} />
      <div className="toolbar">
        <Tabs label="Review status" value={status} onChange={(v) => setQuery({ status: v === 'all' ? null : v, page: null })} items={TABS.map(([v, l]) => ({ value: v, label: l, count: v === 'all' ? undefined : c[v], led: v === 'hold' && c.hold ? 'amber' : undefined }))} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search review text" />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? (
          <Empty icon="star" title={status === 'hold' ? 'Nothing pending' : 'No reviews here'}>{status === 'hold' ? 'Every review has been dealt with.' : 'Reviews appear here as buyers write them.'}</Empty>
        ) : (
          <ul className="ledger">
            {data.items.map((r) => (
              <li key={r.id} className={`review ${r.status === 'hold' ? 'held' : ''}`}>
                <a href={`#/products/${r.product_id}`} aria-label={r.product_name}><Thumb src={r.image} size="lg" /></a>
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Stars n={r.rating} />
                    {r.status === 'hold' && <Chip tone="amber" led>Pending</Chip>}
                    {r.status === 'approved' && <Chip tone="green">Published</Chip>}
                    {r.status === 'spam' && <Chip tone="coral">Spam</Chip>}
                    {r.status === 'trash' && <Chip tone="muted">Trash</Chip>}
                    {r.verified && <Chip tone="blue">Verified purchase</Chip>}
                  </div>
                  <p className="review-text">{r.review || <span className="muted">No written review.</span>}</p>
                  <small className="muted">{r.reviewer}{r.reviewer_email ? ` (${r.reviewer_email})` : ''} on <a className="linkish" href={`#/products/${r.product_id}`}>{r.product_name}</a> · {ago(r.date_created)}</small>
                </div>
                <div className="review-actions">
                  {r.status === 'hold' && <Button size="sm" variant="primary" icon="check" loading={busy === r.id} onClick={() => set(r, 'approved')}>Approve</Button>}
                  {r.status === 'approved' && <Button size="sm" icon="eyeOff" loading={busy === r.id} onClick={() => set(r, 'hold')}>Unpublish</Button>}
                  {r.status === 'spam' && <Button size="sm" icon="undo" loading={busy === r.id} onClick={() => set(r, 'unspam')}>Not spam</Button>}
                  {r.status === 'trash' && <Button size="sm" icon="undo" loading={busy === r.id} onClick={() => set(r, 'untrash')}>Restore</Button>}
                  {['hold', 'approved'].includes(r.status) && <Button size="sm" variant="quiet" icon="alert" disabled={busy === r.id} onClick={() => set(r, 'spam')}>Spam</Button>}
                  {r.status !== 'trash' ? <Button size="sm" variant="quiet" icon="trash" disabled={busy === r.id} onClick={() => trash(r)} aria-label="Move to trash" /> : <Button size="sm" variant="danger" icon="trash" disabled={busy === r.id} onClick={() => destroy(r)}>Delete</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="reviews" onPage={(n) => setQuery({ page: n })} />}
      </div>
    </>
  );
}
