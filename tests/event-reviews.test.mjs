import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reviewOpensAt,eligibleReviewUsers,validateReview,REVIEW_GRACE} from '../server/event-reviews.mjs';
const race={departures:JSON.stringify([{id:'a',startsAt:1000},{id:'b',startsAt:2000}]),duration_minutes:1440,format:'endurance'};
test('reviews open after last finish, never at archive/start',()=>{
 assert.equal(reviewOpensAt(race),2000+1440*60000+REVIEW_GRACE);
 assert.equal(reviewOpensAt({...race,schedule_pending:1}),null);
 assert.equal(reviewOpensAt({...race,official_schedule_status:'cancelled'}),null);
 assert.equal(reviewOpensAt({...race,departures:'[{"id":"a","tbd":true}]'}),null);
});
const reg=(user_id,extra={})=>({user_id,departure_id:'a',status:'available',...extra});
test('one vote per identified pilot, excluding absences, unavailability and pending starts',()=>{
 assert.deepEqual(eligibleReviewUsers(race,[reg('a'),reg('a',{departure_id:'b'}),reg('b',{absent:1}),reg('c',{status:'unavailable'}),reg('d',{departure_id:'pending'}),reg('system:x')]),['a']);
});
test('solo capacity and skipped rounds exclude waiting pilots',()=>{
 assert.deepEqual(eligibleReviewUsers({...race,format:'solo',capacity:1,rounds:'[{"capacity":1}]'},[reg('a'),reg('b')]),['a']);
 assert.deepEqual(eligibleReviewUsers({...race,format:'solo',rounds:'[{"capacity":1},{"capacity":1}]'},[reg('a',{round_choices:'[{},{"skip":true}]'}),reg('b',{round_choices:'[{"skip":true},{}]'}),reg('c')]),['a','b']);
});
test('Gridfest has separate queues per streamer',()=>{
 const event={...race,format:'solo',details:JSON.stringify({type:'Gridfest',streamers:[{id:'x',capacity:1},{id:'y',capacity:1}]})};
 assert.deepEqual(eligibleReviewUsers(event,[reg('a',{streamer_id:'x'}),reg('b',{streamer_id:'x'}),reg('c',{streamer_id:'y'})]),['a','c']);
});
test('strict stars and optional Unicode text',()=>{
 assert.deepEqual(validateReview({rating:5,comment:" C’est top ! 🏁 "}),{rating:5,comment:"C’est top ! 🏁"});
 assert.deepEqual(validateReview({rating:1}),{rating:1,comment:''});
 for(const rating of [0.5,1.5,2.5,3.5,4.5]) assert.equal(validateReview({rating}).rating,rating);
 for(const rating of [0,6,2.25,0.25,5.5,'5',null,NaN,Infinity,true])assert.throws(()=>validateReview({rating}));
 assert.throws(()=>validateReview({rating:3,comment:'x'.repeat(1001)}));
});

test('half-star migration preserves old votes, enforces increments and keeps foreign keys',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE events(id TEXT PRIMARY KEY); CREATE TABLE communities(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY);");
  db.exec(readFileSync(new URL('../migrations/0107_event_reviews.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO events VALUES('e'); INSERT INTO communities VALUES('c'); INSERT INTO users VALUES('u'); INSERT INTO event_review_sessions VALUES('e','c',1,2); INSERT INTO event_review_eligible VALUES('e','c','u'); INSERT INTO event_reviews VALUES('e','c','u',4,'ancien commentaire',1,1);");
  db.exec(readFileSync(new URL('../migrations/0108_event_review_half_stars.sql',import.meta.url),'utf8'));
  assert.deepEqual({...db.prepare('SELECT rating,comment,created_at FROM event_reviews').get()},{rating:4,comment:'ancien commentaire',created_at:1});
  const update=db.prepare("UPDATE event_reviews SET rating=? WHERE user_id='u'");
  for(const rating of [0.5,1.5,3.5,5]) {update.run(rating);assert.equal(db.prepare('SELECT rating FROM event_reviews').get().rating,rating);}
  for(const rating of [0,0.25,3.2,5.5]) assert.throws(()=>update.run(rating));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.exec("DELETE FROM event_review_eligible WHERE user_id='u'");
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM event_reviews').get().count,0);
 } finally {db.close();}
});
