import { useEffect, useMemo, useRef, useState } from 'react';
import { api, changed, paged } from '../lib/api.js';
import { navigate, setQuery } from '../lib/router.jsx';
import { useApi, useDebounced } from '../lib/hooks.js';
import { money, ago, toInputDate, fromInputDate } from '../lib/format.js';
import { productFromApi, useCatalogLists } from '../lib/catalog.js';
import { Button, Chip, Check, Empty, Field, Hp, Icon, Notice, PageHeader, Pager, SearchBox, SkeletonRows, Tabs, Thumb, Toggle, useUi, CategoryPicker, ProductPicker } from '../ui/kit.jsx';
import VariantEditor, { variantRow } from './products/VariantEditor.jsx';
import { cleanOptions } from '../lib/variants.js';

/** Buy Used grades (the storefront shows the same words): null = a new product. */
const CONDITIONS = [['like_new', 'Like New', 'Little to no sign of use, with no visible marks.'], ['excellent', 'Excellent', 'Light signs of use that are hard to spot.'], ['good', 'Good', 'Visible light wear, such as small scratches.'], ['fair', 'Fair', 'Clear signs of use, such as scuffs or marks.']];
const conditionLabel = (k) => CONDITIONS.find(([v]) => v === k)?.[1];

const STATUS_TABS = [['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['archived', 'Archived']];
const PUB = { published: ['green', 'Published'], draft: ['muted', 'Draft'] };
const SORTS = [['updated', 'Recently updated'], ['newest', 'Newest'], ['name', 'Name A–Z'], ['price_asc', 'Price low–high'], ['price_desc', 'Price high–low'], ['stock', 'Lowest stock'], ['best', 'Best selling']];

export function ProductsPage({ query }) {
  const { toast, fail, confirm } = useUi();
  const [search, setSearch] = useState(query.get('q') || '');
  const ds = useDebounced(search, 250);
  useEffect(() => { if (ds !== (query.get('q') || '')) setQuery({ q: ds, page: null }); }, [ds]); // eslint-disable-line
  const status = query.get('status') || 'all';
  const params = new URLSearchParams({ per_page: '25', page: query.get('page') || '1', sort: query.get('sort') || 'updated' });
  for (const k of ['q', 'category', 'brand', 'stock']) if (query.get(k)) params.set(k, query.get(k));
  if (query.get('sale') === '1') params.set('on_sale', '1');
  if (query.get('featured') === '1') params.set('featured', '1');
  if (query.get('used') === '1') params.set('condition', 'used');
  if (status === 'archived') params.set('archived', 'only'); else if (status !== 'all') params.set('status', status);
  const { data: raw, loading, error } = useApi(`/products?${params}`);
  const data = useMemo(() => (raw ? paged(raw, productFromApi) : null), [raw]);
  const lists = useCatalogLists();
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => setSel([]), [params.toString()]); // eslint-disable-line
  const items = data?.items || [];
  const allOn = items.length > 0 && items.every((p) => sel.includes(p.id));
  const counts = raw?.meta?.counts || {};

  const archive = async (p) => {
    try {
      await api.del(`/products/${p.id}`);
      changed('products');
      toast(`Archived “${p.name}”`, { undo: async () => { await api.post(`/products/${p.id}/restore`).catch(fail); changed('products'); } });
    } catch (e) { fail(e); }
  };
  const restore = async (p) => { try { await api.post(`/products/${p.id}/restore`); changed('products'); toast(`Restored “${p.name}”`); } catch (e) { fail(e); } };
  const togglePublish = async (p) => {
    setBusy(p.id);
    const next = p.status === 'published' ? 'draft' : 'published';
    try { await api.put(`/products/${p.id}`, { status: next }); changed('products'); toast(next === 'draft' ? `“${p.name}” is hidden from the shop` : `“${p.name}” is live in the shop`); } catch (e) { fail(e); }
    setBusy(null);
  };
  const bulk = async (action) => {
    if (action === 'archive' && !(await confirm({ title: `Archive ${sel.length} products?`, text: 'They leave the shop straight away. You can restore them from Archived or the trash.', confirmLabel: 'Archive', danger: true }))) return;
    try { const r = await api.post('/products/bulk', { ids: sel, action }); changed('products'); toast(`${r.count} product${r.count === 1 ? '' : 's'} updated`); setSel([]); } catch (e) { fail(e); }
  };
  const tops = lists.categories.filter((c) => c.parent === 0).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader hud={<><span className="led blue" />Catalog</>} title="Products" text="Everything in the store. Changes here show in the shop straight away."
        actions={<Button variant="primary" icon="plus" onClick={() => navigate('/products/new')}>Add product</Button>} />
      <div className="toolbar">
        <Tabs className="two-up" label="Status" value={status} onChange={(v) => setQuery({ status: v === 'all' ? null : v, page: null })} items={STATUS_TABS.map(([v, l]) => ({ value: v, label: l, count: counts[v] }))} />
      </div>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name, SKU or ID" />
        <select className="select" style={{ width: 210 }} value={query.get('category') || ''} onChange={(e) => setQuery({ category: e.target.value, page: null })} aria-label="Category">
          <option value="">All categories</option>
          {tops.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="select" style={{ width: 170 }} value={query.get('brand') || ''} onChange={(e) => setQuery({ brand: e.target.value, page: null })} aria-label="Brand">
          <option value="">All brands</option>
          {[...lists.brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={query.get('stock') || ''} onChange={(e) => setQuery({ stock: e.target.value, page: null })} aria-label="Stock">
          <option value="">Any stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="in">In stock</option><option value="untracked">Not tracked</option>
        </select>
        <select className="select" style={{ width: 170 }} value={query.get('sort') || 'updated'} onChange={(e) => setQuery({ sort: e.target.value })} aria-label="Sort">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Toggle label="On sale" checked={query.get('sale') === '1'} onChange={(v) => setQuery({ sale: v ? 1 : null, page: null })} />
        <Toggle label="Featured" checked={query.get('featured') === '1'} onChange={(v) => setQuery({ featured: v ? 1 : null, page: null })} />
        <Toggle label="Used only" checked={query.get('used') === '1'} onChange={(v) => setQuery({ used: v ? 1 : null, page: null })} />
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
                    <td><div className="cell-main"><Thumb src={p.image} /><div style={{ minWidth: 0 }}><b>{p.name}</b><small>{p.sku ? `SKU ${p.sku}` : `ID ${p.id}`}{p.brandName ? ` · ${p.brandName}` : ''}</small></div></div></td>
                    <td data-label="Status"><span className="row" style={{ gap: 6 }}>{p.archived_at ? <Chip tone="coral" led>Archived</Chip> : <Chip tone={PUB[p.status]?.[0]} led>{PUB[p.status]?.[1] || p.status}</Chip>}{p.featured && <Icon name="star" size={14} style={{ color: 'var(--amber)' }} title="Featured" />}{p.condition && <Chip tone="violet">Used · {conditionLabel(p.condition)}</Chip>}{p.type === 'variable' && <Chip tone="blue">{p.variants?.length || 0} variants</Chip>}</span></td>
                    <td className="right" data-label="Price">
                      {p.on_sale ? <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><b className="num" style={{ color: 'var(--coral)' }}>{money(p.price)}</b><del className="muted" style={{ fontSize: 12 }}>{money(p.regular_price)}</del></span> : <b className="num">{money(p.price)}</b>}
                    </td>
                    <td data-label="Stock"><Hp qty={p.stock_quantity} level={p.level} /></td>
                    <td data-label="Category" className="t2" style={{ fontSize: 12.5 }}>{p.categoryNames.slice(0, 2).join(', ') || <span className="muted">—</span>}</td>
                    <td data-label="Updated" className="muted mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{ago(p.updated_at)}</td>
                    <td className="shrink" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        {p.archived_at ? <Button size="sm" variant="quiet" icon="undo" aria-label="Restore" title="Restore" onClick={() => restore(p)} /> : <>
                          <Button size="sm" variant="quiet" icon={p.status === 'published' ? 'eyeOff' : 'eye'} loading={busy === p.id} title={p.status === 'published' ? 'Unpublish' : 'Publish'} aria-label={p.status === 'published' ? 'Unpublish' : 'Publish'} onClick={() => togglePublish(p)} />
                          <Button size="sm" variant="quiet" icon="edit" aria-label="Edit" onClick={() => navigate(`/products/${p.id}`)} />
                          <Button size="sm" variant="quiet" icon="trash" aria-label="Archive" title="Archive" onClick={() => archive(p)} />
                        </>}
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
          {status === 'archived' ? <Button size="sm" icon="undo" onClick={() => bulk('restore')}>Restore</Button> : <>
            <Button size="sm" icon="eye" onClick={() => bulk('publish')}>Publish</Button>
            <Button size="sm" icon="eyeOff" onClick={() => bulk('unpublish')}>Unpublish</Button>
            <Button size="sm" icon="star" onClick={() => bulk('feature')}>Feature</Button>
            <Button size="sm" variant="danger" icon="trash" onClick={() => bulk('archive')}>Archive</Button>
          </>}
          <Button size="sm" variant="quiet" icon="close" aria-label="Clear selection" onClick={() => setSel([])} />
        </div>
      )}
    </>
  );
}

/* ── editor ──────────────────────────────────────────────────────────── */
const EMPTY = { name: '', status: 'draft', is_featured: false, description: '', short_description: '', sku: '', regular_price: '', sale_price: '', sale_starts_at: '', sale_ends_at: '', track_stock: true, stock_quantity: 0, low_stock_threshold: '', stock_status: 'in_stock', brand_id: '', category_ids: [], images: [], video_url: '', delivery_fee: '',
  variable: false, options: [], variants: [], condition: '', condition_note: '', specs: [], addon_ids: [] };
const MAX_ADDONS = 8;
const MAX_IMAGES = 12;
/** The YouTube video id in a watch, youtu.be, shorts or embed link (the server checks the link again). */
const youtubeId = (url) => /^https:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url || '')?.[1] || null;
const fromProduct = (p) => ({
  name: p.name, status: p.status, is_featured: !!p.is_featured, description: p.description || '', short_description: p.short_description || '', sku: p.sku || '',
  regular_price: p.regular_price != null ? String(p.regular_price) : '', sale_price: p.sale_price != null ? String(p.sale_price) : '',
  sale_starts_at: toInputDate(p.sale_starts_at), sale_ends_at: toInputDate(p.sale_ends_at),
  track_stock: !!p.track_stock, stock_quantity: p.stock_quantity ?? 0, low_stock_threshold: p.low_stock_threshold ?? '', stock_status: p.stock_status || 'in_stock',
  brand_id: p.brand?.id ?? '', category_ids: (p.categories || []).map((c) => c.id), images: (p.images || []).map((i) => ({ url: i.url, alt: i.alt || '' })), video_url: p.video_url || '',
  delivery_fee: p.delivery_fee != null ? String(p.delivery_fee) : '',
  variable: p.type === 'variable', options: (p.attributes || []).map((a) => ({ name: a.name, values: [...a.values] })), variants: (p.variants || []).map(variantRow),
  condition: p.condition || '', condition_note: p.condition_note || '', specs: (p.specifications || []).map((x) => ({ name: x.name, value: x.value })),
  addon_ids: (p.addon_ids || []).map(Number),
});
const num = (v) => (v === '' || v == null ? null : Number(v));
/** The form → what the API takes (empty strings become null; the stock count is only sent when it changed). */
const toBody = (f, initial) => ({
  name: f.name.trim(), status: f.status, is_featured: f.is_featured, description: f.description || null, short_description: f.short_description || null, sku: f.sku.trim() || null,
  regular_price: f.regular_price === '' ? undefined : Number(f.regular_price), sale_price: f.sale_price === '' ? null : Number(f.sale_price),
  sale_starts_at: f.sale_price === '' ? null : fromInputDate(f.sale_starts_at), sale_ends_at: f.sale_price === '' ? null : fromInputDate(f.sale_ends_at),
  track_stock: f.track_stock, low_stock_threshold: f.low_stock_threshold === '' ? null : Number(f.low_stock_threshold), stock_status: f.stock_status,
  ...(f.track_stock && String(f.stock_quantity) !== String(initial.stock_quantity) ? { stock_quantity: Number(f.stock_quantity) } : {}),
  brand_id: f.brand_id === '' ? null : Number(f.brand_id), category_ids: f.category_ids, primary_category_id: f.category_ids[0] ?? null,
  images: f.images.map((i) => ({ url: i.url, alt: i.alt || null })), video_url: f.video_url || null,
  delivery_fee: f.delivery_fee === '' ? null : Number(f.delivery_fee),
  condition: f.condition || null, condition_note: f.condition ? f.condition_note.trim() || null : null,
  // Specifications are replaced as a whole on the server: only sent when they changed.
  ...(JSON.stringify(f.specs) !== JSON.stringify(initial.specs) ? { specifications: f.specs.filter((x) => x.name.trim() && x.value.trim()).map((x) => ({ name: x.name.trim(), value: x.value.trim() })) } : {}),
  ...(JSON.stringify(f.addon_ids) !== JSON.stringify(initial.addon_ids) ? { addon_ids: f.addon_ids } : {}),
  ...(f.variable ? variableBody(f, initial) : initial.variable ? { type: 'simple' } : {}),
});
/** A product sold in variants: its options and variants. A variant's stock is only sent when it's new or was changed
    here (a stocktake), so orders placed meanwhile aren't overwritten. Its own price and stock fields aren't sent. */
const variableBody = (f, initial) => {
  const options = cleanOptions(f.options);
  return {
    type: 'variable', regular_price: undefined, sale_price: undefined, sale_starts_at: undefined, sale_ends_at: undefined, stock_quantity: undefined, track_stock: undefined, stock_status: undefined,
    attributes: options,
    variants: f.variants.map((v) => {
      const was = initial.variants.find((x) => x.id && x.id === v.id);
      return {
        ...(v.id ? { id: v.id } : {}), options: Object.fromEntries(options.map((o) => [o.name, v.options[o.name] || ''])), sku: v.sku.trim() || null, image_url: v.image_url || null,
        regular_price: num(v.regular_price), sale_price: num(v.sale_price), track_stock: v.track_stock, stock_status: v.stock_status, is_active: v.is_active,
        ...(v.track_stock && (!was || String(was.stock_quantity) !== String(v.stock_quantity)) ? { stock_quantity: Number(v.stock_quantity) || 0 } : {}),
      };
    }),
  };
};

export function ProductEditor({ params }) {
  const { toast, fail, confirm } = useUi();
  const isNew = !params.id;
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [initial, setInitial] = useState(isNew ? EMPTY : null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const lists = useCatalogLists();
  const [imgUrl, setImgUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [videoLink, setVideoLink] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoRef = useRef(null);
  const loaded = (p) => { setProduct(p); const f = fromProduct(p); setForm(f); setInitial(f); };

  useEffect(() => {
    if (isNew) return;
    api.get(`/products/${params.id}`).then((r) => loaded(r.data)).catch(setErr);
  }, [params.id, isNew]);
  const dirty = form && initial && JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => {
    const on = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [dirty]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const discount = form && Number(form.sale_price) > 0 && Number(form.regular_price) > 0 ? Math.round((1 - Number(form.sale_price) / Number(form.regular_price)) * 100) : null;
  const archived = !!product?.archived_at;

  const save = async (statusOverride) => {
    setSaving(true);
    const body = toBody({ ...form, status: statusOverride || form.status }, initial);
    try {
      const { data: p } = isNew ? await api.post('/products', body) : await api.put(`/products/${params.id}`, body);
      loaded(p);
      changed('products');
      toast(isNew ? `“${p.name}” created${p.status === 'published' ? ' and published' : ' as a draft'}` : `Saved “${p.name}”`);
      if (isNew) navigate(`/products/${p.id}`);
    } catch (e) { fail(e); }
    setSaving(false);
  };
  const archive = async () => {
    if (!(await confirm({ title: 'Archive this product?', text: 'It leaves the shop straight away. Its orders keep their history, and you can restore it any time.', confirmLabel: 'Archive', danger: true }))) return;
    try {
      await api.del(`/products/${params.id}`);
      changed('products');
      toast(`Archived “${product.name}”`, { undo: async () => { await api.post(`/products/${params.id}/restore`).catch(fail); changed('products'); navigate(`/products/${params.id}`); } });
      navigate('/products');
    } catch (e) { fail(e); }
  };
  const restore = async () => { try { const { data: p } = await api.post(`/products/${params.id}/restore`); loaded(p); changed('products'); toast('Restored'); } catch (e) { fail(e); } };
  const addUrl = () => { const url = imgUrl.trim(); if (!/^https:\/\//.test(url)) return fail(new Error('Paste a full image address starting with https://')); setForm((f) => ({ ...f, images: [...f.images, { url, alt: '' }] })); setImgUrl(''); };
  /** Several photos at once, uploaded one after another in the order chosen; stops at the gallery limit. */
  const upload = async (files) => {
    const room = MAX_IMAGES - form.images.length;
    const picked = [...(files || [])];
    if (!picked.length) return;
    if (room < 1) return fail(new Error(`A product can have at most ${MAX_IMAGES} images. Remove one first.`));
    if (picked.length > room) fail(new Error(`Only the first ${room} added: a product can have at most ${MAX_IMAGES} images.`));
    setUploading(true);
    for (const file of picked.slice(0, room)) {
      try { const r = await api.upload(file); setForm((f) => ({ ...f, images: [...f.images, { url: r.url, alt: '' }] })); } catch (e) { fail(e); }
    }
    setUploading(false);
  };
  const uploadVideo = async (file) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return fail(new Error('Videos can be at most 30 MB. Put longer ones on YouTube and paste the link.'));
    setUploadingVideo(true);
    try { const r = await api.uploadVideo(file); setForm((f) => ({ ...f, video_url: r.url })); } catch (e) { fail(e); }
    setUploadingVideo(false);
  };
  const addVideoLink = () => {
    const url = videoLink.trim();
    if (!youtubeId(url)) return fail(new Error('Paste a YouTube link, like https://www.youtube.com/watch?v=… or https://youtu.be/…'));
    setForm((f) => ({ ...f, video_url: url }));
    setVideoLink('');
  };
  const ytId = youtubeId(form?.video_url);
  const moveImg = (i, d) => setForm((f) => { const a = [...f.images]; const j = i + d; if (j < 0 || j >= a.length) return f; [a[i], a[j]] = [a[j], a[i]]; return { ...f, images: a }; });

  if (err) return <Notice tone="coral" icon="alert">{err.message}</Notice>;
  if (!form) return <SkeletonRows rows={8} />;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Products', to: '#/products' }, { label: isNew ? 'New' : `#${params.id}` }]} title={isNew ? 'Add product' : form.name || 'Untitled product'}
        actions={!isNew && product?.on_storefront && <a className="btn" href={`/product/${product.id}`} target="_blank" rel="noopener noreferrer"><Icon name="external" />View in store</a>} />
      {archived && <div style={{ marginBottom: 14 }}><Notice tone="coral" icon="trash">This product is archived and hidden from the shop. <button className="linkish" onClick={restore}>Restore it</button></Notice></div>}
      <div className="split-wide">
        <div className="stack">
          <section className="surface surface-body stack">
            <Field label="Name" error={!form.name.trim() && dirty ? 'A name is required' : null}><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. PS5 DualSense Controller — White" autoFocus={isNew} /></Field>
            <Field label="Short description" hint="Shown near the price on the product page."><textarea className="textarea" style={{ minHeight: 70 }} value={form.short_description} onChange={set('short_description')} /></Field>
            <Field label="Description" hint="Plain text; line breaks are kept."><textarea className="textarea" style={{ minHeight: 150 }} value={form.description} onChange={set('description')} /></Field>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Images</h3><span className="hud">{form.images.length ? `${form.images.length} of ${MAX_IMAGES} · first image is the main one` : 'No images yet'}</span></div>
            <div className="surface-body stack">
              {form.images.length > 0 && (
                <ul className="row wrap" style={{ gap: 10 }}>
                  {form.images.map((im, i) => (
                    <li key={`${im.url}-${i}`} className="surface" style={{ width: 132, padding: 8, display: 'grid', gap: 6, borderColor: i === 0 ? 'var(--blue)' : undefined }}>
                      <span className="thumb" style={{ width: '100%', height: 96 }}><img src={im.url} alt="" referrerPolicy="no-referrer" /></span>
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
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                <Button icon="upload" loading={uploading} disabled={form.images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}>Upload images</Button>
              </div>
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Video</h3><span className="hud">{form.video_url ? 'Shown after the photos on the product page' : 'No video yet'}</span></div>
            <div className="surface-body stack">
              {form.video_url && (
                <div className="row wrap" style={{ alignItems: 'flex-start', gap: 12 }}>
                  {ytId
                    ? <a className="thumb" style={{ width: 240, height: 135 }} href={`https://www.youtube.com/watch?v=${ytId}`} target="_blank" rel="noopener noreferrer"><img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="YouTube video" referrerPolicy="no-referrer" /></a>
                    : <video src={form.video_url} controls preload="metadata" style={{ width: 240, maxHeight: 180, borderRadius: 10, background: '#000' }} />}
                  <div className="stack" style={{ gap: 6 }}>
                    <Chip tone="blue">{ytId ? 'YouTube' : 'Uploaded video'}</Chip>
                    <Button size="sm" variant="quiet" icon="close" onClick={() => setForm((f) => ({ ...f, video_url: '' }))}>Remove video</Button>
                  </div>
                </div>
              )}
              <div className="row wrap">
                <input className="input grow" style={{ minWidth: 220 }} value={videoLink} onChange={(e) => setVideoLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVideoLink())} placeholder="Paste a YouTube link (https://youtu.be/…)" />
                <Button icon="link" onClick={addVideoLink} disabled={!videoLink.trim()}>{form.video_url ? 'Replace with link' : 'Add link'}</Button>
                <input ref={videoRef} type="file" accept="video/mp4,video/webm" hidden onChange={(e) => { uploadVideo(e.target.files?.[0]); e.target.value = ''; }} />
                <Button icon="upload" loading={uploadingVideo} onClick={() => videoRef.current?.click()}>{form.video_url ? 'Replace with upload' : 'Upload video'}</Button>
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>MP4 or WebM up to 30 MB. For longer videos, upload them to YouTube and paste the link.</span>
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Price</h3>{discount != null && discount > 0 && <Chip tone="coral">−{discount}% sale</Chip>}</div>
            <div className="surface-body stack">
              {form.variable && <Notice icon="info">Each variant has its own price, set in Options &amp; variants below. The shop shows the lowest one as “From”.</Notice>}
              {!form.variable && <div className="grid-2">
                <Field label="Regular price"><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={form.regular_price} onChange={set('regular_price')} /></span></Field>
                <Field label="Sale price" hint="Leave empty for no sale."><span className="input-affix"><span>$</span><input className="input mono" inputMode="decimal" value={form.sale_price} onChange={set('sale_price')} /></span></Field>
              </div>}
              {!form.variable && form.sale_price !== '' && (
                <div className="grid-2">
                  <Field label="Sale starts" hint="Empty = now"><input className="input" type="datetime-local" value={form.sale_starts_at} onChange={set('sale_starts_at')} /></Field>
                  <Field label="Sale ends" hint="Empty = until you remove it"><input className="input" type="datetime-local" value={form.sale_ends_at} onChange={set('sale_ends_at')} /></Field>
                </div>
              )}
              <Field label="Delivery price" hint="Empty = the store’s delivery price from Settings. An order pays the highest delivery price among its products.">
                <span className="input-affix" style={{ maxWidth: 220 }}><span>$</span><input className="input mono" inputMode="decimal" value={form.delivery_fee} onChange={set('delivery_fee')} placeholder="Store default" /></span>
              </Field>
              {product?.on_sale && product.price < (form.sale_price === '' ? product.regular_price : Number(form.sale_price)) && <Notice icon="percent">A store-wide offer currently sells it for {money(product.price)}.</Notice>}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Inventory</h3>{!form.variable && <Toggle label="Track stock" checked={form.track_stock} onChange={set('track_stock')} />}</div>
            <div className="surface-body grid-3">
              {form.variable ? (
                <>
                  <Field label="Stock" hint="Kept per variant, in Options &amp; variants below and on the Inventory page."><span className="input mono" style={{ display: 'flex', alignItems: 'center' }}>{product?.stock_quantity ?? 0} in all</span></Field>
                  <Field label="Low-stock alert at" hint="Empty = store default. Applies to each variant."><input className="input mono" type="number" min="0" value={form.low_stock_threshold} onChange={set('low_stock_threshold')} /></Field>
                </>
              ) : form.track_stock ? (
                <>
                  <Field label="In stock" hint={!isNew ? 'Saved as a stocktake in the stock history.' : null}><input className="input mono" type="number" min="0" step="1" value={form.stock_quantity} onChange={set('stock_quantity')} /></Field>
                  <Field label="Low-stock alert at" hint="Empty = store default"><input className="input mono" type="number" min="0" value={form.low_stock_threshold} onChange={set('low_stock_threshold')} /></Field>
                </>
              ) : (
                <Field label="Availability"><select className="select" value={form.stock_status} onChange={set('stock_status')}><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option></select></Field>
              )}
              <Field label="SKU"><input className="input mono" value={form.sku} onChange={set('sku')} placeholder="Optional" /></Field>
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Options &amp; variants</h3>
              <Toggle label="Sold in options (colour, size, dimensions…)" checked={form.variable} onChange={async (on) => {
                if (!on && initial.variable && !(await confirm({ title: 'Stop selling it in options?', text: 'Its variants are removed (past orders and the stock history keep them). Give the product its own price and stock before saving.', confirmLabel: 'Stop using options', danger: true }))) return;
                setForm((f) => ({ ...f, variable: on }));
              }} />
            </div>
            <div className="surface-body">
              {form.variable
                ? <VariantEditor options={form.options} variants={form.variants} images={form.images} saved={initial.variants} onChange={({ options, variants }) => setForm((f) => ({ ...f, options, variants }))} />
                : <span className="muted" style={{ fontSize: 13 }}>One price and one stock count. Switch on to sell it in colours, sizes, dimensions or editions, each with its own SKU, price, stock and photo.</span>}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head"><h3>Specifications</h3><span className="hud">{form.specs.length ? 'Shown in the Specifications tab' : 'None yet'}</span></div>
            <div className="surface-body stack" style={{ gap: 8 }}>
              {form.specs.map((sp, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <input className="input" style={{ width: 200 }} value={sp.name} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) }))} placeholder="e.g. Storage" aria-label={`Specification ${i + 1} name`} />
                  <input className="input grow" value={sp.value} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) }))} placeholder="e.g. 512 GB SSD" aria-label={`Specification ${i + 1} value`} />
                  <Button size="sm" variant="quiet" icon="close" aria-label={`Remove specification ${sp.name || i + 1}`} onClick={() => setForm((f) => ({ ...f, specs: f.specs.filter((_, k) => k !== i) }))} />
                </div>
              ))}
              <Button size="sm" icon="plus" style={{ justifySelf: 'start' }} disabled={form.specs.length >= 40} onClick={() => setForm((f) => ({ ...f, specs: [...f.specs, { name: '', value: '' }] }))}>Add a specification</Button>
            </div>
          </section>
        </div>

        <div className="stack sticky-col">
          <section className="surface surface-body stack">
            <Field label="Visibility">
              <select className="select" value={form.status} onChange={set('status')} disabled={archived}>
                <option value="published">Published (visible in the shop)</option><option value="draft">Draft (hidden)</option>
              </select>
            </Field>
            <Toggle label="Featured product" checked={form.is_featured} onChange={set('is_featured')} />
          </section>
          <section className="surface surface-body stack">
            <Field label="Condition" hint={form.condition ? CONDITIONS.find(([v]) => v === form.condition)?.[2] : 'New products aren’t on Buy Used. Choose a grade to sell it as used.'}>
              <select className="select" value={form.condition} onChange={set('condition')}>
                <option value="">New</option>
                {CONDITIONS.map(([v, l]) => <option key={v} value={v}>Used · {l}</option>)}
              </select>
            </Field>
            {form.condition && (
              <Field label="Condition notes" hint="What this item comes with and any marks, shown on its page. Max 500 characters.">
                <textarea className="textarea" style={{ minHeight: 80 }} maxLength={500} value={form.condition_note} onChange={set('condition_note')} placeholder="e.g. Light scratches on the lid. Box and one controller included." />
              </Field>
            )}
            {form.condition && <span className="muted" style={{ fontSize: 12.5 }}>Listed on <a className="linkish" href="/buy-used" target="_blank" rel="noopener noreferrer">Buy Used</a> while published.</span>}
            {/* A suggestion, never applied on its own: the stock stays whatever the owner sets. */}
            {form.condition && !form.variable && form.track_stock && String(form.stock_quantity) !== '1' && (
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Selling a single item? A stock of 1 means it can’t be sold twice.</span>
                <Button size="sm" onClick={() => setForm((f) => ({ ...f, stock_quantity: '1' }))}>Set stock to 1</Button>
              </div>
            )}
          </section>
          <section className="surface surface-body stack">
            <Field label="Brand" hint={<a className="linkish" href="#/brands">Manage brands</a>}>
              <select className="select" value={form.brand_id} onChange={set('brand_id')}>
                <option value="">No brand</option>
                {[...lists.brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Categories" hint="The first one ticked is the main category.">
              {lists.ready ? <CategoryPicker categories={lists.categories} value={form.category_ids} onChange={set('category_ids')} maxHeight={260} /> : <SkeletonRows rows={3} />}
            </Field>
          </section>
          <section className="surface surface-body stack">
            <Field label="Recommended add-ons" hint={`Shown as “Complete your setup” on this product’s page and in the cart. Customers add them only if they choose to. Up to ${MAX_ADDONS}, in this order.`}>
              <ProductPicker value={form.addon_ids} onChange={(ids) => set('addon_ids')(ids.map(Number).filter((id) => id !== Number(product?.id)).slice(0, MAX_ADDONS))} placeholder="Search products to recommend…" />
            </Field>
          </section>
          {!isNew && !archived && <Button variant="danger" icon="trash" onClick={archive}>Archive</Button>}
        </div>
      </div>

      <div className="savebar">
        {dirty ? <><span className="dirty-dot" /><span className="t2">Unsaved changes</span></> : <span className="muted">{isNew ? 'New product' : `Saved · last change ${ago(product?.updated_at)}`}</span>}
        <span className="grow" />
        {dirty && !isNew && <Button variant="quiet" onClick={() => setForm(initial)}>Discard</Button>}
        {isNew && <Button onClick={() => save('draft')} loading={saving} disabled={!form.name.trim()}>Save draft</Button>}
        <Button variant="primary" icon="check" loading={saving} disabled={!form.name.trim() || (!dirty && !isNew) || archived} onClick={() => save(isNew ? 'published' : undefined)}>{isNew ? 'Publish' : 'Save changes'}</Button>
      </div>
    </>
  );
}
