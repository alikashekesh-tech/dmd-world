/* Small, safe JSON persistence for the server's own files (admin state, buyer sessions).
   Writes go to a temporary file first and are then renamed over the old one, so a crash or power cut mid-write
   never leaves a half-written file. A file that can't be parsed is kept aside and the server starts fresh. */
import { writeFileSync, renameSync, readFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';

export function writeJsonAtomic(file, data, { pretty = false } = {}) {
  const body = JSON.stringify(data, null, pretty ? 1 : 0);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 }); // owner-only on POSIX
  try { renameSync(tmp, file); }
  catch {
    // Windows can refuse the rename while another program (an antivirus scan) holds the file: write in place.
    writeFileSync(file, body, { mode: 0o600 });
    try { unlinkSync(tmp); } catch { /* already gone */ }
  }
}

export function readJson(file, fallback, warn = console.warn) {
  if (!existsSync(file)) return fallback;
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? v : fallback;
  } catch (e) {
    const aside = `${file}.corrupt-${Date.now()}`;
    try { copyFileSync(file, aside); } catch { /* best effort */ }
    warn(`[data] ${file} could not be read (${e.message}). A copy was kept at ${aside}; starting with empty data.`);
    return fallback;
  }
}
