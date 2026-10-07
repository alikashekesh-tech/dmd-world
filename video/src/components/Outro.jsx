import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, SORA, INTER, MONO } from '../theme.js';
import Pixel from './Pixel.jsx';

const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/* The site signs off with "GG, thanks for playing", so the video does too. */
export default function Outro({ total }) {
  const f = useCurrentFrame();
  const a = (at) => interpolate(f, [at, at + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const fade = interpolate(f, [total - 40, total - 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const reveal = interpolate(f, [16, 44], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fade, textAlign: 'center' }}>
      <div style={{ opacity: a(4), transform: `translateY(${(1 - a(4)) * 20}px)`, padding: '10px 16px', borderRadius: 14, background: '#fff' }}>
        <Img src={staticFile('dmd-world-logo.png')} style={{ height: 50, width: 'auto' }} />
      </div>
      <div style={{ marginTop: 56, filter: 'drop-shadow(0 0 24px rgba(255,194,61,0.35))' }}>
        <Pixel text="GG" color={C.amber} width={300} reveal={reveal} />
      </div>
      <div style={{ marginTop: 48, opacity: a(40), fontFamily: SORA, fontWeight: 800, fontSize: 76, letterSpacing: '-0.04em', color: C.text }}>Thanks for watching.</div>
      <div style={{ marginTop: 18, opacity: a(52), fontFamily: INTER, fontSize: 28, color: C.text2 }}>Consoles, games and gaming gear, redesigned page by page.</div>
      <div style={{ marginTop: 40, opacity: a(64), display: 'flex', gap: 28, fontFamily: MONO, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted }}>
        <span style={{ color: C.hud }}>dmdworld.store</span><span>·</span><span>+961 70 903 900</span>
      </div>
    </AbsoluteFill>
  );
}
