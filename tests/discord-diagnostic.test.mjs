import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {discordDiagnostic} from '../server/discord-diagnostic.mjs';
import {discordSupervision} from '../server/discord-supervision.mjs';
import {platformApi} from '../server/api-platform.mjs';

// « Diagnostic Discord »: what the bot should have made this week (threads, crew voices) and where each one stands.
const MIGRATIONS = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); for (const file of MIGRATIONS) this.db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')); this.db.exec('PRAGMA foreign_keys=OFF;'); }
  prepare(sql) { const self = this; return {params:[], bind(...params) { this.params = params; return this; }, async first() { return self.db.prepare(sql).get(...this.params) || null; },
    async all() { return {results:self.db.prepare(sql).all(...this.params)}; }, async run() { return {meta:{changes:Number(self.db.prepare(sql).run(...this.params).changes)}}; }}; }
}
const GUILD = '400000000000000001', HOUR = 3600000;
// Wednesday 1 November 2090, 10h Paris: a race on Saturday is in this week, one on the next Saturday is not.
const NOW = Date.parse('2090-11-01T09:00:00Z');
const COMMUNITY = {id:'c1', slug:'test', discordGuildId:GUILD, modules:{crewChannels:true}};

function setup() {
  const DB = new D1(), run = (sql, ...params) => DB.db.prepare(sql).run(...params);
  run(`INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES('c1','test','Test','T',?,0)`, GUILD);
  const event = (id, name, startsAt) => run(`INSERT INTO events(id,name,categories,departures,created_by,created_at,duration_hours,circuit,community_id) VALUES(?,?,'["Hypercar","GT3"]',?,'u',0,6,'spa',?)`,
    id, name, JSON.stringify([{id:`${id}-d`, startsAt}]), 'c1');
  event('e1', '6h de Spa', NOW + 3 * 24 * HOUR);
  event('e2', '6h de Monza', NOW + 10 * 24 * HOUR);
  event('e3', '6h du Mans', NOW + 2 * 24 * HOUR);
  run(`INSERT INTO community_recap_settings(community_id,mode,scope,guild_id,destination_id,destination_name,checked_at) VALUES('c1','events','lmu',?,'500','courses',?)`, GUILD, NOW - 60000);
  run(`INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,marker) VALUES('c1','e1',?,'601','m')`, GUILD);
  run(`INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,marker) VALUES('c1','e3',?,'603','m')`, GUILD);
  run(`INSERT INTO community_crew_discord(community_id,updated_at) VALUES('c1',0)`);
  run(`INSERT INTO crews(id,event_id,departure_id,name,category,created_at,community_id) VALUES('k1','e1','e1-d','Apex','Hypercar',0,'c1'),('k2','e1','e1-d','Bravo','GT3',0,'c1'),('k3','e2','e2-d','Later','GT3',0,'c1')`);
  run(`INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at) VALUES('k1','c1',?,'701',0)`, GUILD);
  return {DB};
}

test('the diagnostic lists this week\'s threads and voices: made, waiting, or gone from Discord', async () => {
  const env = setup();
  const result = await discordDiagnostic(env, COMMUNITY, {timestamp:NOW});
  assert.deepEqual(result.threads.map(item => [item.name, item.state]), [['6h du Mans', 'ok'], ['6h de Spa', 'ok']], 'next week\'s race not expected yet');
  assert.deepEqual(result.crews.map(item => [item.name, item.state]), [['Apex', 'ok'], ['Bravo', 'waiting']]);
  assert.equal(result.recap.on, true); assert.equal(result.recap.lastPass, NOW - 60000); assert.equal(result.checkedLive, false);
  // Checked on Discord: the Mans thread and Apex's voice are gone.
  const calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(String(url).endsWith('/threads/active') ? {threads:[{id:'601'}]} : [{id:'500'}]), {status:200}); };
  const live = await discordDiagnostic({...env, DISCORD_BOT_TOKEN:'t'}, COMMUNITY, {timestamp:NOW, live:true});
  assert.equal(calls.length, 2, 'two Discord requests');
  assert.equal(live.checkedLive, true);
  assert.deepEqual(live.threads.map(item => item.state), ['missing', 'ok']);
  assert.deepEqual(live.crews.map(item => item.state), ['missing', 'waiting']);
});

test('without the modules, nothing is expected', async () => {
  const env = setup();
  env.DB.db.prepare("UPDATE community_recap_settings SET enabled=0").run();
  const result = await discordDiagnostic(env, {...COMMUNITY, modules:{}}, {timestamp:NOW});
  assert.deepEqual([result.recap.on, result.voices.on, result.threads.length, result.crews.length], [false, false, 0, 0]);
});


test('platform supervision reports pending voices, overdue recaps and errors without contacting Discord or writing', async()=>{
  const env=setup(), db=env.DB.db;
  db.prepare("UPDATE communities SET modules=? WHERE id='c1'").run(JSON.stringify({crewChannels:true}));
  db.prepare("UPDATE community_recap_settings SET last_error='Discord refused' WHERE community_id='c1'").run();
  db.prepare("INSERT INTO discord_recap_publications(community_id,event_id,guild_id,channel_id,marker,delete_after) VALUES('c1','deleted-race',?,'602','m',?)").run(GUILD,NOW-HOUR);
  db.prepare("INSERT INTO discord_pending(community_id,event_id,queued_at) VALUES('c1','e1',?)").run(NOW-HOUR);
  db.prepare("INSERT INTO crew_discord(crew_id,community_id,guild_id,voice_id,created_at,closed_at) VALUES('orphan','c1',?,'702',0,?)").run(GUILD,NOW-HOUR);
  db.prepare("INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES('c2','other','Other','O','400000000000000002',0)").run();
  const original=globalThis.fetch, prepare=env.DB.prepare.bind(env.DB);
  globalThis.fetch=async()=>{throw Error('No external requests allowed');};
  env.DB.prepare=sql=>{assert.match(sql.trim(),/^SELECT/i);return prepare(sql);};
  try{
    const result=await discordSupervision({...env,SITE_ENV:'development',DISCORD_BOT_TOKEN:'secret-test'},NOW);
    assert.equal(result.development,true);
    assert.equal(result.botConfigured,true);
    assert.doesNotMatch(JSON.stringify(result),/secret-test/);
    const first=result.communities.find(row=>row.slug==='test'), second=result.communities.find(row=>row.slug==='other');
    assert.equal(first.state,'error');assert.deepEqual(first.errors,['Discord refused']);
    assert.equal(first.openThreads,3);assert.equal(first.overdueThreads,1);
    assert.equal(first.waitingVoices,1);assert.equal(first.incompleteVoices,1);
    assert.equal(first.orphanCount,1);assert.equal(first.queueAt,NOW-HOUR);
    assert.equal(second.state,'off');assert.equal(second.waitingVoices,0);assert.deepEqual(second.errors,[]);
  }finally{globalThis.fetch=original;env.DB.prepare=prepare;}
});

test('platform supervision refuses community administrators who are not platform managers',async()=>{
  await assert.rejects(platformApi({path:'/api/platform/discord/supervision',method:'GET',actor:{manager:false,permissions:new Set(['admin'])}}),error=>error.status===403);
  const env=setup(), response=await platformApi({path:'/api/platform/discord/supervision',method:'GET',env,actor:{manager:true}});
  assert.equal(response.status,200);
  assert.ok((await response.json()).communities.some(row=>row.slug==='test'));
});
