import { useEffect, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, safeHref } from '../lib/format.js';
import { Button, Empty, Icon, Notice, PageHeader, SkeletonRows, Tabs, useUi } from '../ui/kit.jsx';

const KINDS = [['all', 'All'], ['order', 'Orders'], ['message', 'Messages'], ['stock', 'Stock'], ['review', 'Reviews']];
const ICON = { order: 'receipt', message: 'chat', stock: 'layers', review: 'star' };
const TONE = { danger: 'coral', warn: 'amber', info: 'blue' };
function bucket(at) {
  if (!at) return 'Earlier';
  const d = new Date(at); const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return 'Today';
  if (d >= new Date(today.getTime() - 864e5)) return 'Yesterday';
  return 'Earlier';
}

/* Computed from the store (new orders, late orders, messages, stock, reviews). Opening this page marks them seen. */
export default function Notifications({ query }) {
  const { fail } = useUi();
  const kind = query.get('kind') || 'all';
  const { data, error, setData } = useApi('/notifications', { live: false });
  const marked = useRef(false);
  const [gone, setGone] = useState([]);
  useEffect(() => {
    if (!data || marked.current) return;
    marked.current = true;
    api.post('/notifications/seen').then(() => changed('notifications')).catch(() => {});
  }, [data]);
  const dismiss = async (n) => {
    setGone((g) => [...g, n.id]);
    try { await api.post(`/notifications/${encodeURIComponent(n.id)}/dismiss`); changed('notifications'); } catch (e) { setGone((g) => g.filter((x) => x !== n.id)); fail(e); }
  };
  const all = (data?.items || []).filter((n) => !gone.includes(n.id));
  const items = all.filter((n) => kind === 'all' || n.kind === kind);
  const groups = ['Today', 'Yesterday', 'Earlier'].map((g) => [g, items.filter((n) => bucket(n.at) === g)]).filter(([, l]) => l.length);
  const count = (k) => all.filter((n) => k === 'all' || n.kind === k).length;

  return (
    <>
      <PageHeader hud={<><span className={`led ${data?.unseen ? 'coral pulse' : 'green'}`} />Site</>} title="Notifications"
        text={data ? (data.unseen ? `${data.unseen} new since you last looked.` : 'Nothing new since you last looked.') : 'What happened in the store.'}
        actions={<Button variant="quiet" icon="refresh" onClick={() => api.get('/notifications').then((r) => { setData(r); setGone([]); }).catch(fail)}>Refresh</Button>} />
      <div className="toolbar"><Tabs label="Kind" value={kind} onChange={(v) => setQuery({ kind: v === 'all' ? null : v })} items={KINDS.map(([v, l]) => ({ value: v, label: l, count: data ? count(v) : undefined }))} /></div>
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      {!data ? <div className="surface"><SkeletonRows /></div> : !items.length ? (
        <div className="surface"><Empty icon="bell" title="All quiet">Nothing to show here right now.</Empty></div>
      ) : (
        <div className="stack">
          {groups.map(([g, list]) => (
            <section key={g} className="surface">
              <div className="surface-head"><span className="hud">{g}</span><span className="hud">{list.length}</span></div>
              <ul className="ledger">
                {list.map((n) => (
                  <li key={n.id} className={`note-item ${n.unseen ? 'unseen' : ''}`}>
                    <a href={safeHref(n.link) || '#/notifications'} className="note-link">
                      <span className={`q-ic ${TONE[n.level]}`}><Icon name={ICON[n.kind] || 'bell'} size={16} /></span>
                      <span style={{ minWidth: 0 }}><b className="clamp1">{n.title}</b>{n.text && <small className="clamp1">{n.text}</small>}</span>
                      <small className="mono muted" style={{ whiteSpace: 'nowrap' }}>{n.at ? ago(n.at) : ''}</small>
                    </a>
                    <Button size="sm" variant="quiet" icon="close" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(n)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
