import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import manifest from '../public/shots/manifest.json';
import { buildTimeline, INTRO, OUTRO, XFADE } from './timeline.mjs';
import { BROWSER } from './geometry.mjs';
import { C, MONO } from './theme.js';
import Backdrop from './components/Backdrop.jsx';
import Intro from './components/Intro.jsx';
import Outro from './components/Outro.jsx';
import ChapterView from './components/ChapterView.jsx';

export const TIMELINE = buildTimeline(manifest);

function FadeIn({ children }) {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(f, [0, XFADE], [0, 1], { extrapolateRight: 'clamp' }) }}>{children}</AbsoluteFill>;
}

/* Chapter progress under the window, like a video player's chapter marks. */
function Progress() {
  const f = useCurrentFrame();
  const { chapters, outroStart } = TIMELINE;
  const span = outroStart - INTRO;
  const o = interpolate(f, [INTRO - 10, INTRO + 10, outroStart - 10, outroStart + 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0) return null;
  const y = BROWSER.y + BROWSER.h + 16;
  return (
    <div style={{ position: 'absolute', left: BROWSER.x, top: y, width: BROWSER.w, height: 6, display: 'flex', gap: 4, opacity: o }}>
      {chapters.map((ch) => {
        const p = Math.max(0, Math.min(1, (f - ch.start) / ch.duration));
        return (
          <div key={ch.id} style={{ flex: ch.duration / span, height: '100%', borderRadius: 2, background: 'rgba(159,178,214,0.16)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: p > 0 && p < 1 ? C.amber : C.hud, opacity: p >= 1 ? 0.55 : 1 }} />
          </div>
        );
      })}
    </div>
  );
}

export default function Showcase() {
  const { chapters, outroStart, total } = TIMELINE;
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: MONO }}>
      <Backdrop />
      <Audio src={staticFile('music.wav')} />
      <Sequence durationInFrames={INTRO + XFADE} name="Intro">
        <Intro chapters={chapters} total={INTRO + XFADE} videoTotal={total} />
      </Sequence>
      {chapters.map((ch) => (
        <Sequence key={ch.id} from={ch.start} durationInFrames={ch.duration + XFADE} name={ch.title}>
          <FadeIn><ChapterView ch={ch} manifest={manifest} count={chapters.length} /></FadeIn>
        </Sequence>
      ))}
      <Sequence from={outroStart} durationInFrames={OUTRO} name="Outro">
        <FadeIn><Outro total={OUTRO} /></FadeIn>
      </Sequence>
      <Progress />
    </AbsoluteFill>
  );
}

export const TOTAL = TIMELINE.total;
