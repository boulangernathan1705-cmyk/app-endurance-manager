import {readFile, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workerPath = root + 'server/worker.mjs';
const worker = await readFile(workerPath, 'utf8');
const marker = 'async function eventById(env, eventId) {';
const split = worker.indexOf(marker);
if (split < 0) throw new Error('worker split marker not found');

const firstNewline = worker.indexOf('\n');
if (firstNewline < 0 || !worker.startsWith("import {CATEGORIES, EVENT_TYPE_IDS as EVENT_TYPES, CIRCUIT_IDS as CIRCUITS, CARS} from '../shared/catalog.mjs';")) {
  throw new Error('unexpected worker catalog import');
}

const prefix = worker.slice(firstNewline + 1, split);
const core = `import {CATEGORIES, EVENT_TYPE_IDS as EVENT_TYPES, CIRCUIT_IDS as CIRCUITS, CARS} from '../shared/catalog.mjs';\n${prefix}\nexport {\n  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_GUEST, COOKIE_STATE, DAY, HttpError, fail, now, id, token, hash, cookie,\n  setCookie, json, redirect, origin, requireDiscord, administrators, publicUser, requireRole, identity, owned, personal,\n  registrationSelect, registrationParticipant, body, rateLimit, cleanup, text, parisTimestamp, validateEvent, validateRegistration\n};\n`;

const imports = `import {\n  LEGACY_CAR_ALIASES, COOKIE_SESSION, COOKIE_GUEST, COOKIE_STATE, DAY, HttpError, fail, now, id, token, hash, cookie,\n  setCookie, json, redirect, origin, requireDiscord, administrators, publicUser, requireRole, identity, owned, personal,\n  registrationSelect, registrationParticipant, body, rateLimit, cleanup, text, validateEvent, validateRegistration\n} from './core.mjs';\n`;

await writeFile(root + 'server/core.mjs', core);
await writeFile(workerPath, imports + worker.slice(split));
await rm(root + 'scripts/refactor-worker-core.mjs', {force:true});
await rm(root + '.github/workflows/refactor-worker-core.yml', {force:true});
console.log('Worker core extracted.');
