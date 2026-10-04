import { continueRender, delayRender, staticFile } from 'remotion';

/* Same palette and type as the site: ink stages, mono HUD labels, Sora headlines.
   Fonts are bundled in public/fonts (variable fonts, latin subset) so rendering never needs the network. */
const FONTS = [
  ['DMD Sora', 'Sora.woff2', '600 800'],
  ['DMD Inter', 'Inter.woff2', '400 600'],
  ['DMD Mono', 'JetBrainsMono.woff2', '500 700'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('Loading fonts');
  Promise.all(FONTS.map(([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight });
    document.fonts.add(face);
    return face.load();
  })).then(() => continueRender(handle), (err) => { console.error(err); continueRender(handle); });
}

export const SORA = "'DMD Sora', system-ui, sans-serif";
export const INTER = "'DMD Inter', system-ui, sans-serif";
export const MONO = "'DMD Mono', ui-monospace, monospace";

export const C = {
  ink: '#060a13',
  ink2: '#0c1424',
  ink3: '#121c31',
  line: 'rgba(159, 178, 214, 0.16)',
  text: '#f4f7ff',
  text2: '#a7b4cf',
  muted: '#7d8db0',
  hud: '#8fb8ff',
  accent: '#2f6bff',
  amber: '#ffc23d',
  coral: '#ff6b57',
  led: '#3ccf6e',
};
