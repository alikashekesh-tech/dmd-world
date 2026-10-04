// Generates a calm ambient track (public/music.wav) exactly as long as the video.
// Warm pad chords (Dmaj9 – Bm9 – Gmaj9 – Asus), a soft sine bass, a Karplus-Strong plucked arpeggio,
// sparse bell tones, and a Freeverb-style reverb. No samples, nothing to license.
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline } from '../src/timeline.mjs';
import { FPS } from '../src/geometry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'shots', 'manifest.json'), 'utf8'));
const { total } = buildTimeline(manifest);
const SECONDS = total / FPS + 0.5;

const SR = 44100;
const N = Math.ceil(SECONDS * SR);
const L = new Float32Array(N), R = new Float32Array(N);        // dry mix
const SL = new Float32Array(N), SRb = new Float32Array(N);     // reverb send

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const CHORD = BAR * 2;
const CHORDS = [
  { bass: 38, pad: [50, 57, 61, 64, 66], arp: [62, 66, 69, 73, 74, 76] }, // Dmaj9
  { bass: 35, pad: [47, 54, 57, 61, 62], arp: [59, 62, 66, 69, 71, 73] }, // Bm9
  { bass: 31, pad: [43, 50, 54, 59, 62], arp: [59, 62, 66, 67, 69, 74] }, // Gmaj9
  { bass: 33, pad: [45, 52, 57, 59, 64], arp: [57, 61, 64, 66, 69, 71] }, // Asus2 / A6
];

// Soft, slightly saw-like single-cycle wave for the pad.
const TABLE = 4096;
const padWave = new Float32Array(TABLE + 1);
for (let i = 0; i <= TABLE; i++) { let v = 0; for (let k = 1; k <= 7; k++) v += Math.sin((2 * Math.PI * k * i) / TABLE) / k ** 1.7; padWave[i] = v * 0.7; }
const look = (tbl, ph) => { const x = ph * TABLE; const i = x | 0; const f = x - i; return tbl[i] + (tbl[i + 1] - tbl[i]) * f; };

/* ── pad ─────────────────────────────────────────────────────────────── */
const chordsCount = Math.ceil(SECONDS / CHORD) + 1;
for (let c = 0; c < chordsCount; c++) {
  const ch = CHORDS[c % 4];
  const t0 = c * CHORD;
  const atk = 2.2, rel = 3.4;
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t0 + CHORD + rel) * SR));
  for (const note of ch.pad) {
    for (const [det, pan] of [[-0.06, 0.25], [0.06, 0.75]]) { // two detuned voices, spread L/R
      const f = mtof(note + det);
      let ph = rand();
      let lp = 0;
      const gain = 0.05 * (note < 50 ? 0.8 : 1);
      for (let s = s0; s < s1; s++) {
        const t = s / SR - t0;
        let env = t < atk ? Math.sin((t / atk) * Math.PI / 2) ** 2 : 1;
        if (t > CHORD) env *= Math.max(0, 1 - (t - CHORD) / rel) ** 2;
        ph += f / SR; if (ph >= 1) ph -= 1;
        const raw = look(padWave, ph);
        lp += (raw - lp) * 0.22; // gentle low-pass for warmth
        const v = lp * env * gain * (0.9 + 0.1 * Math.sin(2 * Math.PI * 0.11 * (s / SR) + note));
        L[s] += v * (1 - pan); R[s] += v * pan;
        SL[s] += v * 0.35 * (1 - pan); SRb[s] += v * 0.35 * pan;
      }
    }
  }
}

/* ── bass ────────────────────────────────────────────────────────────── */
const BASS_IN = 7.5;
for (let b = 0; b * BAR < SECONDS; b++) {
  const t0 = b * BAR;
  if (t0 < BASS_IN) continue;
  const ch = CHORDS[Math.floor(t0 / CHORD) % 4];
  const f = mtof(ch.bass + 12);
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t0 + BAR + 0.6) * SR));
  let ph = 0;
  for (let s = s0; s < s1; s++) {
    const t = s / SR - t0;
    const env = Math.min(1, t / 0.08) * (0.55 + 0.45 * Math.exp(-t / 1.4)) * (t > BAR ? Math.max(0, 1 - (t - BAR) / 0.6) : 1);
    ph += f / SR;
    const v = (Math.sin(2 * Math.PI * ph) + 0.22 * Math.sin(4 * Math.PI * ph)) * env * 0.12;
    L[s] += v; R[s] += v;
  }
}

/* ── plucked arpeggio (Karplus-Strong) ───────────────────────────────── */
function pluck(t0, midi, vel, pan) {
  const f = mtof(midi);
  const n = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { const w = rand() * 2 - 1; prev = prev * 0.55 + w * 0.45; buf[i] = prev * vel; } // soft, filtered excitation
  const len = Math.floor(2.6 * SR);
  const s0 = Math.floor(t0 * SR);
  const decay = 0.9965 - (f / 20000);
  let i = 0, lp = 0;
  for (let k = 0; k < len && s0 + k < N; k++) {
    const a = buf[i], b = buf[(i + 1) % n];
    buf[i] = decay * 0.5 * (a + b);
    i = (i + 1) % n;
    lp += (a - lp) * 0.5;
    const env = k < 40 ? k / 40 : 1;
    const v = lp * env * 0.32;
    L[s0 + k] += v * (1 - pan); R[s0 + k] += v * pan;
    SL[s0 + k] += v * 0.9 * (1 - pan); SRb[s0 + k] += v * 0.9 * pan;
  }
}
const ARP_IN = 9.5, ARP_FULL = 32, ARP_OUT = SECONDS - 14;
const PATTERN = [0, 2, 4, 5, 3, 4, 2, 1];
const step = BEAT / 2;
for (let k = 0; k * step < SECONDS; k++) {
  const t = k * step;
  if (t < ARP_IN || t > ARP_OUT) continue;
  const sparse = t < ARP_FULL || t > ARP_OUT - 10;
  const onBeat = k % 2 === 0;
  if (sparse && !onBeat) continue;
  if (!onBeat && rand() < 0.22) continue;
  const ch = CHORDS[Math.floor(t / CHORD) % 4];
  const note = ch.arp[PATTERN[k % PATTERN.length]];
  const vel = (k % 8 === 0 ? 0.85 : 0.55 + rand() * 0.2) * (sparse ? 0.8 : 1);
  pluck(t + (rand() - 0.5) * 0.012, note, vel, 0.3 + (k % 4) * 0.13);
}

/* ── bells: one soft chime at the top of most chord changes ──────────── */
for (let c = 2; c < chordsCount; c++) {
  const t0 = c * CHORD + BEAT * 2;
  if (t0 > SECONDS - 6 || rand() < 0.3) continue;
  const ch = CHORDS[c % 4];
  const f = mtof(ch.arp[5] + 12);
  const s0 = Math.floor(t0 * SR), len = Math.floor(4 * SR);
  const pan = 0.25 + rand() * 0.5;
  for (let k = 0; k < len && s0 + k < N; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / 1.1);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.4)) * env * 0.035;
    L[s0 + k] += v * (1 - pan); R[s0 + k] += v * pan;
    SL[s0 + k] += v * 1.2; SRb[s0 + k] += v * 1.2;
  }
}

/* ── reverb (Freeverb) ───────────────────────────────────────────────── */
function freeverb(input, spread) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => ({ buf: new Float32Array(n + spread), i: 0, f: 0 }));
  const aps = [556, 441, 341, 225].map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
  const out = new Float32Array(input.length);
  const fb = 0.86, damp = 0.32, g = 0.015;
  for (let s = 0; s < input.length; s++) {
    const x = input[s] * g;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.f = y * (1 - damp) + c.f * damp;
      c.buf[c.i] = x + c.f * fb;
      if (++c.i >= c.buf.length) c.i = 0;
      acc += y;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = acc + b * 0.5;
      acc = b - acc;
      if (++a.i >= a.buf.length) a.i = 0;
    }
    out[s] = acc;
  }
  return out;
}
const WL = freeverb(SL, 0), WR = freeverb(SRb, 23);

/* ── master: mix, fades, soft limit, normalise ───────────────────────── */
const FADE_IN = 4, FADE_OUT = 6;
let peak = 0;
let dcL = 0, dcR = 0;
for (let s = 0; s < N; s++) {
  const t = s / SR;
  let l = L[s] + WL[s] * 3.2, r = R[s] + WR[s] * 3.2;
  dcL += (l - dcL) * 0.0005; dcR += (r - dcR) * 0.0005; // remove DC drift
  l -= dcL; r -= dcR;
  const fade = Math.min(1, t / FADE_IN) * Math.min(1, Math.max(0, (SECONDS - t) / FADE_OUT));
  L[s] = Math.tanh(l * 1.2) * fade;
  R[s] = Math.tanh(r * 1.2) * fade;
  peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
}
const norm = 0.7 / peak; // about -3 dBFS

const data = Buffer.alloc(N * 4);
for (let s = 0; s < N; s++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[s] * norm)) * 32767), s * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[s] * norm)) * 32767), s * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(data.length, 40);
writeFileSync(join(ROOT, 'public', 'music.wav'), Buffer.concat([header, data]));
console.log(`music.wav: ${SECONDS.toFixed(1)}s, video ${total} frames`);
