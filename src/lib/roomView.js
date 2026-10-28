/* "View in your room": the product photo laid over the phone's back camera, moved with one finger and resized
   or turned with two. No 3D models exist for the catalogue, so this works from the photos every product has. */

/** Phones and tablets with a camera the page may ask for: HTTPS (or localhost), getUserMedia, and a touch screen.
    A laptop's webcam faces the shopper, not the room, so a mouse-driven screen doesn't get the button. */
export function canViewInRoom(env = typeof window === 'undefined' ? {} : {
  secure: window.isSecureContext,
  camera: typeof navigator.mediaDevices?.getUserMedia === 'function',
  touch: window.matchMedia?.('(pointer: coarse)').matches,
}) {
  return !!(env.secure && env.camera && env.touch);
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
export const clampScale = (v) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

/** Two fingers from where they went down (`a`) to where they are now (`b`), each a pair of {x, y}:
    how much bigger the gap got and how far the line between them turned (degrees, clockwise). */
export function pinch(a, b) {
  const gap = ([p, q]) => Math.hypot(q.x - p.x, q.y - p.y);
  const angle = ([p, q]) => Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
  const from = gap(a);
  let turn = angle(b) - angle(a);
  if (turn > 180) turn -= 360;
  if (turn < -180) turn += 360;
  return { scale: from > 0 ? gap(b) / from : 1, turn };
}

/** The camera error a shopper sees, in words they can act on. */
export function cameraProblem(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (e?.name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not be opened on this device.';
}
