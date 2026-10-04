import { useEffect, useRef } from 'react';

/* Shared behaviour for drawers and sheets (cart, mobile menu, filters): Escape closes, focus moves into the panel
   and stays there (Tab wraps), focus returns to whatever opened it, and the page behind stops scrolling.
   The scroll lock is counted, so two panels opening and closing in any order never leave the page stuck. */
let locks = 0;
let saved = '';
function lock() { if (locks++ === 0) { saved = document.body.style.overflow; document.body.style.overflow = 'hidden'; } }
function unlock() { if (locks > 0 && --locks === 0) document.body.style.overflow = saved; }

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
