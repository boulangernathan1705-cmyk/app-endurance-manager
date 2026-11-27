import test from 'node:test';
import assert from 'node:assert/strict';
import {discordPreviewAvailable,diagnoseDiscordPreview} from '../server/discord-test-preview.mjs';
import {realPreviewFixture,realPreviewPayloads,realDiscordPreview} from '../server/discord-real-preview.mjs';
import {platformApi} from '../server/api-platform.mjs';
const origin='https://dev.endurance-manager.app';
const env={SITE_ENV:'development',APP_ORIGIN:origin,DISCORD_CLIENT_ID:'123456789012345678',DISCORD_BOT_TOKEN:'fake',DISCORD_TEST_WEBHOOK:'https://discord.com/api/webhooks/123456789012345678/fake_test_webhook_not_a_secret'};
test('the real formatters create the actual week, thread and voice payloads',()=>{
  const fixture=realPreviewFixture(Date.parse('2026-11-27T12:00:00Z'));
  const payloads=realPreviewPayloads(env,{name:'Test',slug:'test',modules:{}},fixture,{em_hypercar:'123',em_lmp2:'456',em_brand_toyota:'789'},Object.fromEntries(fixture.races.map(r=>[r.id,'123456789012345678'])),Date.now());
  assert.equal(payloads.week.length,3);assert.equal(payloads.threads.length,2);assert.equal(payloads.voices.length,7);
  assert.match(payloads.threads[0].name,/^LMU · /);
  assert.match(payloads.voices[0].name,/#EM TEST 01 · Toyota GR010 · HY/);
  assert.equal(payloads.voices[1].name,'#EM TEST 02 · LMP2 ELMS');assert.equal(payloads.voices[2].name,'#EM TEST 03 · LMP2 WEC');
  assert.match(payloads.voices[1].payload.embeds[0].description,/Oreca 07 Gibson ELMS/);
  assert.match(payloads.voices[2].payload.embeds[0].description,/Oreca 07 Gibson/);
  assert.match(JSON.stringify(payloads.threads[0].payload),/em_brand_toyota/);
  assert.match(payloads.voices[0].payload.embeds[0].description,/em_brand_toyota/);
  for(const payload of [...payloads.week,...payloads.threads.map(x=>x.payload),...payloads.voices.map(x=>x.payload)]){
    assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.ok(payload.components.every(row=>row.components.every(x=>x.disabled)));
  }
});
test('real test stops before any Discord mutation when the parent is not private',async()=>{
  const calls=[];const channelId='234567890123456789',guildId='345678901234567890';
  const result=await realDiscordPreview(env,{manager:true,user:{id:'456789012345678901'}},'APERÇU',{diagnose:async()=>({ok:true,channelId,guildId}),call:async(e,method,path)=>{calls.push(method);return {ok:true,data:{id:channelId,guild_id:guildId,type:0,permission_overwrites:[]}};}});
  assert.equal(result.ok,false);assert.deepEqual(calls,['GET']);
});
test('diagnostic keeps the token private and does not follow redirects',async()=>{
  const result=await diagnoseDiscordPreview(env,async(url,init)=>{assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://example.test/'}})});
  assert.equal(result.httpStatus,302);assert.doesNotMatch(JSON.stringify(result),/fake_test_webhook/);
  assert.equal(discordPreviewAvailable({...env,SITE_ENV:'production'}),false);
});
test('platform test route rejects non-managers, non-dev and cross-origin requests before any outbound call',async()=>{
  const request=new Request(origin+'/api/platform/discord/test-preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"confirm":"APERÇU"}'});
  const args={path:'/api/platform/discord/test-preview',method:'POST',request,env,actor:{user:{id:'user'},manager:true}};
  await assert.rejects(()=>platformApi({...args,actor:{user:{id:'user'},manager:false}}),/gestionnaires/);
  await assert.rejects(()=>platformApi({...args,env:{...env,SITE_ENV:'production'}}),/indisponible/);
  await assert.rejects(()=>platformApi({...args,request:new Request(request,{headers:{Origin:'https://evil.test','Content-Type':'application/json'}})}),/Origine/);
});

test('diagnostic verifies the incoming webhook without publishing and returns the channel, not the token',async()=>{
  const result=await diagnoseDiscordPreview({...env,DISCORD_TEST_WEBHOOK:env.DISCORD_TEST_WEBHOOK.replace('discord.com/api/','discordapp.com/api/v9/')},async(url,init)=>{
    assert.equal(init.method,'GET');assert.match(url,/^https:\/\/discord\.com\/api\/v10\/webhooks\//);
    assert.equal(init.redirect,'manual');
    return Response.json({type:1,guild_id:'123456789012345678',channel_id:'234567890123456789',token:'fake_test_webhook_not_a_secret'});
  });
  assert.equal(result.ok,true);assert.equal(result.channelUrl,'https://discord.com/channels/123456789012345678/234567890123456789');
  assert.doesNotMatch(JSON.stringify(result),/fake_test_webhook/);
});
