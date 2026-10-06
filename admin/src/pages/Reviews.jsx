import { useEffect, useMemo, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { ago, num } from '../lib/format.js';
import { Button, Chip, Empty, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, useUi } from '../ui/kit.jsx';
import { Stars } from './Dashboard.jsx';

const TABS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Published'], ['rejected', 'Rejected'], ['spam', 'Spam']];
const VERB = { approved: 'Approved', pending: 'Unpublished', rejected: 'Rejected', spam: 'Marked as spam' };

/* Only approved reviews show in the shop and count in ratings. New and edited reviews wait here. */
export default function Reviews({ query }) {
  const { toast, fail, confirm } = useUi();
  const status = query.get('status') || 'all';
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 300);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams({ page: query.get('page') || '1' });
  if (status !== 'all') params.set('status', status);
  if (query.get('q')) params.set('q', query.get('q'));
  const { data: raw, error, loading } = useApi(`/reviews?${params}`);
  const data = useMemo(() => (raw ? paged(raw) : null), [raw]);
  const [busy, setBusy] = useState(null);
  const c = raw?.meta?.counts || {};

  const set = async (r, next) => {
    setBusy(r.id);
    try {
      await api.put(`/reviews/${r.id}`, { status: next });
      changed('reviews');
      toast(`${VERB[next]} ${r.author}’s review`, { undo: async () => { await api.put(`/reviews/${r.id}`, { status: r.status }).catch(fail); changed('reviews'); } });
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const destroy = async (r) => {
    if (!(await confirm({ title: 'Delete this review for good?', text: `${r.author}’s ${r.rating}★ review of ${r.product?.name || 'a product'} is removed permanently. This can’t be undone.`, confirmLabel: 'Delete permanently', danger: true }))) return;
    setBusy(r.id);
    try { await api.del(`/reviews/${r.id}`); changed('reviews'); toast('Review deleted'); } catch (e) { fail(e); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className={`led ${c.pending ? 'amber pulse' : 'green'}`} />Sales</>} title="Reviews"
        text={c.pending ? `${num(c.pending)} review${c.pending === 1 ? ' is' : 's are'} pending. They stay hidden from the shop until you approve them.` : 'What buyers say about your products.'} />
      <div className="toolbar">
        <Tabs label="Review status" value={status} onChange={(v) => setQuery({ status: v === 'all' ? null : v, page: null })} items={TABS.map(([v, l]) => ({ value: v, label: l, count: v === 'all' ? c.all : c[v], led: v === 'pending' && c.pending ? 'amber' : undefined }))} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search reviews, authors or products" />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : !data?.items.length ? (
          <Empty icon="star" title={status === 'pending' ? 'Nothing pending' : 'No reviews here'}>{status === 'pending' ? 'Every review has been dealt with.' : 'Reviews appear here as buyers write them.'}</Empty>
        ) : (
          <ul className="ledger">
            {data.items.map((r) => (
              <li key={r.id} className={`review ${r.status === 'pending' ? 'held' : ''}`}>
                <a href={r.product ? `#/products/${r.product.id}` : undefined} aria-label={r.product?.name}><Thumb src={r.product?.image} size="lg" /></a>
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Stars n={r.rating} />
                    {r.status === 'pending' && <Chip tone="amber" led>Pending</Chip>}
                    {r.status === 'approved' && <Chip tone="green">Published</Chip>}
                    {r.status === 'rejected' && <Chip tone="muted">Rejected</Chip>}
                    {r.status === 'spam' && <Chip tone="coral">Spam</Chip>}
                    {r.verified_purchase && <Chip tone="blue">Verified purchase</Chip>}
                  </div>
                  {r.title && <b style={{ fontSize: 14 }}>{r.title}</b>}
                  <p className="review-text">{r.body}</p>
                  <small className="muted">
                    {r.customer ? <a className="linkish" href={`#/customers/${r.customer.id}`}>{r.author}</a> : r.author}{r.author_email ? ` (${r.author_email})` : ''} on {r.product ? <a className="linkish" href={`#/products/${r.product.id}`}>{r.product.name}</a> : 'a removed product'} · {ago(r.created_at)}
                    {r.moderated_by && ` · ${VERB[r.status]?.toLowerCase() || r.status} by ${r.moderated_by} ${ago(r.moderated_at)}`}
                  </small>
                </div>
                <div className="review-actions">
                  {r.status !== 'approved' && <Button size="sm" variant="primary" icon="check" loading={busy === r.id} onClick={() => set(r, 'approved')}>Approve</Button>}
                  {r.status === 'approved' && <Button size="sm" icon="eyeOff" loading={busy === r.id} onClick={() => set(r, 'pending')}>Unpublish</Button>}
                  {['pending', 'approved'].includes(r.status) && <Button size="sm" variant="quiet" icon="close" disabled={busy === r.id} onClick={() => set(r, 'rejected')}>Reject</Button>}
                  {r.status !== 'spam' && <Button size="sm" variant="quiet" icon="alert" disabled={busy === r.id} onClick={() => set(r, 'spam')}>Spam</Button>}
                  <Button size="sm" variant="quiet" icon="trash" disabled={busy === r.id} onClick={() => destroy(r)} aria-label="Delete for good" title="Delete for good" />
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
