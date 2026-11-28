import test from 'node:test';
import assert from 'node:assert/strict';
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
 for(const rating of [0,6,2.5,'5',null])assert.throws(()=>validateReview({rating}));
 assert.throws(()=>validateReview({rating:3,comment:'x'.repeat(1001)}));
});
