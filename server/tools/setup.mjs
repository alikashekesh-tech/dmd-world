// Sets up server/.env: owner password hash and session secret. Optional --emulator wires the local test emulator.
// Usage: node tools/setup.mjs --password "Long-Passw0rd!"   [--emulator] [--buyer-secret]
// The password must meet shared/passwordPolicy.js: 8+ characters, upper and lower case, a number and a special character.
import { randomBytes } from 'node:crypto';
import { existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, setEnvValue } from '../lib/env.mjs';
import { hashPassword } from '../lib/auth.mjs';
import { passwordError } from '../../shared/passwordPolicy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', '.env');
if (!existsSync(FILE)) copyFileSync(join(HERE, '..', '.env.example'), FILE);
const env = loadEnv(FILE);
const args = process.argv.slice(2);
const pw = args[args.indexOf('--password') + 1];
if (args.includes('--password')) {
  const problem = passwordError(pw || '');
  if (problem) { console.error(problem); process.exit(1); }
  setEnvValue(FILE, 'OWNER_PASSWORD_HASH', hashPassword(pw));
  console.log('Owner password saved (as a hash).');
}
if (!env.SESSION_SECRET) { setEnvValue(FILE, 'SESSION_SECRET', randomBytes(32).toString('hex')); console.log('Session secret generated.'); }
if (args.includes('--buyer-secret') || args.includes('--emulator')) {
  if (!loadEnv(FILE).DMD_AUTH_SECRET) {
    const s = randomBytes(32).toString('hex');
    setEnvValue(FILE, 'DMD_AUTH_SECRET', s);
    if (args.includes('--buyer-secret')) console.log(`Buyer-auth secret generated. Put the same value in WordPress wp-config.php:\n  define('DMD_AUTH_SECRET', '${s}');`);
  } else if (args.includes('--buyer-secret')) console.log('DMD_AUTH_SECRET already set in server/.env (unchanged).');
  if (!loadEnv(FILE).STOREFRONT_URL) setEnvValue(FILE, 'STOREFRONT_URL', 'http://localhost:5173');
}
if (args.includes('--emulator')) {
  const key = `ck_emu_${randomBytes(8).toString('hex')}`, secret = `cs_emu_${randomBytes(12).toString('hex')}`;
  for (const [k, v] of Object.entries({ WOO_URL: 'http://localhost:8899', WOO_KEY: key, WOO_SECRET: secret, EMU_KEY: key, EMU_SECRET: secret, WOO_ENV: 'emulator', WOO_READ_ONLY: 'false' })) setEnvValue(FILE, k, v);
  console.log('Wired to the local test emulator (not your store).');
}
try { chmodSync(FILE, 0o600); } catch { /* Windows: rely on the user profile's permissions */ }
console.log(`Done: ${FILE}`);
