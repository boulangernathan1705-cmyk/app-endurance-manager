import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

test('memo v2 retirement deletes its measurements and links without changing users, communities or appearance',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
  for(const name of files.filter(name=>name<'0070_'))db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('memo-owner','Pilot');
  const community=db.prepare('SELECT id FROM communities LIMIT 1').get().id;
  db.prepare('UPDATE communities SET modules=?,appearance=?').run('{"memo":true,"crewChannels":true}','{"bannerVersion":1,"accent":"#ff8800"}');
  db.prepare('INSERT INTO memo_contributors VALUES(?,0)').run('memo-owner');
  db.prepare('INSERT INTO memo_links(user_id,community_id,token_hash,expires_at) VALUES(?,?,?,?)').run('memo-owner',community,'revoked-token',9999999999);
  db.prepare('INSERT INTO memo_samples VALUES(?,?,?,?,?,?,?)').run('memo-owner','session','scope','{}','{}',0,0);
  db.exec("INSERT INTO memo_pit_profiles VALUES('scope','{}',0,'memo-owner'); INSERT INTO memo_reference VALUES('laptimes','{}',0,0)");
  const before=db.prepare('SELECT id,name,appearance FROM communities ORDER BY id').all();
  db.exec(readFileSync(new URL('../migrations/0070_remove_memo_v2.sql',import.meta.url),'utf8'));
  assert.deepEqual(db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name GLOB \'memo_*\'').all(),[]);
  assert.deepEqual(db.prepare('SELECT id,name,appearance FROM communities ORDER BY id').all(),before);
  assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get('memo-owner'));
  for(const row of db.prepare('SELECT modules FROM communities').all())assert.deepEqual(JSON.parse(row.modules),{crewChannels:true});
  db.close();
});
