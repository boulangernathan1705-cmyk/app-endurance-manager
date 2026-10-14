import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {hash, now} from '../server/core.mjs';
import {validateEvent, validateRegistration} from '../server/core.mjs';
import {gridfestPasswordValid, isGrindfest} from '../shared/grindfest.mjs';
import {linkTestServer, setMember, GUILD, DEV_COMMUNITY} from './fixtures/discord-server.mjs';

const ROOT = 'https://site.example', CID = '90a193bc-9029-437c-a1e6-8e39f09033a3';
const ADMIN = '111111111111111111', FIRST = '222222222222222222', WAITING = '333333333333333333', SECOND = '444444444444444444';
const PASSWORD = 'AbCdEfGh1234_5678-Xyz';
const streamers = [{id:'a', name:'Alpha', capacity:1}, {id:'b', name:'Bravo', capacity:2}];
const input = {name:'Gridfest', format:'solo', sim:'lmu', details:{type:'Gridfest', streamers, password:PASSWORD},
  rounds:[{circuit:'spa', durationMinutes:60, categories:[]}], departures:[{date:'2090-10-15', time:'20:00'}]};

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON;');
    for (const path of readdirSync(new URL('../migrations/', import.meta.url)).filter(path => path.endsWith('.sql')).sort())
      this.db.exec(readFileSync(new URL(`../migrations/${path}`, import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this.db;
    return {params:[], bind(...params) { this.params = params; return this; },
      async first() { return db.prepare(sql).get(...this.params) || null; },
      async all() { return {results:db.prepare(sql).all(...this.params)}; },
      async run() { return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}}; }};
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

async function harness() {
  const DB = new D1();
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,modules,created_at) VALUES(?,'tdz','TDZ','TDZ',?,0)")
    .run(CID, JSON.stringify({soloRaces:true, grindfest:true}));
  linkTestServer(DB.db, CID);
  const env = {DB, COMMUNITY:'tdz', APP_ORIGIN:ROOT, DISCORD_CLIENT_ID:'app-id', DISCORD_CLIENT_SECRET:'test-secret',
    DISCORD_BOT_TOKEN:'test-bot', ADMIN_DISCORD_IDS:ADMIN};
  const tokens = new Map();
  async function addUser(userId) {
    DB.db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,?,'pilot',0)").run(userId, `Discord ${userId}`);
    const raw = await hash(userId);
    tokens.set(userId, raw);
    DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hash(raw), userId, now() + 3600);
    setMember(DB.db, userId, [], {communityId:CID});
  }
  for (const user of [ADMIN, FIRST, WAITING, SECOND]) await addUser(user);
  async function req(path, method = 'GET', data, userId = ADMIN) {
    const headers = {'CF-Connecting-IP':userId, Cookie:`__Host-em_session=${tokens.get(userId) || ''}`};
    if (method !== 'GET') { headers.Origin = ROOT; headers['Content-Type'] = 'application/json'; }
    const response = await worker.fetch(new Request(ROOT + path, {method, headers, ...(method !== 'GET' ? {body:JSON.stringify(data || {})} : {})}), env);
    return {status:response.status, data:await response.json()};
  }
  const created = await req('/api/events', 'POST', input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const event = (await req('/api/events')).data.events[0];
  const entryPath = `/api/events/${event.id}/departures/${event.departures[0].id}/registrations`;
  const sendPath = `/api/events/${event.id}/gridfest/passwords`;
  async function enter(userId, streamerId = 'a', gameName = `Game ${userId}`) {
    const result = await req(entryPath, 'POST', {name:'Cannot replace Discord identity', streamerId, gameName}, userId);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.id;
  }
  return {DB, env, req, event, entryPath, sendPath, enter, addUser};
}

function mockDiscord({blocked = new Set(), left = new Set(), onChannel} = {}) {
  const requests = [], messages = [], recipients = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('https://discord.com/api/v10', ''), data = options.body ? JSON.parse(options.body) : null;
    requests.push({path, method:options.method, data});
    assert.match(options.headers.Authorization, /^Bot /);
    const member = path.match(/^\/guilds\/(\d+)\/members\/(\d+)$/);
    if (member) {
      assert.equal(member[1], GUILD, 'check only the Discord server of this community');
      return left.has(member[2]) ? Response.json({code:10007}, {status:404}) : Response.json({user:{id:member[2]}, roles:[]});
    }
    if (path === '/users/@me/channels') {
      const id = data.recipient_id;
      recipients.set(id, id);
      await onChannel?.(id);
      return Response.json({id});
    }
    const message = path.match(/^\/channels\/(\d+)\/messages$/);
    assert.ok(message, `no public Discord channel or other API call: ${path}`);
    const recipient = recipients.get(message[1]);
    if (blocked.has(recipient)) return Response.json({code:50007}, {status:403});
    assert.deepEqual(data.allowed_mentions, {parse:[]});
    messages.push({recipient, ...data});
    return Response.json({id:'999999999999999999'});
  };
  return {requests, messages, restore() { globalThis.fetch = original; }};
}

test('the game name is mandatory only on Gridfest; legacy event types remain compatible', () => {
  const data = validateEvent({...input, details:{...input.details, type:'Grindfest'}});
  assert.equal(data.details.type, 'Gridfest');
  assert.ok(isGrindfest({details:{type:'Grindfest'}}));
  const event = {...data, details:JSON.stringify(data.details), categories:JSON.stringify(data.categories), rounds:JSON.stringify(data.rounds)};
  for (const gameName of [undefined, '', '  ', 'a'.repeat(65), 'Injected\nName'])
    assert.throws(() => validateRegistration({name:'Discord name', streamerId:'a', gameName}, event), /Nom en jeu/);
  assert.equal(validateRegistration({name:'Discord name', streamerId:'a', gameName:'  Real Game Name  '}, event).gameName, 'Real Game Name');
  const solo = {...event, details:JSON.stringify({type:'OPEN'})};
  assert.doesNotThrow(() => validateRegistration({name:'Other pilot'}, solo));
  for (const password of ['tdz', 'Mot-de-passe_choisi']) assert.ok(gridfestPasswordValid(password));
  for (const password of ['a'.repeat(31), 'password with spaces', 'abcdef\nghijkl'])
    assert.throws(() => validateEvent({...input, details:{...input.details, password}}), /Mot de passe/);
  assert.doesNotThrow(() => validateEvent({...input, details:{type:'OPEN', password:'tdz'}}), 'other events keep their existing password rules');
});

test('migration preserves existing pilots and queue order, and leaves other events unchanged', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const path of readdirSync(new URL('../migrations/', import.meta.url)).filter(path => path.endsWith('.sql') && path < '0065').sort())
    db.exec(readFileSync(new URL(`../migrations/${path}`, import.meta.url), 'utf8'));
  db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,'Existing pilot','pilot',0)").run(FIRST);
  db.prepare("INSERT INTO participants(id,user_id,name,created_at,community_id) VALUES('existing-pilot',?,'Existing pilot',0,?)").run(FIRST, DEV_COMMUNITY);
  const addEvent = db.prepare("INSERT INTO events(id,name,format,details,categories,departures,created_at,community_id,created_by) VALUES(?,?,'solo',?,'[]','[]',0,?,?)");
  addEvent.run('existing-grid', 'Grindfest', JSON.stringify({type:'Grindfest', streamers, password:PASSWORD}), DEV_COMMUNITY, FIRST);
  addEvent.run('other-event', 'OPEN', JSON.stringify({type:'OPEN', password:'tdz'}), DEV_COMMUNITY, FIRST);
  db.prepare("INSERT INTO registrations(id,event_id,departure_id,participant_id,user_id,name,name_key,category,status,created_at,streamer_id,streamer_order,community_id) VALUES('existing-entry','existing-grid','departure','existing-pilot',?,'Existing pilot','existing pilot','','whole',0,'a',42,?)").run(FIRST, DEV_COMMUNITY);
  db.exec(readFileSync(new URL('../migrations/0065_gridfest_registration.sql', import.meta.url), 'utf8'));
  const event = db.prepare("SELECT name,details FROM events WHERE id='existing-grid'").get();
  assert.equal(event.name, 'Gridfest');
  assert.deepEqual(JSON.parse(event.details), {type:'Gridfest', streamers, password:PASSWORD});
  assert.deepEqual({...db.prepare("SELECT participant_id,name,game_name,streamer_order FROM registrations WHERE id='existing-entry'").get()},
    {participant_id:'existing-pilot', name:'Existing pilot', game_name:'', streamer_order:42});
  assert.equal(db.prepare("SELECT details FROM events WHERE id='other-event'").get().details, JSON.stringify({type:'OPEN', password:'tdz'}));
  db.close();
});

test('Gridfest keeps Discord identity, hides passwords even from entrants, and gates sending by module and admin', async () => {
  const {DB, env, req, event, entryPath, sendPath, enter} = await harness();
  assert.equal((await req(entryPath, 'POST', {name:'Pilot', streamerId:'a'}, FIRST)).status, 400);
  await enter(FIRST, 'a', 'Nathan in game');
  const seen = (await req('/api/events', 'GET', null, FIRST)).data.events[0];
  assert.equal(seen.departures[0].availability[0].name, `Discord ${FIRST}`);
  assert.equal(seen.departures[0].availability[0].gameName, 'Nathan in game');
  assert.equal(seen.details.password, undefined);
  assert.equal((await req('/api/events')).data.events[0].details.password, undefined);
  assert.equal((await req(`/api/events/${event.id}/edit-details`)).data.details.password, PASSWORD);
  assert.equal((await req(sendPath, 'GET', null, FIRST)).status, 403);
  assert.equal((await req(sendPath, 'POST', {version:event.version}, FIRST)).status, 403);
  assert.equal((await req(sendPath, 'POST', {version:999})).status, 409);
  setMember(DB.db, WAITING, [], {communityId:CID, status:'left'});
  assert.equal((await req(entryPath, 'POST', {name:'Outsider', gameName:'Outsider', streamerId:'b'}, WAITING)).status, 403);
  env.DISCORD_BOT_TOKEN = '';
  assert.equal((await req(sendPath, 'POST', {version:event.version})).status, 503);
  DB.db.prepare("UPDATE communities SET modules=json_set(modules,'$.grindfest',json('false')) WHERE id=?").run(CID);
  assert.equal((await req(sendPath)).status, 404);
  assert.equal((await req(sendPath, 'POST', {version:event.version})).status, 404);
  assert.deepEqual((await req('/api/events')).data.events, []);
  // Even a stored true flag cannot grant this module to another community.
  env.COMMUNITY = 'commu-dev';
  DB.db.prepare("UPDATE communities SET modules=json_set(modules,'$.soloRaces',json('true'),'$.grindfest',json('true')) WHERE slug='commu-dev'").run();
  assert.equal((await req('/api/session')).data.grindfest, false);
  assert.equal((await req(sendPath)).status, 404);
});

test('private sends exclude waiting pilots, track blocked MPs, resume without duplicates, and invite promotions on admin action', async () => {
  const {DB, req, event, entryPath, sendPath, enter} = await harness();
  const firstReg = await enter(FIRST);
  await enter(WAITING);
  await enter(SECOND, 'b');
  assert.equal((await req(entryPath, 'POST', {name:'Manual pilot', gameName:'Manual game', streamerId:'b', forOther:true})).status, 201);
  const blocked = new Set([SECOND]), discord = mockDiscord({blocked});
  try {
    const status = await req(sendPath);
    assert.equal(status.data.waiting, 1);
    assert.equal(status.data.pilots.find(pilot => pilot.name === 'Manual pilot').status, 'incomplete');
    assert.equal(JSON.stringify(status.data).includes(PASSWORD), false);
    assert.equal(discord.requests.length, 0, 'opening the status never sends a DM');
    const first = await req(sendPath, 'POST', {version:event.version});
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(discord.messages.length, 1);
    assert.equal(discord.messages[0].recipient, FIRST);
    assert.ok(discord.messages[0].content.includes(PASSWORD));
    assert.ok(discord.messages[0].content.includes(`Game ${FIRST}`));
    assert.equal(first.data.pilots.find(pilot => pilot.name === `Discord ${SECOND}`).status, 'failed');
    assert.equal(discord.requests.some(request => request.data?.recipient_id === WAITING), false);
    assert.equal(JSON.stringify(first.data).includes(PASSWORD), false);
    blocked.clear();
    assert.equal((await req(sendPath, 'POST', {version:event.version})).status, 200);
    assert.equal(discord.messages.length, 2);
    assert.equal(discord.messages.filter(message => message.recipient === FIRST).length, 1);
    await req(sendPath, 'POST', {version:event.version});
    assert.equal(discord.messages.length, 2, 'a second click does not repeat delivered passwords');
    assert.equal((await req(`/api/registrations/${firstReg}`, 'DELETE', {version:1})).status, 200);
    assert.equal(discord.messages.length, 2, 'promotion never triggers an automatic send');
    await req(sendPath, 'POST', {version:event.version});
    assert.equal(discord.messages.length, 3);
    assert.equal(discord.messages.at(-1).recipient, WAITING);
    const newPassword = 'NewPassword_123456789';
    const edited = await req(`/api/events/${event.id}`, 'PATCH', {...input, departures:event.departures, version:event.version, details:{...input.details, password:newPassword}});
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    assert.equal((await req(sendPath, 'POST', {version:event.version})).status, 409);
    const updated = (await req('/api/events')).data.events[0];
    await req(sendPath, 'POST', {version:updated.version});
    assert.equal(discord.messages.length, 5, 'new password can be sent to the currently confirmed pilots');
    assert.ok(discord.messages.slice(-2).every(message => message.content.includes(newPassword)));
  } finally { discord.restore(); }
});

test('membership and confirmed place are rechecked immediately before sending; concurrent sends share a lease', async () => {
  const {DB, req, event, sendPath, enter} = await harness();
  const reg = await enter(FIRST);
  const left = new Set([FIRST]), discord = mockDiscord({left, onChannel:() => DB.db.prepare('DELETE FROM registrations WHERE id=?').run(reg)});
  try {
    const refused = await req(sendPath, 'POST', {version:event.version});
    assert.equal(refused.status, 200);
    assert.equal(discord.messages.length, 0);
    assert.match(refused.data.results[0].error, /plus membre/);
    left.clear();
    await req(sendPath, 'POST', {version:event.version});
    assert.equal(discord.messages.length, 0, 'withdrawing while the DM channel opens prevents the invitation');
  } finally { discord.restore(); }
  // A delivery currently claimed by another request must not be sent again.
  await enter(FIRST);
  DB.db.prepare("UPDATE gridfest_password_deliveries SET status='sending',attempted_at=?,error='' WHERE event_id=?").run(now(), event.id);
  const second = mockDiscord();
  try {
    const resumed = await req(sendPath, 'POST', {version:event.version});
    assert.equal(resumed.data.results[0].status, 'skipped');
    assert.equal(second.requests.length, 0);
    DB.db.prepare("UPDATE gridfest_password_deliveries SET attempted_at=? WHERE event_id=?").run(now() - 121, event.id);
    await req(sendPath, 'POST', {version:event.version});
    assert.equal(second.messages.length, 1, 'an interrupted, expired claim can be resumed');
  } finally { second.restore(); }
});

test('large grids use bounded batches and can resume from the returned cursor', async () => {
  const {req, event, sendPath, enter, addUser} = await harness();
  const edited = await req(`/api/events/${event.id}`, 'PATCH', {...input, departures:event.departures, version:event.version,
    details:{...input.details, streamers:streamers.map(streamer => ({...streamer, capacity:12}))}});
  assert.equal(edited.status, 200);
  const updated = (await req('/api/events')).data.events[0];
  const users = Array.from({length:10}, (_, index) => `5555555555555555${String(index).padStart(2, '0')}`);
  for (const user of users) { await addUser(user); await enter(user); }
  const discord = mockDiscord();
  try {
    const batch = await req(sendPath, 'POST', {version:updated.version});
    assert.equal(batch.status, 200, JSON.stringify(batch.data));
    assert.equal(discord.messages.length, 8);
    assert.ok(batch.data.nextCursor);
    assert.equal(discord.requests.length, 24);
    const remaining = await req(sendPath, 'POST', {version:updated.version, cursor:batch.data.nextCursor});
    assert.equal(remaining.data.nextCursor, null);
    assert.equal(discord.messages.length, 10);
    assert.equal(new Set(discord.messages.map(message => message.recipient)).size, 10);
  } finally { discord.restore(); }
});
