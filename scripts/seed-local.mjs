// Local demo data for the help screenshots (scripts/help-screenshots.mjs): the showcase's fictional races
// (server/demo.mjs) in the local `wrangler dev` database, and the two seed accounts as members of the community.
// Usage: stop `wrangler dev`, `npx wrangler d1 migrations apply DB --local`, `npm run seed:local`, restart it.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, statSync} from 'node:fs';
import {resetShowcase} from '../server/demo.mjs';

const folder = new URL('../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url);
const file = readdirSync(folder).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map(name => new URL(name, folder)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
if (!file) throw new Error('No local database: run `npx wrangler d1 migrations apply DB --local` first.');
const db = new DatabaseSync(file.pathname);
db.exec('PRAGMA foreign_keys=ON;');
const DB = {
  prepare(sql) { return {params:[], bind(...values) { this.params = values; return this; },
    async run() { const result = db.prepare(sql).run(...this.params); return {meta:{changes:Number(result.changes)}}; },
    async first() { return db.prepare(sql).get(...this.params) || null; },
    async all() { return {results:db.prepare(sql).all(...this.params)}; }}; },
  async batch(statements) { db.exec('BEGIN'); try { for (const statement of statements) await statement.run(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } }
};
const ADMIN = '100000000000000001', PILOT = '100000000000000002', GUILD = '900000000000000001', now = Math.floor(Date.now() / 1000);
for (const [id, name] of [[ADMIN, 'Max'], [PILOT, 'Leo']]) db.prepare('INSERT OR IGNORE INTO users(id,name,created_at) VALUES(?,?,0)').run(id, name);
// Sessions of the screenshot script: 'a'×64 (Max, platform manager in the local launch config) and 'b'×64 (Leo, pilot).
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
for (const [user, token] of [[ADMIN, 'a'.repeat(64)], [PILOT, 'b'.repeat(64)]])
  db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await sha(token), user, 4102444800);
const community = db.prepare("SELECT * FROM communities WHERE slug='commu-dev'").get();
console.log(await resetShowcase({DB}, {id:community.id, slug:community.slug}));
db.prepare("UPDATE communities SET name='Ma communauté', short_name='MC', discord_guild_id=? WHERE id=?").run(GUILD, community.id);
for (const user of [ADMIN, PILOT])
  db.prepare("INSERT OR REPLACE INTO memberships(community_id,user_id,discord_roles,status,checked_at,created_at) VALUES(?,?,'[]','member',?,?)").run(community.id, user, now, now);
// Max rides in Apex Racing #7 at Spa (« Mes inscriptions »).
const spa = db.prepare("SELECT * FROM events WHERE community_id=? AND name='6h de Spa'").get(community.id);
const crew = db.prepare("SELECT * FROM crews WHERE event_id=? AND name='Apex Racing #7'").get(spa.id);
const participant = crypto.randomUUID(), registration = crypto.randomUUID();
db.prepare('INSERT INTO participants(id,name,user_id,created_by,created_at,community_id) VALUES(?,?,?,?,?,?)').run(participant, 'Max', ADMIN, ADMIN, now, community.id);
db.prepare(`INSERT INTO registrations(id,event_id,departure_id,user_id,owner_user_id,name,name_key,category,car,car_preferences,car_any,status,created_at,participant_id,community_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(registration, spa.id, crew.departure_id, ADMIN, ADMIN, 'Max', 'max', 'Hypercar', 'Alpine A424', '["Alpine A424"]', 0, 'h4,h5,h6', now, participant, community.id);
db.prepare('INSERT INTO crew_members(registration_id,crew_id) VALUES(?,?)').run(registration, crew.id);
console.log('Local demo data ready: 6 races, Max (admin) and Leo (pilot) are members.');
