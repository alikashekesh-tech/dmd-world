import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Button, Icon, useUi } from '../../ui/kit.jsx';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX = 5 * 1024 * 1024;

/**
 * An image for a banner: drop or choose a file (uploaded at once), or paste an https:// address. Shows the image
 * large; with `focal` / `onFocal`, a click on it sets the point that stays in view when the image is cropped.
 */
export default function ImageDrop({ value, onChange, focal, onFocal, aspect = '16 / 7', hint, compact }) {
  const { fail } = useUi();
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);
  const [size, setSize] = useState(null);
  const [broken, setBroken] = useState(false);

  const upload = async (f) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) { fail(new Error('Upload a JPEG, PNG, WebP or GIF image.')); return; }
    if (f.size > MAX) { fail(new Error('Images can be at most 5 MB.')); return; }
    setBusy(true);
    try { setBroken(false); onChange((await api.upload(f)).url); } catch (e) { fail(e); }
    setBusy(false);
  };
  const drop = (e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); };
  const pick = (e) => {
    if (!onFocal) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    onFocal(`${x}% ${y}%`);
  };
  const [fx, fy] = (focal || '50% 50%').split(' ');

  return (
    <div className={`idrop ${compact ? 'compact' : ''}`}>
      <input ref={file} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {value && !broken ? (
        <div className="idrop-shot" style={{ aspectRatio: aspect }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
          <button type="button" className={`idrop-img ${onFocal ? 'focal' : ''}`} onClick={pick} aria-label={onFocal ? 'Click the part of the image that must stay in view' : 'Image'} tabIndex={onFocal ? 0 : -1}>
            <img src={value} alt="" style={{ objectPosition: focal || '50% 50%' }} referrerPolicy="no-referrer"
              onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} onError={() => setBroken(true)} />
            {onFocal && <span className="idrop-dot" style={{ left: fx, top: fy }} aria-hidden="true" />}
          </button>
          {over && <div className="idrop-over"><Icon name="upload" />Drop to replace</div>}
          {busy && <div className="idrop-over"><span className="spin" />Uploading…</div>}
          <div className="idrop-bar">
            <span className="mono">{size ? `${size[0]} × ${size[1]}` : ''}{onFocal ? ' · click to set the focal point' : ''}</span>
            <span className="row" style={{ gap: 6 }}>
              <Button size="sm" icon="upload" onClick={() => file.current?.click()} disabled={busy}>Replace</Button>
              <Button size="sm" variant="danger" icon="trash" onClick={() => { onChange(''); setSize(null); onFocal?.(null); }} aria-label="Remove image" />
            </span>
          </div>
        </div>
      ) : (
        <button type="button" className={`idrop-zone ${over ? 'over' : ''}`} style={{ aspectRatio: compact ? undefined : aspect }} onClick={() => file.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} disabled={busy}>
          {busy ? <span className="spin" /> : <Icon name={broken ? 'alert' : 'image'} size={compact ? 20 : 28} />}
          <b>{busy ? 'Uploading…' : broken ? 'This image can’t be loaded. Choose another.' : 'Drop an image here, or click to choose'}</b>
          <small>{hint || 'JPEG, PNG, WebP or GIF · up to 5 MB'}</small>
        </button>
      )}
      <div className="idrop-url">
        {paste ? (
          <input className="input mono" autoFocus value={value || ''} placeholder="https://…" onChange={(e) => { setBroken(false); onChange(e.target.value); }} onBlur={() => setPaste(false)} aria-label="Image address" />
        ) : (
          <button type="button" className="linkish" onClick={() => setPaste(true)}><Icon name="link" size={13} />{value ? 'Edit image address' : 'Or paste an image address'}</button>
        )}
      </div>
    </div>
  );
}
