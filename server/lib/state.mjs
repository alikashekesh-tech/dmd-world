import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readJson, writeJsonAtomic } from './files.mjs';

/* The few things WooCommerce has no place for, kept by this server in one JSON file:
   which categories are brands, sale campaigns, message read-state, notification read-state,
   the daily revenue target, and the owner's action log. */
const DEFAULTS = {
  brandCategoryIds: null,
  campaigns: [],
  messageReads: {},
  notificationsSeenAt: null,
  dismissed: [],
  dailyTarget: null,
  activity: [],
  revokedSessions: {},
};

export function createState(file, defaults = {}) {
  mkdirSync(dirname(file), { recursive: true });
  let data = { ...DEFAULTS, ...defaults, ...readJson(file, {}) };
  const persist = () => writeJsonAtomic(file, data, { pretty: true });
  persist(); // also records any new defaults (e.g. the message baseline) the first time they appear
  return {
    get: () => data,
    update(fn) { fn(data); persist(); return data; },
    log(type, text, ref = null) {
      data.activity.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), type, text, ref });
      data.activity = data.activity.slice(0, 300);
      persist();
    },
  };
}
