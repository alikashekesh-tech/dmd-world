import { useEffect, useRef } from 'react';

/* Shared behaviour for drawers and sheets (cart, mobile menu, filters): Escape closes, focus moves into the panel
   and stays there (Tab wraps), focus returns to whatever opened it, and the page behind stops scrolling.
   The scroll lock is counted, so two panels (or a panel and the categories menu) opening and closing in any order
   never leave the page stuck. It stops the page where it is and pads the page by the scrollbar it hides, so nothing
   shifts sideways. Only the body is locked (the browser applies it to the whole page): locking <html> as well would
   make the body (overflow-x: hidden) its own scroller, and the sticky header would leave the screen. */
let locks = 0;
let saved = null;
function lock() {
  if (locks++ > 0) return;
  const { body, documentElement: root } = document;
  const bar = window.innerWidth - root.clientWidth;
  saved = { overflow: body.style.overflow, pad: body.style.paddingRight };
  if (bar > 0) body.style.paddingRight = `${(parseFloat(getComputedStyle(body).paddingRight) || 0) + bar}px`;
  body.style.overflow = 'hidden';
}
function unlock() {
  if (locks === 0 || --locks > 0) return;
  document.body.style.overflow = saved.overflow;
  document.body.style.paddingRight = saved.pad;
}

/** Stops the page behind from scrolling while `active` (shared with the drawers, so the locks never conflict). */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lock();
    return unlock;
  }, [active]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(open, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    lock();
    const panel = ref.current;
    // After the opening transition starts, focus the first control (usually Close) unless something inside asked for focus.
    const t = setTimeout(() => { if (panel && !panel.contains(document.activeElement)) panel.querySelector(FOCUSABLE)?.focus({ preventScroll: true }); }, 30);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current?.(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      unlock();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
