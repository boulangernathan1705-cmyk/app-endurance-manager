import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {currentSeason,validSeason} from '../shared/season.mjs';
import {communitySeason,saveCommunitySeason} from '../server/season.mjs';
function harness(){
  const db=new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE communities(id TEXT PRIMARY KEY); INSERT INTO communities VALUES('a'),('b');");
  db.exec(readFileSync(new URL('../migrations/0093_community_season.sql',import.meta.url),'utf8'));
  return {DB:{prepare(sql){let params=[];return {bind(...values){params=values;return this;},async first(){return db.prepare(sql).get(...params);},async run(){return {meta:db.prepare(sql).run(...params)};}};}}};
}
const organiser={user:{id:'organiser'},permissions:new Set(['create_race'])};
test('four aligned quarters and Paris boundary',()=>{
  for(const month of ['01','04','07','10'])assert.ok(validSeason(`2026-${month}`));
  for(const value of ['2026-02','2026-13','1999-01','2101-01',null,{}])assert.equal(validSeason(value),false);
  assert.equal(currentSeason(Date.parse('2026-03-31T22:30:00Z')),'2026-04');
  assert.equal(currentSeason(Date.parse('2026-12-31T23:30:00Z')),'2027-01');
});
test('shared season persists, isolates communities and rejects stale organiser edits',async()=>{
  const env=harness(),a={id:'a'},b={id:'b'};
  assert.equal((await communitySeason(env,a)).version,0);
  assert.deepEqual(await saveCommunitySeason(env,organiser,a,{start:'2026-10',version:0}),{start:'2026-10',version:1});
  assert.deepEqual(await communitySeason(env,a),{start:'2026-10',version:1});
  assert.equal((await communitySeason(env,b)).version,0);
  await assert.rejects(saveCommunitySeason(env,organiser,a,{start:'2027-01',version:0}),e=>e.status===409);
  await saveCommunitySeason(env,organiser,a,{start:'2027-01',version:1});
  await assert.rejects(saveCommunitySeason(env,organiser,a,{start:'2027-04',version:1}),e=>e.status===409);
  assert.deepEqual(await communitySeason(env,a),{start:'2027-01',version:2});
});
test('only organisers can save, and arbitrary months are rejected',async()=>{
  const env=harness(),community={id:'a'};
  await assert.rejects(saveCommunitySeason(env,{user:{id:'pilot'},permissions:new Set(['access'])},community,{start:'2026-10',version:0}),e=>e.status===403);
  await assert.rejects(saveCommunitySeason(env,{},community,{start:'2026-10',version:0}),e=>e.status===401);
  await assert.rejects(saveCommunitySeason(env,organiser,community,{start:'2026-11',version:0}),e=>e.status===400);
  assert.equal((await communitySeason(env,community)).version,0);
});
