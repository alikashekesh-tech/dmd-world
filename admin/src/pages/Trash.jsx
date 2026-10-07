import { useState } from 'react';
import { api, changed } from '../lib/api.js';
import { setQuery } from '../lib/router.jsx';
import { useApi } from '../lib/hooks.js';
import { ago, money, num } from '../lib/format.js';
import { Button, Empty, Notice, PageHeader, SkeletonRows, Tabs, Thumb, useUi } from '../ui/kit.jsx';

/* Everything archived, from every section. Restoring is one click; deleting for good asks first, and the server
   refuses it while something still uses the item (orders keep their products' history; codes used by orders stay). */
const KIND = {
  products: { label: 'Products', restore: (x) => api.post(`/products/${x.id}/restore`), del: (x) => api.del(`/products/${x.id}/permanent`), name: (x) => `“${x.name}”` },
  categories: { label: 'Categories', restore: (x) => api.post(`/categories/${x.id}/restore`), del: (x) => api.del(`/categories/${x.id}/permanent`), name: (x) => `“${x.name}”` },
  brands: { label: 'Brands', restore: (x) => api.post(`/brands/${x.id}/restore`), del: (x) => api.del(`/brands/${x.id}/permanent`), name: (x) => `“${x.name}”` },
  coupons: { label: 'Coupons', restore: (x) => api.post(`/coupons/${x.id}/restore`), del: (x) => api.del(`/coupons/${x.id}/permanent`), name: (x) => x.code, restored: '(switched off until you turn it on)' },
};

export default function Trash({ query }) {
  const { toast, fail, confirm } = useUi();
  const { data: raw, error } = useApi('/trash');
  const data = raw?.data;
  const [busy, setBusy] = useState(null);
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, data?.[k]?.length || 0]));
  const tab = query.get('tab') || Object.keys(KIND).find((k) => counts[k]) || 'products';
  const list = data?.[tab] || [];
  const K = KIND[tab];

  const restore = async (x) => {
    setBusy(x.id);
    try { await K.restore(x); changed('trash'); toast(`Restored ${K.name(x)} ${K.restored || ''}`.trim()); } catch (e) { fail(e); }
    setBusy(null);
  };
  const destroy = async (x) => {
    if (!(await confirm({ title: `Delete ${K.name(x)} for good?`, text: 'This removes it permanently. It can’t be restored.', confirmLabel: 'Delete permanently', danger: true }))) return;
    setBusy(x.id);
    try { await K.del(x); changed('trash'); toast(`Deleted ${K.name(x)} permanently`); } catch (e) { fail(e); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader hud={<><span className="led" />Site</>} title="Trash" text="Products, categories, brands and coupons you archived. They stay out of the shop until you restore them. Orders are never deleted: they are the store’s history." />
      <div className="toolbar"><Tabs className="two-up" label="Kind" value={tab} onChange={(v) => setQuery({ tab: v })} items={Object.entries(KIND).map(([k, v]) => ({ value: k, label: v.label, count: data ? counts[k] : undefined }))} /></div>
      {error && <Notice tone="coral" icon="alert">{error.message}</Notice>}
      <div className="surface">
        {!data ? <SkeletonRows /> : !list.length ? <Empty icon="trash" title={`No ${K.label.toLowerCase()} in the trash`}>Things you archive land here first, so nothing disappears by accident.</Empty> : (
          <table className="table cards">
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td>
                    {tab === 'products' && <div className="cell-main"><Thumb src={x.image} /><div style={{ minWidth: 0 }}><b>{x.name}</b><small>{x.sku || `ID ${x.id}`} · {money(x.price)} · archived {ago(x.archived_at)}</small></div></div>}
                    {tab === 'categories' && <div className="cell-main"><div style={{ minWidth: 0 }}><b>{x.name}</b><small>{x.slug} · archived {ago(x.archived_at)}</small></div></div>}
                    {tab === 'brands' && <div className="cell-main"><Thumb src={x.image} /><div style={{ minWidth: 0 }}><b>{x.name}</b><small>{x.slug} · archived {ago(x.archived_at)}</small></div></div>}
                    {tab === 'coupons' && <div className="cell-main"><span className="coupon-code">{x.code}</span><small>{x.label} · used {num(x.uses)}× · trashed {ago(x.archived_at)}</small></div>}
                  </td>
                  <td className="shrink">
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="sm" icon="undo" loading={busy === x.id} onClick={() => restore(x)}>Restore</Button>
                      <Button size="sm" variant="quiet" icon="trash" disabled={busy === x.id} onClick={() => destroy(x)}>Delete</Button>
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
