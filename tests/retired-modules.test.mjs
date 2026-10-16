import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';

test('retiring training and memo clears telemetry and links while preserving community settings and users', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations.filter(name => !name.startsWith('0068_'))) db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('retired-test', 'Pilot');
  db.prepare('INSERT INTO training_devices(user_id,token_hash,created_at) VALUES(?,?,0)').run('retired-test', 'old-link');
  db.prepare('UPDATE communities SET modules=?').run(JSON.stringify({training:true,memo:true,crewChannels:true,categoryEntry:true}));
  const before = db.prepare('SELECT id,slug,name FROM communities ORDER BY id').all();
  db.exec(readFileSync(new URL('../migrations/0068_remove_training_memo.sql', import.meta.url), 'utf8'));
  assert.deepEqual(db.prepare('SELECT id,slug,name FROM communities ORDER BY id').all(), before);
  assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get('retired-test'));
  for (const row of db.prepare('SELECT modules FROM communities').all()) assert.deepEqual(JSON.parse(row.modules), {crewChannels:true,categoryEntry:true});
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'training_*'").all(), []);
  db.close();
});
