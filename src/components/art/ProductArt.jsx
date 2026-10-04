import { useId } from 'react';
import { COLORS } from '../../data/meta.js';
import { darken, lighten, mix } from './color.js';
import * as S1 from './shapes1.jsx';
import * as S2 from './shapes2.jsx';

const DEFAULT = '#1b1e26';

const DRAW = {
  chair: S1.Chair, desk: S1.Desk, 'pad-ps': S1.PadPS, 'pad-xbox': S1.PadXbox, 'pad-pro': S1.PadPro, joycon: S1.JoyCon,
  headset: S1.Headset, keyboard: S1.Keyboard, mouse: S1.Mouse, mic: S1.Mic,
  monitor: S2.Monitor, 'console-ps5': S2.ConsolePS5, 'console-ps4': S2.ConsolePS4, 'console-xbox': S2.ConsoleXbox, 'console-switch': S2.ConsoleSwitch,
  game: S2.Game, ssd: S2.SSD, dock: S2.Dock, remote: S2.Remote, portal: S2.Portal, gpu: S2.GPU, ram: S2.RAM, psu: S2.PSU, aio: S2.AIO,
  mobo: S2.Mobo, case: S2.Case, tower: S2.Tower, laptop: S2.Laptop, speaker: S2.Speaker, webcam: S2.Webcam, stand: S2.Stand, dongle: S2.Dongle,
  light: S2.Light, arm: S2.Arm, bag: S2.Bag, wheel: S2.Wheel, pedals: S2.Pedals, shifter: S2.Shifter, 'pad-mat': S2.PadMat, setup: S2.Setup,
};

/**
 * Procedural product render. `art` = { t: type, a: accent, ...options }.
 * `color` = key from COLORS (or hex). `view` 0..3 produces gallery variations.
 */
export default function ProductArt({ art = {}, color, wired = false, view = 0, title, className }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `a${raw}`;
  const Draw = DRAW[art.t] || S1.Chair;
  const body = (color && COLORS[color]?.hex) || (color && color.startsWith('#') ? color : null) || (art.c && COLORS[art.c]?.hex) || DEFAULT;
  const a = art.a || '#3d8bff';
  const ctx = { c: body, c2: darken(body, .22), c3: darken(body, .45), cl: lighten(body, .3), a, id, o: art, wired };

  const transform = [
    'translate(0 0)',
    'translate(200 150) scale(1.55) translate(-200 -165)',
    'translate(200 154) rotate(-7) scale(.86) translate(-200 -150)',
    'translate(200 146) scale(.74) translate(-200 -150)',
  ][view % 4];
  const glowAt = [[200, 150, 150], [270, 120, 170], [150, 160, 150], [200, 160, 190]][view % 4];

  return (
    <svg className={className} viewBox="0 0 400 300" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={a} stopOpacity=".2" /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lighten(body, .1)} /><stop offset="1" stopColor={darken(body, .18)} /></linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lighten(body, .08)} /><stop offset="1" stopColor={darken(body, .3)} /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={darken(body, .2)} /><stop offset=".5" stopColor={lighten(body, .1)} /><stop offset="1" stopColor={darken(body, .25)} /></linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lighten(body, .22)} /><stop offset="1" stopColor={darken(body, .1)} /></linearGradient>
        <linearGradient id={`${id}scr`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix('#0b1020', a, .28)} /><stop offset=".6" stopColor="#0a0f1e" /><stop offset="1" stopColor="#060914" /></linearGradient>
        <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity=".1" /></linearGradient>
        <filter id="blur6" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id={`${id}sh`} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <circle cx={glowAt[0]} cy={glowAt[1]} r={glowAt[2]} fill={`url(#${id}glow)`} />
      {view === 3 && <g stroke="#ffffff" strokeOpacity=".05">{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${190 + i * 14} H400`} />)}{Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${i * 25} 190 L${200 + (i * 25 - 200) * 2.2} 300`} />)}</g>}
      <ellipse cx="200" cy="282" rx="104" ry="9" fill="#000" opacity=".5" filter={`url(#${id}sh)`} />
      <g transform={transform}><Draw {...ctx} /></g>
    </svg>
  );
}
