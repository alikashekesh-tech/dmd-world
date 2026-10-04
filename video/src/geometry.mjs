/* Shared by the capture script (Node) and the video (Remotion), so screenshots map 1:1 onto video pixels. */
export const FPS = 30;
export const VIDEO = { w: 1920, h: 1080 };

/* Desktop: the site is laid out at 1440 css px and rendered at 11/9 density, so 1440 css px = 1760 video px. */
export const BROWSER = { x: 80, y: 46, w: 1760, h: 988, bar: 48 };
export const DESK = { cssW: 1440, cssH: Math.round((BROWSER.h - BROWSER.bar) / (BROWSER.w / 1440)), dsf: BROWSER.w / 1440 };

/* Phone: a 390 css px wide page captured at 2× and shown at 400 px wide. */
export const PHONE = { x: 330, y: 88, w: 432, h: 904, bezel: 16, radius: 62 };
export const MOBILE = { cssW: 390, cssH: 844, dsf: 2, scale: (PHONE.w - PHONE.bezel * 2) / (390 * 2) };
