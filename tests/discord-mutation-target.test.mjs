import test from 'node:test';
import assert from 'node:assert/strict';
import {discordMutationTarget} from '../server/worker-with-migrations.mjs';
const event='11111111-1111-4111-8111-111111111111',registration='22222222-2222-4222-8222-222222222222';
test('official entry from another community syncs that community without consuming the body',async()=>{
 const request=new Request(`https://tdz.example/api/races/${event}/departures/${registration}/registrations`,{method:'POST',body:JSON.stringify({communityId:'fmt'})});
 assert.deepEqual(await discordMutationTarget({},request),{eventId:event,communityId:'fmt'});
 assert.deepEqual(await request.json(),{communityId:'fmt'});
});
test('deleting an entry uses its community, read before the row disappears',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/SELECT event_id,community_id FROM registrations/);return{bind(id){assert.equal(id,registration);return{async first(){return{event_id:event,community_id:'fmt'};}};}};}}};
 assert.deepEqual(await discordMutationTarget(env,new Request(`https://tdz.example/api/registrations/${registration}`,{method:'DELETE'})),{eventId:event,communityId:'fmt'});
});
test('entries without explicit community keep the current site fallback',async()=>{
 const request=new Request(`https://fmt.example/api/races/${event}/departures/${registration}/registrations`,{method:'POST',body:'{}'});
 assert.deepEqual(await discordMutationTarget({},request),{eventId:event,communityId:null});
});
