import PlatformArt from '../landing/PlatformArt.jsx';
import { WORLD_ART } from '../landing/WorldArt.jsx';
import LineArt from './LineArt.jsx';

/* Picks the drawing for a category path: consoles get their animated platform drawing, sub-categories with a telling
   name ("Headphones", "Chairs and Tables") get the matching object, everything else falls back to its group's art. */
const GROUP = {
  'pc-parts': ['platform', 'pc'], playstation: ['platform', 'playstation'], 'nintendo-switch': ['platform', 'switch'], xbox: ['platform', 'xbox'],
  tablets: ['line', 'tablet'], laptops: ['world', 'laptop'], other: ['world', 'figure'], 'new-offers': ['line', 'tag'],
  marvo: ['line', 'keyboard'], onikuma: ['line', 'headset'], hyperx: ['line', 'headset'], logitech: ['line', 'mouse'], moxom: ['line', 'powerbank'],
  megavolt: ['line', 'chair'], razer: ['line', 'mouse'], 'e-yooso': ['line', 'keyboard'], fantech: ['line', 'keyboard'], xiaomi: ['world', 'speaker'],
};
const BY_NAME = [
  [/head|airpod/i, ['line', 'headset']], [/keyboard/i, ['line', 'keyboard']], [/mouse/i, ['line', 'mouse']], [/chair|table/i, ['line', 'chair']],
  [/monitor/i, ['line', 'monitor']], [/speaker|microphone/i, ['world', 'speaker']], [/retro/i, ['world', 'retro']], [/figure/i, ['world', 'figure']],
  [/phone|cable|adapter|socket|gadget/i, ['world', 'phone']], [/network/i, ['world', 'router']], [/watch/i, ['world', 'watch']], [/toy/i, ['world', 'car']],
  [/laptop/i, ['world', 'laptop']], [/power|ups/i, ['line', 'powerbank']], [/controller/i, ['line', 'controller']], [/game|card/i, ['line', 'shelf']],
  [/webcam|camera/i, ['line', 'monitor']], [/disk|flash|storage/i, ['line', 'powerbank']],
];

export function artFor(nodes) {
  const last = nodes[nodes.length - 1];
  if (nodes.length > 1) for (const [re, a] of BY_NAME) if (re.test(last.name)) return a;
  return GROUP[nodes[0].slug] || ['line', 'controller'];
}

export default function CategoryArt({ spec, className }) {
  const [kind, id] = spec;
  if (kind === 'platform') return <span className={className}><PlatformArt id={id} /></span>;
  if (kind === 'world') { const W = WORLD_ART[id]; return <span className={className}><W /></span>; }
  return <span className={className}><LineArt type={id} /></span>;
}
