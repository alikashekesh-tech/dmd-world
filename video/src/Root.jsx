import { Composition } from 'remotion';
import Showcase, { TOTAL } from './Showcase.jsx';
import { FPS, VIDEO } from './geometry.mjs';

export const Root = () => (
  <Composition id="Showcase" component={Showcase} durationInFrames={TOTAL} fps={FPS} width={VIDEO.w} height={VIDEO.h} />
);
