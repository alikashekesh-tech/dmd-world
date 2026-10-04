import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme.js';

/* The ink stage everything sits on: a slow-drifting glow and the site's dot grid. */
export default function Backdrop() {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 240) * 60;
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at ${30 + drift / 20}% 20%, rgba(47,107,255,0.22), transparent 70%), radial-gradient(ellipse 50% 50% at ${78 - drift / 30}% 95%, rgba(255,107,87,0.10), transparent 70%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(159,178,214,0.13) 1.2px, transparent 1.6px)',
          backgroundSize: '30px 30px',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 30%, transparent 85%)',
          maskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 30%, transparent 85%)',
        }}
      />
    </AbsoluteFill>
  );
}
