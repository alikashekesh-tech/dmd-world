import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, ReturnIcon } from '../common/icons.jsx';
import { useDialog } from '../../lib/useDialog.js';
import { cameraProblem, canViewInRoom, clampScale, MAX_SCALE, MIN_SCALE, pinch } from '../../lib/roomView.js';
import s from './RoomView.module.css';

const CameraIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const START = { x: 0, y: 0, scale: 1, turn: 0 };

/** The full-screen camera with the product photo on top. One finger drags it, two resize and turn it.
    Product photos sit on white, so by default the photo is multiplied onto the picture: white drops out and the product stays. */
function Room({ src, name, onClose }) {
  const panel = useDialog(true, onClose);
  const video = useRef(null);
  const [problem, setProblem] = useState(null);
  const [live, setLive] = useState(false);
  const [place, setPlace] = useState(START);
  const [blend, setBlend] = useState(true);
  const fingers = useRef(new Map()); // pointerId → {x, y}
  const base = useRef(null); // where the gesture started: the placement and the fingers then

  useEffect(() => {
    let stream = null;
    let gone = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((st) => {
        if (gone) { st.getTracks().forEach((t) => t.stop()); return; }
        stream = st;
        const v = video.current;
        v.srcObject = st;
        v.play().catch(() => {}); // autoPlay + muted + playsInline also start it on iOS
        setLive(true);
      })
      .catch((e) => { if (!gone) setProblem(cameraProblem(e)); });
    return () => { gone = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Whenever a finger goes down or lifts, the gesture starts again from where the product is now, so it never jumps.
  const rebase = (now) => { base.current = { place: now, pts: [...fingers.current.values()].map((p) => ({ ...p })) }; };
  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase(place);
  };
  const move = (e) => {
    if (!fingers.current.has(e.pointerId) || !base.current) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { place: from, pts } = base.current;
    const now = [...fingers.current.values()];
    if (now.length === 1 && pts.length === 1) {
      setPlace({ ...from, x: from.x + now[0].x - pts[0].x, y: from.y + now[0].y - pts[0].y });
    } else if (now.length >= 2 && pts.length >= 2) {
      const a = pts.slice(0, 2), b = now.slice(0, 2);
      const g = pinch(a, b);
      const mid = (q) => ({ x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 });
      const m0 = mid(a), m1 = mid(b);
      setPlace({ x: from.x + m1.x - m0.x, y: from.y + m1.y - m0.y, scale: clampScale(from.scale * g.scale), turn: from.turn + g.turn });
    }
  };
  const up = (e) => {
    if (!fingers.current.delete(e.pointerId)) return;
    setPlace((now) => { rebase(now); return now; });
  };

  return (
    <div ref={panel} className={s.room} role="dialog" aria-modal="true" aria-labelledby="room-title">
      <div className={s.view} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <video ref={video} className={s.camera} autoPlay muted playsInline aria-hidden />
        {live && (
          <img className={`${s.product} ${blend ? s.blend : ''}`} src={src} alt={`${name}, placed in your room`} draggable={false}
            style={{ transform: `translate(-50%, -50%) translate(${place.x}px, ${place.y}px) rotate(${place.turn}deg) scale(${place.scale})` }} />
        )}
      </div>

      <header className={s.top}>
        <div>
          <h2 id="room-title">View in your room</h2>
          <p>{problem ? 'Camera unavailable' : live ? 'Drag to move · pinch to resize and turn' : 'Opening the camera…'}</p>
        </div>
        <button type="button" className={s.round} onClick={onClose} aria-label="Close room view"><CloseIcon /></button>
      </header>

      {problem && (
        <div className={s.problem} role="alert">
          <p>{problem}</p>
          <button type="button" className="btn btn--primary" onClick={onClose}>Back to the product</button>
        </div>
      )}

      {live && (
        <footer className={s.bar}>
          <label className={s.size}>
            <span>Size</span>
            <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={place.scale} onChange={(e) => setPlace((p) => ({ ...p, scale: Number(e.target.value) }))} />
          </label>
          <button type="button" className={s.chip} aria-pressed={!blend} onClick={() => setBlend((b) => !b)}>{blend ? 'Show photo edges' : 'Hide white background'}</button>
          <button type="button" className={s.round} onClick={() => setPlace(START)} aria-label="Reset position and size"><ReturnIcon size={18} /></button>
        </footer>
      )}
    </div>
  );
}

/** The "View in your room" button over the product photo. Shown only on phones and tablets that can open the camera. */
export default function RoomView({ src, name, className }) {
  const [able] = useState(canViewInRoom);
  const [open, setOpen] = useState(false);
  if (!able || !src) return null;
  return (
    <>
      <button type="button" className={`${s.open} ${className || ''}`} onClick={() => setOpen(true)}><CameraIcon />View in your room</button>
      {open && createPortal(<Room src={src} name={name} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
