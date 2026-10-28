import test from 'node:test';
import assert from 'node:assert/strict';
import {discordMutationTarget,flushDiscord,queueWeeklySync} from '../server/worker-with-migrations.mjs';
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
test('changes are gathered: each community noted is done once per pass, taken off the list first',async()=>{
 const done=[];
 const env={DB:{prepare(sql){return{bind(...params){return{
  async all(){assert.match(sql,/FROM discord_pending ORDER BY queued_at LIMIT/);return{results:[{community_id:'fmt',event_id:event}]};},
  async run(){done.push([sql.split(' ')[0],...params]);return{meta:{changes:1}};},
  async first(){return null;}};}};}}};
 assert.equal(await flushDiscord(env),1);
 assert.deepEqual(done[0],['DELETE','fmt']);
});

test('creating an official race queues a shared update without consuming the request body',async()=>{
 const request=new Request('https://site.example/api/events',{method:'POST',body:JSON.stringify({official:true})});
 assert.deepEqual(await discordMutationTarget({},request),{eventId:null,communityId:null,shared:true});
 assert.deepEqual(await request.json(),{official:true});
});
test('editing, deleting or promoting an official race targets all Discords',async()=>{
 for(const [method,suffix,owner] of [['PATCH','','official'],['DELETE','','official'],['POST','/official','fmt']]){
  const env={DB:{prepare(){return{bind(){return{async first(){return{community_id:owner};}};}};}}};
  const request=new Request(`https://site.example/api/events/${event}${suffix}`,{method});
  assert.deepEqual(await discordMutationTarget(env,request),{eventId:event,communityId:null,shared:true});
 }
});
test('official updates enqueue enabled Discord configurations in one database operation',async()=>{
 const pending=[];let calls=0;
 const env={DB:{prepare(sql){assert.match(sql,/SELECT community_id,\?,\? FROM community_recap_settings WHERE enabled=1/);return{bind(id,at){assert.equal(id,event);assert.equal(typeof at,'number');return{async run(){calls++;}};}};}}};
 queueWeeklySync(env,{waitUntil(task){pending.push(task);}},new Request('https://site.example'),event,null,true);
 await Promise.all(pending);assert.equal(calls,1);
});
