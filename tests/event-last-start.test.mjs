import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';

// Every migration in order, as on Cloudflare.
function database() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
  return db;
}

test('the last start of a race follows its departures, and the upcoming filter uses the index', () => {
  const db = database();
  const community = db.prepare('SELECT id FROM communities LIMIT 1').get().id;
  const departures = starts => JSON.stringify(starts.map((startsAt, index) => ({id:`d${index}`, date:'2090-01-01', time:'20:00', startsAt})));
  db.exec("INSERT INTO users(id,name,created_at) VALUES('u1','Pilote',0)");
  db.prepare(`INSERT INTO events(id,name,categories,departures,created_by,created_at,community_id) VALUES('e1','Spa','["GT3"]',?,'u1',0,?)`).run(departures([1000, 3000]), community);
  const lastStart = () => db.prepare("SELECT last_start FROM events WHERE id='e1'").get().last_start;
  assert.equal(lastStart(), 3000);
  db.prepare("UPDATE events SET departures=? WHERE id='e1'").run(departures([5000]));
  assert.equal(lastStart(), 5000);
  db.prepare("UPDATE events SET departures='[]' WHERE id='e1'").run();
  assert.equal(lastStart(), null, 'undated race: stays in the upcoming list');
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT e.* FROM events e WHERE (e.community_id=? OR e.community_id='official') AND (e.last_start IS NULL OR e.last_start>?)").all(community, 0).map(row => row.detail).join(' | ');
  assert.match(plan, /events_community_last_start/);
});
