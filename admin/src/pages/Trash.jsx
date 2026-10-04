import { useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, day, money, num } from '../lib/format.js';
import { Button, Empty, Notice, PageHeader, SkeletonRows, Tabs, Thumb, useUi } from '../ui/kit.jsx';
import { Stars } from './Dashboard.jsx';

/* Everything moved to the trash, from every section. Restoring is one click; permanent deletion asks first. */
const KIND = {
  products: { label: 'Products', restore: (x) => api.post(`/products/${x.id}/restore`, { status: 'draft' }), del: (x) => api.del(`/products/${x.id}`), name: (x) => x.name, restored: 'as a draft' },
  orders: { label: 'Orders', restore: (x) => api.post(`/orders/${x.id}/restore`, { status: 'on-hold' }), del: (x) => api.del(`/orders/${x.id}`), name: (x) => `order #${x.number}`, restored: 'as On hold' },
  reviews: { label: 'Reviews', restore: (x) => api.put(`/reviews/${x.id}`, { status: 'untrash' }), del: (x) => api.del(`/reviews/${x.id}`), name: (x) => `${x.reviewer}’s review`, restored: '' },
  coupons: { label: 'Coupons', restore: (x) => api.post(`/coupons/${x.id}/restore`), del: (x) => api.del(`/coupons/${x.id}`), name: (x) => x.code.toUpperCase(), restored: '(disabled until you switch it on)' },
};

export default function Trash({ query }) {
  const { toast, fail, confirm } = useUi();
  const { data, error } = useApi('/trash');
  const [busy, setBusy] = useState(null);
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, data?.[k]?.length || 0]));
  const tab = query.get('tab') || Object.keys(KIND).find((k) => counts[k]) || 'products';
  const list = data?.[tab] || [];
  const K = KIND[tab];

  const restore = async (x) => {
    setBusy(x.id);
    try { await K.restore(x); changed('trash'); toast(`Restored ${K.name(x)} ${K.restored}`.trim()); } catch (e) { fail(e); }
    setBusy(null);
  };
  const destroy = async (x) => {
    if (!(await confirm({ title: `Delete ${K.name(x)} for good?`, text: 'This removes it from WooCommerce permanently. It can’t be restored.', confirmLabel: 'Delete permanently', danger: true }))) return;
    setBusy(x.id);
    try { await K.del(x); changed('trash'); toast(`Deleted ${K.name(x)} permanently`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const emptyAll = async () => {
    if (!(await confirm({ title: `Empty ${list.length} ${K.label.toLowerCase()} from the trash?`, text: 'Every item in this tab is deleted from WooCommerce permanently. None of it can be restored.', confirmLabel: 'Delete all permanently', danger: true, typeToConfirm: 'empty trash' }))) return;
    setBusy('all');
    let done = 0;
    for (const x of list) { try { await K.del(x); done++; } catch (e) { fail(e); break; } }
    changed('trash');
    toast(`Deleted ${done} ${K.label.toLowerCase()} permanently`);
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className="led" />Site</>} title="Trash" text="Products, orders, reviews and coupons you removed. They stay out of the shop and reports until you restore or delete them."
        actions={list.length > 0 && <Button variant="danger" icon="trash" loading={busy === 'all'} onClick={emptyAll}>Empty {K.label.toLowerCase()}</Button>} />
      <div className="toolbar"><Tabs label="Kind" value={tab} onChange={(v) => setQuery({ tab: v })} items={Object.entries(KIND).map(([k, v]) => ({ value: k, label: v.label, count: data ? counts[k] : undefined }))} /></div>
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      <div className="surface">
        {!data ? <SkeletonRows /> : !list.length ? <Empty icon="trash" title={`No ${K.label.toLowerCase()} in the trash`}>Things you delete land here first, so nothing disappears by accident.</Empty> : (
          <table className="table cards">
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td>
                    {tab === 'products' && <div className="cell-main"><Thumb src={x.image} /><div style={{ minWidth: 0 }}><b>{x.name}</b><small>{x.sku || `ID ${x.id}`} · {money(x.price)} · trashed {ago(x.date_modified)}</small></div></div>}
                    {tab === 'orders' && <div className="cell-main"><div style={{ minWidth: 0 }}><b>#{x.number} · {x.name}</b><small>{money(x.total)} · {num(x.items.length)} item{x.items.length === 1 ? '' : 's'} · placed {day(x.date_created)}</small></div></div>}
                    {tab === 'reviews' && <div className="stack" style={{ gap: 4 }}><span className="row" style={{ gap: 8 }}><Stars n={x.rating} /><b style={{ fontSize: 13 }}>{x.reviewer}</b><span className="muted" style={{ fontSize: 12 }}>on {x.product_name}</span></span><span className="clamp1 t2" style={{ fontSize: 13 }}>{x.review}</span></div>}
                    {tab === 'coupons' && <div className="cell-main"><span className="coupon-code">{x.code.toUpperCase()}</span><small>{x.discount_type === 'percent' ? `${Number(x.amount)}% off` : `${money(x.amount)} off`} · used {num(x.usage_count)}×</small></div>}
                  </td>
                  <td className="shrink">
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="sm" icon="undo" loading={busy === x.id} disabled={busy === 'all'} onClick={() => restore(x)}>Restore</Button>
                      <Button size="sm" variant="quiet" icon="trash" disabled={busy === x.id || busy === 'all'} onClick={() => destroy(x)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
