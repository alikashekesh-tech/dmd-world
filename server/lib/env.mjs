import { readFileSync, existsSync, writeFileSync } from 'node:fs';

/** Minimal .env loader: KEY=value lines, # comments, optional quotes. Existing process.env values win. */
export function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return out;
}

/** Set (or add) KEY=value in an .env file without touching other lines. */
export function setEnvValue(file, key, value) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`; else lines.push(`${key}=${value}`);
  const NL = String.fromCharCode(10);
  writeFileSync(file, lines.join(NL).replace(/\n*$/, NL), { mode: 0o600 }); // secrets file: owner-only on POSIX
}
