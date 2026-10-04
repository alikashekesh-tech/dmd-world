import { useEffect, useMemo, useRef, useState } from 'react';
import { api, changed } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { money, ago, toInputDate, fromInputDate, safeHref } from '../lib/format.js';
import { Button, Chip, Check, Empty, Field, Hp, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi, CategoryPicker } from '../ui/kit.jsx';

const STATUS_TABS = [['all', 'All'], ['publish', 'Published'], ['draft', 'Drafts'], ['private', 'Private'], ['pending', 'Pending review']];
const PUB = { publish: ['green', 'Published'], draft: ['muted', 'Draft'], private: ['violet', 'Private'], pending: ['amber', 'Pending review'], trash: ['coral', 'Trash'] };

export function ProductsPage({ query }) {
  const { toast, fail, confirm } = useUi();
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 250);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const params = new URLSearchParams();
  const take = ['status', 'category', 'stock', 'sale', 'featured', 'sort', 'page'];
  for (const k of take) if (query.get(k)) params.set(k, query.get(k));
  if (query.get('q')) params.set('search', query.get('q'));
  params.set('per', '25');
  const { data, loading, error } = useApi(`/products?${params}`);
  const cats = useApi('/categories', { live: false });
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => setSel([]), [params.toString()]); // eslint-disable-line
  const status = query.get('status') || 'all';
  const items = data?.items || [];
  const allOn = items.length > 0 && items.every((p) => sel.includes(p.id));

  const trash = async (p) => {
    try {
      await api.post(`/products/${p.id}/trash`);
      changed('products');
      toast(`Moved “${p.name}” to the trash`, { undo: async () => { await api.post(`/products/${p.id}/restore`, { status: p.status }).catch(fail); changed('products'); } });
    } catch (e) { fail(e); }
  };
  const togglePublish = async (p) => {
    setBusy(p.id);
    try { await api.put(`/products/${p.id}`, { status: p.status === 'publish' ? 'draft' : 'publish' }); changed('products'); toast(p.status === 'publish' ? `“${p.name}” is hidden from the shop` : `“${p.name}” is live in the shop`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const bulk = async (action) => {
    if (action === 'trash' && !(await confirm({ title: `Move ${sel.length} products to the trash?`, text: 'They disappear from the shop. You can restore them from the trash.', confirmLabel: 'Move to trash', danger: true }))) return;
    try { await api.post('/products/bulk', { ids: sel, action }); changed('products'); toast(`${sel.length} products updated`); setSel([]); } catch (e) { fail(e); }
  };
  const catName = useMemo(() => Object.fromEntries((cats.data?.items || []).map((c) => [c.id, c.name])), [cats.data]);

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Catalog</>} title="Products" text="Everything in the store. Changes here go straight to WooCommerce."
        actions={<><Button icon="refresh" variant="quiet" onClick={() => { api.get('/products?fresh=1&per=1').then(() => changed('products')); }}>Refresh</Button><Button variant="primary" icon="plus" onClick={() => navigate('/products/new')}>Add product</Button></>} />
      <div className="toolbar">
        <Tabs label="Status" value={status} onChange={(v) => setQuery({ status: v === 'all' ? null : v, page: null })} items={STATUS_TABS.map(([v, l]) => ({ value: v, label: l, count: data?.counts?.[v] }))} />
      </div>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name, SKU or ID" />
        <select className="select" style={{ width: 210 }} value={query.get('category') || ''} onChange={(e) => setQuery({ category: e.target.value, page: null })} aria-label="Category">
          <option value="">All categories</option>
          {(cats.data?.items || []).filter((c) => c.parent === 0).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.isBrand ? ' (brand)' : ''}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={query.get('stock') || ''} onChange={(e) => setQuery({ stock: e.target.value, page: null })} aria-label="Stock">
          <option value="">Any stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="ok">In stock</option><option value="untracked">Not tracked</option>
        </select>
        <select className="select" style={{ width: 170 }} value={query.get('sort') || 'updated'} onChange={(e) => setQuery({ sort: e.target.value })} aria-label="Sort">
          <option value="updated">Recently updated</option><option value="newest">Newest</option><option value="name">Name A–Z</option><option value="price-asc">Price low–high</option><option value="price-desc">Price high–low</option><option value="stock">Lowest stock</option><option value="sales">Best selling</option>
        </select>
        <Toggle label="On sale" checked={query.get('sale') === '1'} onChange={(v) => setQuery({ sale: v ? 1 : null, page: null })} />
        <Toggle label="Featured" checked={query.get('featured') === '1'} onChange={(v) => setQuery({ featured: v ? 1 : null, page: null })} />
      </div>
      <div className="surface">
        {error && <div style={{ padding: 16 }}><Notice tone="coral" icon="alert">{error.message}</Notice></div>}
        {loading && !data ? <SkeletonRows /> : items.length === 0 ? (
          <Empty icon="box" title="No products match" action={<Button onClick={() => { setSearch(''); location.hash = '#/products'; }}>Clear filters</Button>}>Try another search or filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr>
                <th className="shrink"><Check on={allOn} label="Select all" onChange={(v) => setSel(v ? items.map((p) => p.id) : [])} /></th>
                <th>Product</th><th>Status</th><th className="right">Price</th><th>Stock</th><th>Category</th><th>Updated</th><th className="shrink" />
              </tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
                    <td className="shrink" onClick={(e) => e.stopPropagation()}><Check on={sel.includes(p.id)} label={`Select ${p.name}`} onChange={(v) => setSel((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))} /></td>
                    <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b>{p.name}</b><small>{p.sku ? `SKU ${p.sku}` : `ID ${p.id}`}</small></div></div></td>
                    <td data-label="Status"><span className="row" style={{ gap: 6 }}><Chip tone={PUB[p.status]?.[0]} led>{PUB[p.status]?.[1] || p.status}</Chip>{p.featured && <Icon name="star" size={14} style={{ color: 'var(--amber)' }} title="Featured" />}</span></td>
                    <td className="right" data-label="Price">
                      {p.on_sale ? <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><b className="num" style={{ color: 'var(--coral)' }}>{money(p.price)}</b><del className="muted" style={{ fontSize: 12 }}>{money(p.regular_price)}</del></span> : <b className="num">{money(p.price)}</b>}
                    </td>
                    <td data-label="Stock"><Hp qty={p.stock_quantity} level={p.level} /></td>
                    <td data-label="Category" className="t2" style={{ fontSize: 12.5 }}>{p.categories.slice(0, 2).map((c) => catName[c.id] || c.name).join(', ') || <span className="muted">—</span>}</td>
                    <td data-label="Updated" className="muted mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{ago(p.date_modified)}</td>
                    <td className="shrink" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <Button size="sm" variant="quiet" icon={p.status === 'publish' ? 'eyeOff' : 'eye'} loading={busy === p.id} title={p.status === 'publish' ? 'Unpublish' : 'Publish'} aria-label={p.status === 'publish' ? 'Unpublish' : 'Publish'} onClick={() => togglePublish(p)} />
                        <Button size="sm" variant="quiet" icon="edit" aria-label="Edit" onClick={() => navigate(`/products/${p.id}`)} />
                        <Button size="sm" variant="quiet" icon="trash" aria-label="Move to trash" onClick={() => trash(p)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} total={data.total} noun="products" onPage={(n) => setQuery({ page: n })} />}
      </div>
      {sel.length > 0 && (
        <div className="bulkbar">
          <b className="mono" style={{ fontSize: 12 }}>{sel.length} selected</b>
          <Button size="sm" icon="eye" onClick={() => bulk('publish')}>Publish</Button>
          <Button size="sm" icon="eyeOff" onClick={() => bulk('unpublish')}>Unpublish</Button>
          <Button size="sm" icon="star" onClick={() => bulk('feature')}>Feature</Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => bulk('trash')}>Trash</Button>
          <Button size="sm" variant="quiet" icon="close" aria-label="Clear selection" onClick={() => setSel([])} />
        </div>
      )}
    </>
  );
}

/* ── editor ──────────────────────────────────────────────────────────── */
const EMPTY = { name: '', status: 'draft', featured: false, description: '', short_description: '', sku: '', regular_price: '', sale_price: '', date_on_sale_from: '', date_on_sale_to: '', manage_stock: true, stock_quantity: 0, low_stock_amount: '', stock_status: 'instock', categories: [], images: [] };
const fromProduct = (p) => ({
  name: p.name, status: p.status, featured: !!p.featured, description: p.description || '', short_description: p.short_description || '', sku: p.sku || '',
  regular_price: p.regular_price || '', sale_price: p.sale_price || '', date_on_sale_from: toInputDate(p.date_on_sale_from), date_on_sale_to: toInputDate(p.date_on_sale_to),
  manage_stock: !!p.manage_stock, stock_quantity: p.stock_quantity ?? 0, low_stock_amount: p.low_stock_amount ?? '', stock_status: p.stock_status || 'instock',
  categories: (p.categories || []).map((c) => c.id), images: (p.images || []).map((i) => ({ id: i.id, src: i.src })),
});

export function ProductEditor({ params, session }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !params.id;
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [initial, setInitial] = useState(isNew ? EMPTY : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const cats = useApi('/categories', { live: false });
  const [imgUrl, setImgUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (isNew) return;
    api.get(`/products/${params.id}`).then((p) => { setProduct(p); const f = fromProduct(p); setForm(f); setInitial(f); }).catch(setErr);
  }, [params.id, isNew]);
  const dirty = form && initial && JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => {
    const on = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [dirty]);

  const all = cats.data?.items || [];
  const brands = all.filter((c) => c.isBrand);
  const brandIds = new Set(brands.map((b) => b.id));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const brand = form?.categories.find((id) => brandIds.has(id)) || '';
  const setBrand = (id) => setForm((f) => ({ ...f, categories: [...f.categories.filter((c) => !brandIds.has(c)), ...(id ? [Number(id)] : [])] }));
  const discount = form && Number(form.sale_price) > 0 && Number(form.regular_price) > 0 ? Math.round((1 - Number(form.sale_price) / Number(form.regular_price)) * 100) : null;

  const save = async (statusOverride) => {
    setSaving(true);
    const body = { ...form, status: statusOverride || form.status, date_on_sale_from: fromInputDate(form.date_on_sale_from), date_on_sale_to: fromInputDate(form.date_on_sale_to), categories: form.categories.map((id) => ({ id })) };
    try {
      const p = isNew ? await api.post('/products', body) : await api.put(`/products/${params.id}`, body);
      const f = fromProduct(p);
      setProduct(p); setForm(f); setInitial(f);
      changed('products');
      toast(isNew ? `“${p.name}” created${p.status === 'publish' ? ' and published' : ' as a draft'}` : `Saved “${p.name}”`);
      if (isNew) navigate(`/products/${p.id}`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const trash = async () => {
    if (!(await confirm({ title: 'Move this product to the trash?', text: 'It disappears from the shop straight away. You can restore it from the trash.', confirmLabel: 'Move to trash', danger: true }))) return;
    try {
      await api.post(`/products/${params.id}/trash`);
      changed('products');
      toast(`Moved “${product.name}” to the trash`, { undo: async () => { await api.post(`/products/${params.id}/restore`, { status: product.status }).catch(fail); changed('products'); navigate(`/products/${params.id}`); } });
      navigate('/products');
    } catch (e) { fail(e); }
  };
  const restore = async () => { try { const p = await api.post(`/products/${params.id}/restore`, { status: 'draft' }); setProduct(p); const f = fromProduct(p); setForm(f); setInitial(f); changed('products'); toast('Restored as a draft'); } catch (e) { fail(e); } };
  const addUrl = () => { const src = imgUrl.trim(); if (!/^https?:\/\//.test(src)) return fail(new Error('Paste a full image address starting with https://')); setForm((f) => ({ ...f, images: [...f.images, { src }] })); setImgUrl(''); };
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try { const r = await api.upload(file); setForm((f) => ({ ...f, images: [...f.images, { id: r.id, src: r.src }] })); } catch (e) { fail(e); }
    setUploading(false);
  };
  const moveImg = (i, d) => setForm((f) => { const a = [...f.images]; const j = i + d; if (j < 0 || j >= a.length) return f; [a[i], a[j]] = [a[j], a[i]]; return { ...f, images: a }; });

  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!form) return <SkeletonRows rows={8} />;
  const trashed = product?.status === 'trash';

  return (
    <>
      <PageHeader crumbs={[{ label: 'Products', to: '#/products' }, { label: isNew ? 'New' : `#${params.id}` }]} title={isNew ? 'Add product' : form.name || 'Untitled product'}
        actions={!isNew && safeHref(product?.permalink) && product.status === 'publish' && <a className="btn" href={safeHref(product.permalink)} target="_blank" rel="noopener noreferrer"><Icon name="external" />View in store</a>} />
      {trashed && <div style={{ marginBottom: 14 }}><Notice tone="coral" icon="trash">This product is in the trash and hidden from the shop. <button className="linkish" onClick={restore}>Restore it</button></Notice></div>}
      <div className="split-wide">
        <div className="stack">
          <section className="surface surface-body stack">
            <Field label="Name" error={!form.name.trim() && dirty ? 'A name is required' : null}><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. PS5 DualSense Controller — White" autoFocus={isNew} /></Field>
            <Field label="Short description" hint="Shown near the price on the product page."><textarea className="textarea" style={{ minHeight: 70 }} value={form.short_description} onChange={set('short_description')} /></Field>
            <Field label="Description" hint="HTML is allowed (WooCommerce keeps it as-is)."><textarea className="textarea" style={{ minHeight: 150 }} value={form.description} onChange={set('description')} /></Field>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Images</h3><span className="hud">{form.images.length ? 'First image is the main one' : 'No images yet'}</span></div>
            <div className="surface-body stack">
              {form.images.length > 0 && (
                <ul className="row wrap" style={{ gap: 10 }}>
                  {form.images.map((im, i) => (
                    <li key={`${im.src}-${i}`} className="surface" style={{ width: 132, padding: 8, display: 'grid', gap: 6, borderColor: i === 0 ? 'rgba(91,149,255,.5)' : undefined }}>
                      <span className="thumb" style={{ width: '100%', height: 96 }}><img src={im.src} alt="" referrerPolicy="no-referrer" /></span>
                      <span className="row" style={{ justifyContent: 'space-between' }}>
                        {i === 0 ? <Chip tone="blue">Main</Chip> : <Button size="sm" variant="quiet" icon="back" aria-label="Move left" onClick={() => moveImg(i, -1)} />}
                        <Button size="sm" variant="quiet" icon="close" aria-label="Remove image" onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, k) => k !== i) }))} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row wrap">
                <input className="input grow" style={{ minWidth: 220 }} value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} placeholder="Paste an image URL (https://…)" />
                <Button icon="link" onClick={addUrl} disabled={!imgUrl.trim()}>Add URL</Button>
                {session.capabilities.media ? (
                  <><input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} /><Button icon="upload" loading={uploading} onClick={() => fileRef.current?.click()}>Upload</Button></>
                ) : <span className="hint muted" style={{ fontSize: 12 }}>Uploads need a WordPress application password on the server.</span>}
              </div>
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Price</h3>{discount != null && discount > 0 && <Chip tone="coral">−{discount}% sale</Chip>}</div>
            <div className="surface-body stack">
              <div className="grid-2">
                <Field label="Regular price"><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={form.regular_price} onChange={set('regular_price')} /></span></Field>
                <Field label="Sale price" hint="Leave empty for no sale."><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={form.sale_price} onChange={set('sale_price')} /></span></Field>
              </div>
              {form.sale_price !== '' && (
                <div className="grid-2">
                  <Field label="Sale starts" hint="Empty = now"><input className="input" type="datetime-local" value={form.date_on_sale_from} onChange={set('date_on_sale_from')} /></Field>
                  <Field label="Sale ends" hint="Empty = until you remove it"><input className="input" type="datetime-local" value={form.date_on_sale_to} onChange={set('date_on_sale_to')} /></Field>
                </div>
              )}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Inventory</h3><Toggle label="Track stock" checked={form.manage_stock} onChange={set('manage_stock')} /></div>
            <div className="surface-body grid-3">
              {form.manage_stock ? (
                <>
                  <Field label="In stock"><input className="input mono" type="number" min="0" step="1" value={form.stock_quantity} onChange={set('stock_quantity')} /></Field>
                  <Field label="Low-stock alert at" hint="Empty = store default"><input className="input mono" type="number" min="0" value={form.low_stock_amount} onChange={set('low_stock_amount')} /></Field>
                </>
              ) : (
                <Field label="Availability"><select className="select" value={form.stock_status} onChange={set('stock_status')}><option value="instock">In stock</option><option value="outofstock">Out of stock</option><option value="onbackorder">On backorder</option></select></Field>
              )}
              <Field label="SKU"><input className="input mono" value={form.sku} onChange={set('sku')} placeholder="Optional" /></Field>
            </div>
          </section>
        </div>

        <div className="stack sticky-col">
          <section className="surface surface-body stack">
            <Field label="Visibility">
              <select className="select" value={form.status} onChange={set('status')} disabled={trashed}>
                <option value="publish">Published (visible in the shop)</option><option value="draft">Draft (hidden)</option><option value="private">Private (only you)</option><option value="pending">Pending review</option>
              </select>
            </Field>
            <Toggle label="Featured product (homepage)" checked={form.featured} onChange={set('featured')} />
          </section>
          <section className="surface surface-body stack">
            <Field label="Brand" hint={<a className="linkish" href="#/brands">Manage brands</a>}>
              <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">No brand</option>
                {brands.sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Categories">
              {cats.data ? <CategoryPicker categories={all} exclude={[...brandIds]} value={form.categories.filter((id) => !brandIds.has(id))} onChange={(ids) => setForm((f) => ({ ...f, categories: [...ids, ...f.categories.filter((c) => brandIds.has(c))] }))} maxHeight={260} /> : <SkeletonRows rows={3} />}
            </Field>
          </section>
          {!isNew && !trashed && <Button variant="danger" icon="trash" onClick={trash}>Move to trash</Button>}
        </div>
      </div>

      <div className="savebar">
        {dirty ? <><span className="dirty-dot" /><span className="t2">Unsaved changes</span></> : <span className="muted">{isNew ? 'New product' : `Saved · last change ${ago(product?.date_modified)}`}</span>}
        <span className="grow" />
        {dirty && !isNew && <Button variant="quiet" onClick={() => setForm(initial)}>Discard</Button>}
        {isNew && <Button onClick={() => save('draft')} loading={saving} disabled={!form.name.trim()}>Save draft</Button>}
        <Button variant="primary" icon="check" loading={saving} disabled={!form.name.trim() || (!dirty && !isNew) || trashed} onClick={() => save(isNew ? 'publish' : undefined)}>{isNew ? 'Publish' : 'Save changes'}</Button>
      </div>
    </>
  );
}
