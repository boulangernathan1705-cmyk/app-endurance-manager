import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../server/worker.mjs';
import {linkTestServer, setMember, ORGA_ROLE, DEV_COMMUNITY} from './fixtures/discord-server.mjs';
import {prepare, zones} from '../front/combos-analysis.mjs';
import {cleanSession, cleanService, cleanTrace, conditionOf, installerFor, LINK_PREFIX} from '../shared/combos.mjs';

const ROOT = 'https://site.example';
const MANAGER = '111111111111111111', NATHAN = '222222222222222222', LUCAS = '333333333333333333', GUEST = '444444444444444444';
const TEAM_ROLE = '900000000000000009';
const TRACK = 'Circuit de la Sarthe', CAR = 'Ferrari 499P';

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON');
    const files = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
    for (const name of files) this.db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const self = this;
    return {params:[], bind(...params) { if (params.length > 100) throw new Error('D1_ERROR: too many SQL variables'); this.params = params; return this; },
      async first() { return self.db.prepare(sql).get(...this.params) || null; },
      async all() { return {results:self.db.prepare(sql).all(...this.params)}; },
      async run() { const result = self.db.prepare(sql).run(...this.params); return {success:true, meta:{changes:Number(result.changes)}}; }};
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

function harness({module = true} = {}) {
  const DB = new D1();
  linkTestServer(DB.db);
  DB.db.prepare('INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,0)').run(DEV_COMMUNITY, TEAM_ROLE, JSON.stringify(['combos']));
  if (module) DB.db.prepare(`UPDATE communities SET modules=json_set(modules,'$.combos',json('true')) WHERE id=?`).run(DEV_COMMUNITY);
  const env = {DB, APP_ORIGIN:ROOT, DISCORD_CLIENT_ID:'app-id', DISCORD_CLIENT_SECRET:'test-only-secret', ADMIN_DISCORD_IDS:MANAGER, ASSETS:{fetch:async () => new Response('static')}};
  const cookies = new Map();
  const signIn = (userId, name, roles = []) => {
    DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(userId, name);
    const session = userId.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'b');
    DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha256(session), userId, 9_999_999_999);
    cookies.set(userId, session);
    setMember(DB.db, userId, roles);
  };
  async function req(path, method = 'GET', data, userId = null, headers = {}) {
    const all = {'CF-Connecting-IP':userId || 'guest', ...headers};
    if (userId) all.Cookie = `__Host-em_session=${cookies.get(userId)}`;
    if (method !== 'GET') { all.Origin = ROOT; all['Content-Type'] = 'application/json'; }
    const response = await worker.fetch(new Request(ROOT + path, {method, headers:all, body:method === 'GET' ? undefined : JSON.stringify(data || {})}), env);
    return {status:response.status, data:await response.json().catch(() => null)};
  }
  // The plugin: no cookie, no Origin, only the key.
  async function plugin(path, key, method = 'GET', data) {
    const response = await worker.fetch(new Request(ROOT + path, {method, headers:{Authorization:`Bearer ${key}`, 'CF-Connecting-IP':'plugin', 'Content-Type':'application/json'},
      body:method === 'GET' ? undefined : JSON.stringify(data)}), env);
    return {status:response.status, data:await response.json().catch(() => null)};
  }
  return {DB, env, signIn, req, plugin};
}
const sha256 = value => createHash('sha256').update(value).digest('hex');

const keyOf = code => code.split(' ')[2];
const wheel = (base, step = 0.1) => [base, base + step * 3, base - step * 4, base - step * 3].map(value => Math.round(value * 1000) / 1000);
// A session of `count` timed laps from `from`, with a stop after the in-lap `pitAt` and one slow lap.
function session({at, laps = 8, ve = 8.4, wear = 1.7, t = 210, rain = 0, compound = 'Medium', pitAt = null, slowLap = null, setup, sectors = false, light, track = 30}) {
  const list = [];
  for (let n = 1; n <= laps; n++) {
    const pit = n === 1 || n === pitAt || n === pitAt + 1;
    list.push({n, t:n === slowLap ? t * 1.2 : t + n * 0.05, top:330, fuel:ve * 0.82, ve, wear:wheel(wear), temp:[92, 95, 89, 90], brake:[480, 495, 410, 405],
      kpa:[171, 172, 166, 167], compound, track:track + n * 0.1, air:22, rain, wet:rain, invalid:false, pit, setup, light});
    // Sectors that add up to the lap: 30 %, 40 % and the rest.
    if (sectors) { const lap = list.at(-1); lap.s1 = Math.round(lap.t * 300) / 1000; lap.s2 = Math.round(lap.t * 400) / 1000; lap.s3 = Math.round((lap.t - lap.s1 - lap.s2) * 1000) / 1000; }
  }
  return {at, track:TRACK, car:CAR, class:'Hypercar', driver:'N. Boulanger', session:2, capacity:90, laps:list,
    stops:pitAt ? [{lap:pitAt, lane:62.5, stopped:27.3, fuel:40, ve:60, tyres:4, repair:false}] : [],
    service:{fuelRate:2.4, energyRate:3.1, connect:2, tyres4:22, tyres2:12, wing:6, brakes:95, driver:18}, game:{fuel:6.9, ve:8.4, ideal:90}};
}

test('a lap is sorted into dry, damp or rain by the higher of rain and wetness', () => {
  assert.equal(conditionOf(0, 0), 'dry');
  assert.equal(conditionOf(0, 0.2), 'damp');
  assert.equal(conditionOf(0.7, 0.1), 'rain');
});

test('a session is checked before it is kept: bounded numbers, one lap per number, no empty session', () => {
  const clean = cleanSession({...session({at:1_790_000_000_000}), laps:[{n:1, t:200, ve:150, wear:[1, 2, 3, 4]}, {n:1, t:201}, {n:2, t:-3}]});
  assert.equal(clean.laps.length, 1);
  assert.equal(clean.laps[0].ve, null);
  assert.throws(() => cleanSession({at:1_790_000_000_000, track:TRACK, car:CAR, laps:[], stops:[]}), /Aucun tour/);
  assert.throws(() => cleanSession({track:TRACK, car:CAR, laps:[], stops:[]}), /incomplète/);
});

test('the fiches combo stay closed until the module is on, then open only to the roles with the permission', async () => {
  const closed = harness({module:false});
  closed.signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  assert.equal((await closed.req('/api/combos', 'GET', null, NATHAN)).status, 404);
  assert.equal((await closed.req('/api/session', 'GET', null, NATHAN)).data.combos, false);

  const {req, signIn} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(GUEST, 'Invité');
  assert.equal((await req('/api/combos', 'GET', null, GUEST)).status, 403);
  assert.equal((await req('/api/combos/link', 'POST', {}, GUEST)).status, 403);
  assert.equal((await req('/api/session', 'GET', null, GUEST)).data.combos, false);
  assert.equal((await req('/api/combos', 'GET', null, NATHAN)).status, 200);
  assert.equal((await req('/api/session', 'GET', null, NATHAN)).data.combos, true);
});

test('only a platform manager turns the private module on', async () => {
  const {req, signIn, DB} = harness({module:false});
  signIn(LUCAS, 'Lucas', [ORGA_ROLE]);
  signIn(MANAGER, 'Gérant');
  assert.equal((await req('/api/community/modules', 'PATCH', {combos:true}, LUCAS)).status, 403);
  assert.equal((await req('/api/community/settings', 'GET', null, LUCAS)).data.modules.combosManager, false);
  assert.equal((await req('/api/community/modules', 'PATCH', {combos:true}, MANAGER)).status, 200);
  assert.equal(JSON.parse(DB.db.prepare('SELECT modules FROM communities WHERE id=?').get(DEV_COMMUNITY).modules).combos, true);
  assert.equal((await req('/api/community/settings', 'GET', null, LUCAS)).data.modules.combos, true);
});

test('the plugin sends sessions with the pilot’s key, once each, and stops when the key or the role is gone', async () => {
  const {req, signIn, plugin, DB} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  const link = await req('/api/combos/link', 'POST', {}, NATHAN);
  assert.equal(link.status, 201);
  assert.match(link.data.code, new RegExp(`^${LINK_PREFIX} ${ROOT} [a-f0-9]{64} ${LINK_PREFIX}$`));
  const key = keyOf(link.data.code);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM combo_links WHERE token_hash=?').get(key).n, 0, 'only the hash is kept');

  const community = DB.db.prepare('SELECT name FROM communities WHERE id=?').get(DEV_COMMUNITY).name;
  assert.deepEqual((await plugin('/api/combos/plugin/status', key)).data, {pilot:'Nathan', community});
  const sent = await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_790_000_000_000, pitAt:4}));
  assert.equal(sent.status, 201);
  assert.deepEqual(sent.data, {track:TRACK, car:CAR, laps:8, stops:1, created:true});
  assert.equal((await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_790_000_000_000, pitAt:4}))).data.created, false);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS n FROM combo_laps').get().n, 8);
  assert.equal((await plugin('/api/combos/plugin/session', key, 'POST', {track:TRACK})).status, 400);
  assert.ok((await req('/api/combos/link', 'GET', null, NATHAN)).data.lastSeen);

  // Lost the team role on Discord: the key is refused, the data stays.
  setMember(DB.db, NATHAN, []);
  assert.equal((await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_790_000_100_000}))).status, 403);
  setMember(DB.db, NATHAN, [TEAM_ROLE]);
  // A new code replaces the old one; removing it stops the plugin.
  const second = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  assert.equal((await plugin('/api/combos/plugin/status', key)).status, 401);
  assert.equal((await plugin('/api/combos/plugin/status', second)).status, 200);
  await req('/api/combos/link', 'DELETE', {}, NATHAN);
  assert.equal((await plugin('/api/combos/plugin/status', second)).status, 401);
  assert.equal((await plugin('/api/combos/plugin/status', 'nope')).status, 401);
});

test('the sheet gives each pilot his own numbers, per condition and compound, from clean laps only', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const lucas = keyOf((await req('/api/combos/link', 'POST', {}, LUCAS)).data.code);
  await plugin('/api/combos/plugin/session', nathan, 'POST', session({at:1_790_000_000_000, ve:8.5, wear:1.8, pitAt:4, slowLap:6}));
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_100_000_000, ve:8.3, wear:1.6, t:209}));
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_200_000_000, ve:7.6, wear:1.2, t:236, rain:0.8, compound:'Wet', laps:4}));
  await req('/api/combos/color', 'PUT', {color:'#B98CFF'}, NATHAN);
  assert.equal((await req('/api/combos/color', 'PUT', {color:'violet'}, NATHAN)).status, 400);

  const list = (await req('/api/combos', 'GET', null, NATHAN)).data.combos;
  assert.deepEqual(list.map(item => [item.track, item.car, item.sessions, item.drivers, item.laps]), [[TRACK, CAR, 3, 2, 20]]);

  const sheet = (await req(`/api/combos/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, 'GET', null, NATHAN)).data;
  assert.deepEqual(sheet.drivers.map(({name, color, me}) => [name, color, me]), [['Lucas', null, false], ['Nathan', '#b98cff', true]]);
  assert.deepEqual(sheet.sample, {laps:20, sessions:3, drivers:2, from:1_790_000_000_000, to:1_790_200_000_000});
  const dry = sheet.conditions.dry;
  // Nathan: 8 laps, minus the out-lap, the in-lap and the out-lap of his stop, minus the slow lap, minus lap 3: laps 2
  // and 3 make a stint too short to count, which keeps only its best lap, his best.
  const nathanDry = dry.drivers.find(item => item.id === NATHAN);
  assert.equal(nathanDry.laps, 3);
  assert.equal(nathanDry.ve, 8.5);
  assert.equal(nathanDry.fuel, 6.97);
  // The four tyres' wear per lap, averaged: what the plugin's practice banner compares.
  assert.equal(nathanDry.wear, 1.7);
  assert.ok(nathanDry.slope > 0, 'laps get slower along the stint');
  assert.equal(dry.drivers.find(item => item.id === LUCAS).laps, 7);
  assert.equal(dry.laps, 10);
  assert.deepEqual(Object.keys(dry.compounds), ['Medium']);
  assert.deepEqual(dry.compounds.Medium.drivers.find(item => item.id === NATHAN).wear, [1.8, 2.1, 1.4, 1.5]);
  assert.deepEqual(dry.compounds.Medium.drivers.find(item => item.id === NATHAN).temp, [92, 95, 89, 90]);
  assert.deepEqual(Object.keys(sheet.conditions.rain.compounds), ['Wet']);
  assert.equal(sheet.conditions.rain.drivers[0].ve, 7.6);
  assert.equal(sheet.conditions.damp.laps, 0);
  assert.deepEqual(sheet.pit, {stops:1, laneThrough:35.2, service:{fuelRate:2.4, energyRate:3.1, connect:2, tyres4:22, tyres2:12, wing:6, brakes:95, driver:18}, game:{fuel:6.9, ve:8.4, ideal:90}});
  assert.equal((await req('/api/combos/sheet?track=x', 'GET', null, NATHAN)).status, 400);
});

test('each lap keeps its sectors and setup: the sheet gives each pilot\'s sectors and narrows to one setup', async () => {
  const clean = cleanSession({...session({at:1_790_000_000_000}), laps:[{n:1, t:200, s1:60, s2:80, s3:60, setup:' Course\u0007 v2 '}, {n:2, t:200, s1:60, s2:80}, {n:3, t:200, setup:'Lemans\\HYMO 1.4.1 9X8EVO LM ER'}]});
  assert.deepEqual(clean.laps.map(({s1, s2, s3, setup}) => [s1, s2, s3, setup]), [[60, 80, 60, 'Course v2'], [null, null, null, ''], [null, null, null, 'HYMO 1.4.1 9X8EVO LM ER']], 'all three sectors or none, the setup without its folder');

  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const lucas = keyOf((await req('/api/combos/link', 'POST', {}, LUCAS)).data.code);
  await plugin('/api/combos/plugin/session', nathan, 'POST', session({at:1_790_000_000_000, setup:'Course v2', sectors:true}));
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_100_000_000, t:209, ve:8.1, setup:'Qualif', sectors:true}));
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_200_000_000, t:211, ve:8.6, setup:'Course v2'}));

  const base = `/api/combos/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const sheet = (await req(base, 'GET', null, NATHAN)).data;
  assert.equal(sheet.filters.setup, null);
  assert.deepEqual(sheet.setups.map(({name, laps, drivers}) => [name, laps, drivers.sort()]), [['Course v2', 16, [NATHAN, LUCAS].sort()], ['Qualif', 8, [LUCAS]]]);
  const mine = sheet.conditions.dry.drivers.find(item => item.id === NATHAN);
  // Clean laps 2 to 8: 210.1 to 210.4 s, sectors at 30 % and 40 %.
  assert.equal(mine.sectors.laps, 7);
  assert.deepEqual(mine.sectors.best, [63.03, 84.04, 63.03]);
  assert.equal(mine.sectors.avg[0], 63.075);
  // Lucas drove one session without sectors: only the laps that have them count.
  assert.equal(sheet.conditions.dry.drivers.find(item => item.id === LUCAS).sectors.laps, 7);

  const course = (await req(`${base}&setup=${encodeURIComponent('Course v2')}`, 'GET', null, NATHAN)).data;
  assert.equal(course.filters.setup, 'Course v2');
  assert.equal(course.setups.length, 2, 'every setup stays offered');
  const lucasCourse = course.conditions.dry.drivers.find(item => item.id === LUCAS);
  assert.equal(lucasCourse.ve, 8.6);
  assert.equal(lucasCourse.sectors, null);
  assert.equal((await req(`${base}&setup=Inconnu`, 'GET', null, NATHAN)).data.conditions.dry.laps, 0);

  const exported = (await req(`/api/combos/export?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, 'GET', null, NATHAN)).data;
  assert.deepEqual(Object.values((({s1, s2, s3, setup}) => ({s1, s2, s3, setup}))(exported.sessions[0].laps[1])), [63.03, 84.04, 63.03, 'Course v2']);
});

test('the sheet tells day laps from night laps and narrows to a track temperature', async () => {
  const clean = cleanSession({...session({at:1_790_000_000_000}), laps:[{n:1, t:200, light:0.42}, {n:2, t:200, light:1.5}, {n:3, t:200}]});
  assert.deepEqual(clean.laps.map(lap => lap.light), [0.42, null, null], 'daylight between 0 and 1, else unknown');
  assert.deepEqual(cleanService({repair:25, tyresAlong:0, driverRandom:2, bogus:3}), {repair:25, tyresAlong:0, driverRandom:2}, 'the game\'s other service times are kept');

  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const lucas = keyOf((await req('/api/combos/link', 'POST', {}, LUCAS)).data.code);
  await plugin('/api/combos/plugin/session', nathan, 'POST', session({at:1_790_000_000_000, light:0.93}));
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_100_000_000, light:0.08, track:20}));
  // An older plugin: no daylight.
  await plugin('/api/combos/plugin/session', nathan, 'POST', session({at:1_790_200_000_000}));

  const base = `/api/combos/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const ids = sheet => sheet.conditions.dry.drivers.map(item => item.id).sort();
  const all = (await req(base, 'GET', null, NATHAN)).data;
  assert.deepEqual(all.conditions.dry.moments, {day:7, night:7}, 'laps without daylight are neither');
  assert.equal(all.conditions.dry.laps, 21);
  assert.deepEqual(all.conditions.dry.compounds.Medium.trackTemp, [20.2, 30.8]);
  const night = (await req(`${base}&moment=night`, 'GET', null, NATHAN)).data;
  assert.equal(night.filters.moment, 'night');
  assert.deepEqual(ids(night), [LUCAS]);
  assert.deepEqual(night.conditions.dry.moments, {day:7, night:7}, 'the switch keeps both counts');
  assert.deepEqual(ids((await req(`${base}&moment=day`, 'GET', null, NATHAN)).data), [NATHAN]);
  assert.equal((await req(`${base}&moment=dusk`, 'GET', null, NATHAN)).data.filters.moment, null);
  const warm = (await req(`${base}&tmin=25`, 'GET', null, NATHAN)).data;
  assert.deepEqual([warm.filters.trackMin, warm.filters.trackMax, warm.conditions.dry.laps], [25, null, 14]);
  assert.deepEqual(ids(warm), [NATHAN]);
  assert.deepEqual(ids((await req(`${base}&tmin=15&tmax=25`, 'GET', null, NATHAN)).data), [LUCAS]);
  assert.equal((await req(`${base}&tmax=abc`, 'GET', null, NATHAN)).data.filters.trackMax, null);

  const exported = (await req(`/api/combos/export?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, 'GET', null, NATHAN)).data;
  assert.deepEqual(exported.sessions.map(item => item.laps[1].light), [0.93, 0.08, null]);
});

// A best lap point by point, as the plugin sends it: `points` samples, `speed` km/h all the way.
function trace(n, t, points = 100, speed = 200) {
  const list = (f) => Array.from({length:points}, (_, i) => f(i));
  return {n, t, time:list(i => i * t / points), dist:list(i => i * 40), x:list(i => Math.cos(i / points * 6.28) * 600), z:list(i => Math.sin(i / points * 6.28) * 600),
    speed:list(() => speed), throttle:list(() => 1), brake:list(() => 0), steer:list(() => 0), gear:list(() => 6), rideF:list(() => 30), rideR:list(() => 45),
    temp:[0, 1, 2, 3].map(() => list(() => 90)), slip:[0, 1, 2, 3].map(() => list(() => 0))};
}
const EXPERT = {samples:3000, tyreTemp:[88, 91, 86, 87], tyreTempMax:[104, 109, 99, 101], kpa:[171, 172, 166, 167], kpaMax:[176, 178, 170, 171], spread:[6, 5, 4, 3],
  spreadMin:[1, 0, 0, -1], brake:[420, 431, 360, 352], brakeMax:[812, 826, 690, 675], ride:[31, 32, 45, 46], rideMin:[18, 19, 33, 34], tyreLeft:[84, 83, 88, 89],
  oil:98, oilMax:104, water:84, waterMax:89};

test('a lap trace is kept only whole: every measure as long as the clock, within bounds', () => {
  assert.equal(cleanTrace(trace(5, 210)).speed.length, 100);
  assert.equal(cleanTrace({...trace(5, 210), speed:[1, 2, 3]}), null);
  assert.equal(cleanTrace({...trace(5, 210), slip:[[0]]}), null);
  assert.equal(cleanTrace(trace(5, 210, 20)), null, 'too short to be a lap');
  assert.equal(cleanTrace({...trace(5, 210), speed:Array(100).fill(900)}).speed[0], 0, 'an impossible speed is not kept');
});

test('the lap is compared stretch by stretch, 450 m each, the last one shorter', () => {
  // 100 points 40 m apart: 3960 m, so 8 stretches of 450 m and one of 360 m.
  const mine = prepare(trace(5, 99)), his = prepare({...trace(4, 99), time:trace(4, 99).time.map(t => t * 0.99)});
  const legs = zones(mine, his);
  assert.deepEqual(legs.map(leg => leg.to - leg.from), [450, 450, 450, 450, 450, 450, 450, 450, 360]);
  assert.ok(legs.every(leg => leg.gap > 0), 'slower everywhere');
  assert.equal(Math.round(legs.reduce((sum, leg) => sum + leg.gap, 0) * 100) / 100, 0.98);
  // The first samples can still read the end of the previous lap: they count from the line.
  assert.equal(prepare({...trace(5, 99), dist:[3990, ...trace(5, 99).dist.slice(1)]}).dist[0], 0);
});

test('« Mon analyse »: each session wheel by wheel and its best lap on the map, for the whole team', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const lucas = keyOf((await req('/api/combos/link', 'POST', {}, LUCAS)).data.code);
  await plugin('/api/combos/plugin/session', nathan, 'POST', {...session({at:1_790_000_000_000}), expert:EXPERT, trace:trace(5, 210.2)});
  await plugin('/api/combos/plugin/session', lucas, 'POST', {...session({at:1_790_100_000_000, t:209}), trace:trace(4, 209.1, 120, 210)});
  // An older plugin: no measures, no trace.
  await plugin('/api/combos/plugin/session', lucas, 'POST', session({at:1_790_200_000_000}));

  const query = `track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const list = (await req(`/api/combos/analysis?${query}`, 'GET', null, NATHAN)).data.sessions;
  assert.deepEqual(list.map(item => [item.name, item.mine, item.expert, item.trace]),
    [['Lucas', false, false, null], ['Lucas', false, false, {lap:4, time:209.1}], ['Nathan', true, true, {lap:5, time:210.2}]]);

  const mine = (await req(`/api/combos/analysis/session?id=${list[2].id}`, 'GET', null, NATHAN)).data;
  assert.equal(mine.session.name, 'Nathan');
  assert.deepEqual(mine.expert.tyreTemp, [88, 91, 86, 87]);
  assert.equal(mine.expert.oilMax, 104);
  assert.equal(mine.laps.count, 7);
  assert.equal(mine.trace.lap, 5);
  assert.equal(mine.trace.lapTime, 210.2);
  assert.equal(mine.trace.time.length, 100);
  assert.equal(mine.trace.dist[99], 3960);
  // A teammate's session opens too: the comparison is the point.
  const his = (await req(`/api/combos/analysis/session?id=${list[1].id}`, 'GET', null, NATHAN)).data;
  assert.equal(his.expert, null);
  assert.equal(his.trace.speed[0], 210);
  assert.equal((await req('/api/combos/analysis/session?id=nope', 'GET', null, NATHAN)).status, 404);
  assert.equal((await req(`/api/combos/analysis?${query}`, 'GET', null, null)).status, 401);
  // The export carries the measures; a session sent twice keeps one trace.
  const exported = (await req(`/api/combos/export?${query}`, 'GET', null, NATHAN)).data;
  assert.deepEqual(exported.sessions.find(item => item.pilot === 'Nathan').expert.kpaMax, [176, 178, 170, 171]);
  assert.equal((await plugin('/api/combos/plugin/session', nathan, 'POST', {...session({at:1_790_000_000_000}), expert:EXPERT, trace:trace(5, 210.2)})).data.created, false);
});

test('a pilot takes a test lap out of the sheet and puts it back; only he or an admin can', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  await plugin('/api/combos/plugin/session', nathan, 'POST', session({at:1_790_000_000_000, laps:5}));
  const query = `track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const sheetLaps = async () => (await req(`/api/combos/sheet?${query}`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0]?.laps ?? 0;
  const id = (await req(`/api/combos/analysis?${query}`, 'GET', null, NATHAN)).data.sessions[0].id;
  assert.equal(await sheetLaps(), 4, 'laps 2 to 5: the first one leaves the pits');
  const before = (await req(`/api/combos/analysis/session?id=${id}`, 'GET', null, NATHAN)).data.list;
  assert.deepEqual(before.map(lap => lap.out), ['pit', '', '', '', '']);

  assert.equal((await req('/api/combos/laps', 'PATCH', {session:id, laps:[5], ignored:true}, LUCAS)).status, 403, 'not his session');
  assert.equal((await req('/api/combos/laps', 'PATCH', {session:id, laps:[5], ignored:true}, NATHAN)).status, 200);
  assert.equal(await sheetLaps(), 3);
  const after = (await req(`/api/combos/analysis/session?id=${id}`, 'GET', null, NATHAN)).data;
  assert.equal(after.list[4].out, 'ignored');
  assert.equal(after.laps.count, 3);
  const exported = (await req(`/api/combos/export?${query}`, 'GET', null, NATHAN)).data;
  assert.equal(exported.sessions[0].laps[4].ignored, true, 'the export keeps the lap, marked');

  await req('/api/combos/laps', 'PATCH', {session:id, laps:[5], ignored:false}, NATHAN);
  assert.equal(await sheetLaps(), 4);
  assert.equal((await req('/api/combos/laps', 'PATCH', {session:'nope', laps:[1], ignored:true}, NATHAN)).status, 404);
  assert.equal((await req('/api/combos/laps', 'PATCH', {session:id, laps:[], ignored:true}, NATHAN)).status, 400);
});

test('a stint of fewer than 3 timed laps keeps only the pilot\'s best lap', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  const nathan = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  // As the plugin sends them: the untimed drive out of the garage is left out, so a stint can start on lap 2.
  const sent = (at, numbers, times = {}) => {
    const base = session({at, laps:Math.max(...numbers)});
    return {...base, laps:base.laps.filter(lap => numbers.includes(lap.n)).map(lap => ({...lap, pit:false, t:times[lap.n] ?? lap.t}))};
  };
  await plugin('/api/combos/plugin/session', nathan, 'POST', sent(1_790_000_000_000, [2, 3, 4]));
  // A lap to try things: alone, not the best, it does not count.
  await plugin('/api/combos/plugin/session', nathan, 'POST', sent(1_790_100_000_000, [3], {3:211.3}));
  // Three laps, back to the garage, two more: the second run is short, its best lap is his best and stays.
  await plugin('/api/combos/plugin/session', nathan, 'POST', sent(1_790_200_000_000, [2, 3, 4, 8, 9], {8:206.8, 9:209}));
  const query = `track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const dry = (await req(`/api/combos/sheet?${query}`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0];
  assert.equal(dry.laps, 7, '3 + 3 + the best lap of the short run');
  assert.equal(dry.best, 206.8);
  const sessions = (await req(`/api/combos/analysis?${query}`, 'GET', null, NATHAN)).data.sessions;
  const outs = async index => (await req(`/api/combos/analysis/session?id=${sessions[index].id}`, 'GET', null, NATHAN)).data.list.map(lap => lap.out);
  assert.deepEqual(await outs(0), ['', '', '', '', 'short']);
  assert.deepEqual(await outs(1), ['short']);
  assert.deepEqual(await outs(2), ['', '', '']);
});

test('the plugin installer is handed out with the site written in and Windows line endings', async () => {
  const script = readFileSync(new URL('../connectors/simhub-plugin/Installer le plugin.cmd', import.meta.url), 'utf8');
  assert.equal(script.split('@@SITE@@').length, 2, 'one place for the site');
  const out = installerFor(script, 'https://dev.endurance-manager.app');
  assert.ok(out.includes("$site = 'https://dev.endurance-manager.app'"));
  assert.ok(!/[^\r]\n/.test(out), 'every line ends with CRLF');
  assert.throws(() => installerFor(script, "https://x.app'; Remove-Item C:\\"), /Installeur/);
  assert.throws(() => installerFor('@echo off', 'https://x.app'), /Installeur/);
});

test('races being prepared and game versions sort the sessions by their dates', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  const key = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_790_000_000_000}));
  await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_800_000_000_000, ve:8.1}));
  const event = (await req('/api/combos/periods', 'POST', {kind:'event', name:'24h du Mans 2026', track:TRACK, startsAt:1_799_000_000_000, endsAt:1_801_000_000_000}, NATHAN)).data;
  await req('/api/combos/periods', 'POST', {kind:'event', name:'6h de Spa', track:'Spa-Francorchamps', startsAt:1_700_000_000_000, endsAt:1_900_000_000_000}, NATHAN);
  const old = (await req('/api/combos/periods', 'POST', {kind:'version', name:'BoP de juin', startsAt:1_780_000_000_000}, NATHAN)).data;
  const latest = (await req('/api/combos/periods', 'POST', {kind:'version', name:'BoP d’octobre', startsAt:1_795_000_000_000}, NATHAN)).data;
  assert.equal((await req('/api/combos/periods', 'POST', {kind:'event', name:'Sans fin', startsAt:1_799_000_000_000}, NATHAN)).status, 400);
  assert.equal((await req('/api/combos/periods', 'POST', {kind:'other', name:'x', startsAt:1_799_000_000_000}, NATHAN)).status, 400);

  const base = `/api/combos/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const everything = (await req(base, 'GET', null, NATHAN)).data;
  assert.deepEqual(everything.periods.events.map(item => item.name), ['24h du Mans 2026'], 'the other track’s race is not offered');
  assert.deepEqual(everything.periods.versions.map(item => [item.name, item.endsAt]), [['BoP de juin', 1_794_999_999_999], ['BoP d’octobre', null]]);
  assert.equal(everything.sample.sessions, 2);
  assert.equal((await req(`${base}&event=${event.id}`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0].ve, 8.1);
  assert.equal((await req(`${base}&version=${old.id}`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0].ve, 8.4);
  assert.equal((await req(`${base}&event=${event.id}&version=${old.id}`, 'GET', null, NATHAN)).data.sample.sessions, 0);
  assert.equal((await req(`${base}&version=nope`, 'GET', null, NATHAN)).status, 404);
  // Days picked by hand narrow the sheet, alone or within a race.
  assert.equal((await req(`${base}&from=1795000000000`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0].ve, 8.1);
  assert.equal((await req(`${base}&to=1795000000000`, 'GET', null, NATHAN)).data.conditions.dry.drivers[0].ve, 8.4);
  assert.equal((await req(`${base}&event=${event.id}&to=1795000000000`, 'GET', null, NATHAN)).data.sample.sessions, 0);
  assert.equal((await req(`${base}&from=abc`, 'GET', null, NATHAN)).data.sample.sessions, 2, 'a bad date is left out');

  // Moving a version's date sorts the data again.
  await req(`/api/combos/periods/${latest.id}`, 'PATCH', {name:'BoP d’octobre', startsAt:1_810_000_000_000}, NATHAN);
  assert.equal((await req(`${base}&version=${old.id}`, 'GET', null, NATHAN)).data.sample.sessions, 2);
  await req(`/api/combos/periods/${latest.id}`, 'DELETE', {}, NATHAN);
  assert.deepEqual((await req('/api/combos/periods', 'GET', null, NATHAN)).data.versions.map(item => item.name), ['BoP de juin']);
});

test('the plugin reads the sheet of the race and version going on now', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  const key = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const day = 86_400_000, at = Date.now();
  await plugin('/api/combos/plugin/session', key, 'POST', session({at:at - 40 * day, ve:9}));
  await plugin('/api/combos/plugin/session', key, 'POST', session({at:at - day, ve:8.2}));
  await req('/api/combos/periods', 'POST', {kind:'event', name:'Prochaine course', track:TRACK, startsAt:at - 10 * day, endsAt:at + 10 * day}, NATHAN);
  const sheet = (await plugin(`/api/combos/plugin/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, key)).data;
  assert.equal(sheet.sample.sessions, 1);
  assert.equal(sheet.conditions.dry.drivers[0].ve, 8.2);
  assert.equal(sheet.drivers[0].me, true);
});

test('notes: the team writes, only the author or an admin changes them; the export carries the raw data', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(LUCAS, 'Lucas', [TEAM_ROLE]);
  signIn(GUEST, 'Admin', [TEAM_ROLE, ORGA_ROLE]);
  const note = (await req('/api/combos/notes', 'POST', {track:TRACK, car:CAR, body:'Limites de piste strictes à Arnage.'}, NATHAN)).data;
  assert.equal((await req('/api/combos/notes', 'POST', {track:TRACK, car:CAR, body:'  '}, NATHAN)).status, 400);
  assert.equal((await req(`/api/combos/notes/${note.id}`, 'DELETE', {}, LUCAS)).status, 403);
  assert.equal((await req(`/api/combos/notes/${note.id}`, 'PATCH', {body:'Limites strictes à Arnage, 3 avertissements.'}, NATHAN)).status, 200);
  const sheet = (await req(`/api/combos/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, 'GET', null, LUCAS)).data;
  assert.deepEqual(sheet.notes.map(({author, body, mine}) => [author, body, mine]), [['Nathan', 'Limites strictes à Arnage, 3 avertissements.', false]]);

  const key = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  for (let i = 0; i < 12; i++) await plugin('/api/combos/plugin/session', key, 'POST', session({at:1_790_000_000_000 + i * 1000, laps:3, pitAt:i === 0 ? 2 : null}));
  const base = `/api/combos/export?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`;
  const first = (await req(base, 'GET', null, LUCAS)).data;
  assert.equal(first.sessions.length, 10);
  assert.equal(first.notes.length, 1);
  assert.equal(first.sessions[0].pilot, 'Nathan');
  assert.deepEqual(first.sessions[0].laps[1].wear, [1.7, 2, 1.3, 1.4]);
  assert.equal(first.sessions[0].stops.length, 1);
  const second = (await req(`${base}&after=${encodeURIComponent(first.next)}`, 'GET', null, LUCAS)).data;
  assert.equal(second.sessions.length, 2);
  assert.equal(second.next, null);
  assert.equal(second.notes, undefined);

  assert.equal((await req(`/api/combos/notes/${note.id}`, 'DELETE', {}, GUEST)).status, 200);
});

test('the fiches combo page: its own tab for the roles that see them, nothing run from the page text', () => {
  const page = readFileSync(new URL('../fiches-combo.html', import.meta.url), 'utf8');
  assert.match(page, /<main id="combos-app"/);
  assert.match(page, /src="\/front\/combos-page\.mjs/);
  assert.match(page, /data-module-link="combos"/);
  assert.doesNotMatch(page, /<script>|\son[a-z]+=/i, 'no inline script nor handler (CSP)');
  const front = readFileSync(new URL('../front/combos-page.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(front, /\son[a-z]+="/i, 'no inline handler (CSP)');
  assert.match(readFileSync(new URL('../front/account-menu.mjs', import.meta.url), 'utf8'), /link\.dataset\.moduleLink === 'combos' && session\.combos !== true/);
  assert.match(readFileSync(new URL('../front/app/home-view.mjs', import.meta.url), 'utf8'), /state\.combos\?'<a class="nav-section-button" href="\/fiches-combo\.html">Fiches combo<\/a><a class="nav-section-button" href="\/mur\.html">Mur des stands<\/a>'/);
});

test('mur des stands: the plugin opens the team\'s room with its key, a page with the member\'s cookie from the site only', async () => {
  const {req, signIn, env} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  signIn(GUEST, 'Invité', []);
  const key = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
  const opened = [];
  env.LIVE = {idFromName:name => `room:${name}`, get:roomId => ({fetch:async (url, init) => {
    const headers = new Headers(init.headers);
    opened.push({roomId, role:headers.get('X-Live-Role'), user:headers.get('X-Live-User'), name:decodeURIComponent(headers.get('X-Live-Name') || ''), upgrade:headers.get('Upgrade')});
    return new Response('room', {status:200});
  }})};
  const open = (path, headers) => worker.fetch(new Request(ROOT + path, {headers:{'CF-Connecting-IP':'x', ...headers}}), env);
  assert.equal((await open('/api/combos/plugin/live', {Authorization:`Bearer ${key}`})).status, 426, 'a WebSocket only');
  assert.equal((await open('/api/combos/plugin/live', {Authorization:`Bearer ${'0'.repeat(64)}`, Upgrade:'websocket'})).status, 401);
  assert.equal((await open('/api/combos/plugin/live', {Authorization:`Bearer ${key}`, Upgrade:'websocket'})).status, 200);
  assert.deepEqual(opened.pop(), {roomId:`room:${DEV_COMMUNITY}`, role:'driver', user:NATHAN, name:'Nathan', upgrade:'websocket'});

  const page = (userId, headers = {}) => req('/api/combos/live', 'GET', null, userId, {Upgrade:'websocket', ...headers});
  assert.equal((await page(NATHAN)).status, 403, 'no Origin: another site could open it with the cookie');
  assert.equal((await page(NATHAN, {Origin:'https://evil.example'})).status, 403);
  assert.equal((await page(GUEST, {Origin:ROOT})).status, 403, 'only the roles of the fiches combo');
  assert.equal((await page(null, {Origin:ROOT})).status, 401);
  const watching = await worker.fetch(new Request(ROOT + '/api/combos/live', {headers:{'CF-Connecting-IP':'x', Upgrade:'websocket', Origin:ROOT,
    Cookie:(await (async () => { const rows = env.DB.db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').all(NATHAN); return rows.length; })()) && `__Host-em_session=${NATHAN.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'b')}`}}), env);
  assert.equal(watching.status, 200);
  assert.equal(opened.pop().role, 'viewer');
  delete env.LIVE;
  assert.equal((await open('/api/combos/plugin/live', {Authorization:`Bearer ${key}`, Upgrade:'websocket'})).status, 503);
});

test('the plugin\'s sheet stays in the cache until the combo changes: a new session, laps taken out', async () => {
  const {req, signIn, plugin} = harness();
  signIn(NATHAN, 'Nathan', [TEAM_ROLE]);
  const store = new Map(), counts = {hits:0, puts:0};
  globalThis.caches = {default:{
    match:async key => { const hit = store.get(key.url); if (hit) counts.hits++; return hit?.clone(); },
    put:async (key, response) => { counts.puts++; store.set(key.url, response); }
  }};
  try {
    const key = keyOf((await req('/api/combos/link', 'POST', {}, NATHAN)).data.code);
    const read = async () => (await plugin(`/api/combos/plugin/sheet?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, key)).data;
    await plugin('/api/combos/plugin/session', key, 'POST', session({at:Date.now() - 86_400_000}));
    assert.equal((await read()).sample.sessions, 1);
    assert.equal((await read()).sample.sessions, 1);
    assert.deepEqual(counts, {hits:1, puts:1}, 'the second read comes from the cache');
    await plugin('/api/combos/plugin/session', key, 'POST', session({at:Date.now() - 3_600_000}));
    assert.equal((await read()).sample.sessions, 2, 'a new session: computed again');
    const id = (await req(`/api/combos/analysis?track=${encodeURIComponent(TRACK)}&car=${encodeURIComponent(CAR)}`, 'GET', null, NATHAN)).data.sessions[0].id;
    await req('/api/combos/laps', 'PATCH', {session:id, laps:[5], ignored:true}, NATHAN);
    await read();
    assert.equal(counts.puts, 3, 'laps taken out: computed again');
  } finally { delete globalThis.caches; }
});
