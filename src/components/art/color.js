const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
export const hexToRgb = (h) => { const s = h.replace('#', ''); const v = s.length === 3 ? s.split('').map((x) => x + x).join('') : s; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
export const rgbToHex = (r) => '#' + r.map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((x, i) => x + (B[i] - x) * t)); };
export const lighten = (h, t) => mix(h, '#ffffff', t);
export const darken = (h, t) => mix(h, '#000000', t);
export const luma = (h) => { const [r, g, b] = hexToRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export const isLight = (h) => luma(h) > 0.55;
