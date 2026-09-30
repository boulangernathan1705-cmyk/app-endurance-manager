import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';

// Official races (migration 0039): common to every community, each entry and crew keeping its own community.
const MIGRATIONS = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const file of MIGRATIONS) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  db.exec(`INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('c-a','team-a','A','A',0),('c-b','team-b','B','B',0);
    INSERT INTO users(id,name,created_at) VALUES('u-1','Organisateur',0);
    INSERT INTO participants(id,name,guest_hash,created_at,community_id) VALUES('p-a','Pilote A','g-a',0,'c-a'),('p-b','Pilote B','g-b',0,'c-b');`);
  return db;
}
const race = (db, id, community) => db.prepare(`INSERT INTO events(id,name,duration_hours,duration_minutes,event_type,circuit,schedule_pending,format,access,capacity,rounds,categories,departures,created_by,created_at,community_id)
  VALUES(?,?,6,360,'special','fuji',0,'endurance','open',NULL,'[]','["GT3"]','[{"id":"d-1","date":"2026-10-16","time":"14:00"}]','u-1',0,?)`).run(id, id, community);
const entry = (db, id, event, participant, community) => db.prepare(`INSERT INTO registrations(id,event_id,departure_id,guest_hash,name,name_key,category,car,car_preferences,car_any,status,created_at,participant_id,round_choices,community_id)
  VALUES(?,?,'d-1',?,?,?,'GT3','','[]',1,'whole',0,?,'[]',?)`).run(id, event, `h-${id}`, id, id, participant, community);
const crew = (db, id, event, community) => db.prepare(`INSERT INTO crews(id,event_id,departure_id,name,category,car,locked,created_at,community_id) VALUES(?,?,'d-1',?,'GT3','',0,0,?)`).run(id, event, id, community);

test('an official race takes the entries and crews of every community, each keeping its own', () => {
  const db = database();
  race(db, 'official', 'official');
  entry(db, 'r-a', 'official', 'p-a', 'c-a');
  entry(db, 'r-b', 'official', 'p-b', 'c-b');
  crew(db, 'crew-a', 'official', 'c-a');
  crew(db, 'crew-b', 'official', 'c-b');
  db.prepare('INSERT INTO crew_members(registration_id,crew_id) VALUES(?,?)').run('r-a', 'crew-a');
  assert.throws(() => db.prepare('INSERT INTO crew_members(registration_id,crew_id) VALUES(?,?)').run('r-b', 'crew-a'), /community_mismatch/, 'a crew never mixes communities');
  assert.throws(() => entry(db, 'r-x', 'official', 'p-a', 'c-b'), /community_mismatch/, 'an entry has the community of its pilot');
  assert.throws(() => crew(db, 'crew-x', 'official', 'nowhere'), /community_mismatch/, 'a crew belongs to an existing community');
});

test('a private race stays in its community; a race may become official, never move to another community', () => {
  const db = database();
  race(db, 'private', 'c-a');
  entry(db, 'r-a', 'private', 'p-a', 'c-a');
  assert.throws(() => entry(db, 'r-b', 'private', 'p-b', 'c-b'), /community_mismatch/);
  assert.throws(() => crew(db, 'crew-b', 'private', 'c-b'), /community_mismatch/);
  assert.throws(() => db.prepare("UPDATE events SET community_id='c-b' WHERE id='private'").run(), /community_fixed/);
  db.prepare("UPDATE events SET community_id='official' WHERE id='private'").run();
  entry(db, 'r-b2', 'private', 'p-b', 'c-b');
  assert.equal(db.prepare("SELECT community_id FROM registrations WHERE id='r-a'").get().community_id, 'c-a', 'its entries keep their community');
  assert.throws(() => race(db, 'bad', 'nowhere'), /community_invalid/);
  assert.throws(() => race(db, 'none', ''), /community_invalid/, 'a race without community is not official');
});

// Migration 0040: the per-community copies of each iRacing race become one official race.
function beforeMerge() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  for (const file of MIGRATIONS.filter(name => name < '0040')) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  db.exec(`INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('c-a','team-a','A','A',0),('c-b','team-b','B','B',0);
    INSERT INTO users(id,name,created_at) VALUES('u-1','Organisateur',0);
    INSERT INTO participants(id,name,guest_hash,created_at,community_id) VALUES('p-a','Pilote A','g-a',0,'c-a'),('p-b','Pilote B','g-b',0,'c-b');`);
  return db;
}
const merge = db => db.exec(readFileSync(new URL('../migrations/0040_official_iracing_merge.sql', import.meta.url), 'utf8'));
const imported = (db, community, external, event, at = 0) => db.prepare('INSERT INTO iracing_imports(community_id,external_id,event_id,created_at) VALUES(?,?,?,?)').run(community, external, event, at);

test('merge: one official race per iRacing race, the entered copy kept, the empty ones removed', () => {
  const db = beforeMerge();
  race(db, 'daytona-a', 'c-a'); race(db, 'daytona-b', 'c-b'); race(db, 'sebring-a', 'c-a'); race(db, 'private', 'c-a');
  imported(db, 'c-a', 'special:daytona', 'daytona-a', 1); imported(db, 'c-b', 'special:daytona', 'daytona-b', 2); imported(db, 'c-a', 'special:sebring', 'sebring-a');
  imported(db, 'c-b', 'special:deleted', null);
  entry(db, 'r-b', 'daytona-b', 'p-b', 'c-b');
  merge(db);
  const events = db.prepare('SELECT id, community_id FROM events ORDER BY id').all().map(row => `${row.id}:${row.community_id}`);
  assert.deepEqual(events, ['daytona-b:official', 'private:c-a', 'sebring-a:official'], 'the entered copy is kept, the private race untouched');
  assert.equal(db.prepare("SELECT community_id FROM registrations WHERE id='r-b'").get().community_id, 'c-b');
  assert.deepEqual(db.prepare('SELECT community_id, external_id, event_id FROM iracing_imports ORDER BY external_id').all().map(row => ({...row})),
    [{community_id:'official', external_id:'special:daytona', event_id:'daytona-b'}, {community_id:'official', external_id:'special:sebring', event_id:'sebring-a'}]);
  entry(db, 'r-a', 'daytona-b', 'p-a', 'c-a');
});

test('merge: stops, changing nothing, when two copies of a race both have entries', () => {
  const db = beforeMerge();
  race(db, 'daytona-a', 'c-a'); race(db, 'daytona-b', 'c-b');
  imported(db, 'c-a', 'special:daytona', 'daytona-a'); imported(db, 'c-b', 'special:daytona', 'daytona-b');
  entry(db, 'r-a', 'daytona-a', 'p-a', 'c-a'); entry(db, 'r-b', 'daytona-b', 'p-b', 'c-b');
  db.exec('BEGIN');
  assert.throws(() => merge(db), /CHECK constraint failed/);
  db.exec('ROLLBACK');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE community_id='official'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 2);
});
