import test from 'node:test';
import assert from 'node:assert/strict';
import {discordPreviewAvailable,discordPreviewMessages,sendDiscordPreview} from '../server/discord-test-preview.mjs';
import {platformApi} from '../server/api-platform.mjs';
const origin='https://dev.endurance-manager.app';
const env={SITE_ENV:'development',APP_ORIGIN:origin,DISCORD_TEST_WEBHOOK:'https://discord.com/api/webhooks/123456789012345678/fake_test_webhook_not_a_secret'};
test('only exact dev and a canonical Discord webhook are accepted',async()=>{
  const call=async()=>{throw new Error('must not call');};
  for(const invalid of [{...env,SITE_ENV:'production'},{...env,APP_ORIGIN:'https://endurance-manager.app'},{...env,DISCORD_TEST_WEBHOOK:'https://discord.com.evil.test/api/webhooks/123456789012345678/fake_test_webhook_not_a_secret'},{...env,DISCORD_TEST_WEBHOOK:env.DISCORD_TEST_WEBHOOK+'?thread_id=12'}]){
    assert.equal(discordPreviewAvailable(invalid),false);
    assert.equal((await sendDiscordPreview(invalid,call)).sent,0);
  }
  assert.equal(discordPreviewAvailable(env),true);
});
test('fixed fictitious messages: no active buttons, no mentions, categories include non-entered classes',async()=>{
  const cards=discordPreviewMessages();
  assert.equal(cards.length,3);
  for(const card of cards){assert.deepEqual(card.allowed_mentions.parse,[]);assert.equal(card.components,undefined);assert.equal(card.flags,4096);}
  assert.match(cards[0].embeds[1].description,/LMP2 WEC/);
  assert.match(cards[1].embeds[0].description,/LMP2 WEC/);
  assert.match(cards[2].embeds[1].description,/#TDZ TEST 03 · Oreca 07 ELMS · LMP2 ELMS/);
  assert.doesNotMatch(JSON.stringify(cards),/responsable/);
  const calls=[];const result=await sendDiscordPreview(env,async(url,init)=>{
    calls.push({url,init});return Response.json({id:'123456789012345678',channel_id:'234567890123456789',guild_id:'345678901234567890'});
  });
  assert.equal(result.sent,3);assert.equal(result.ok,true);
  assert.equal(calls.length,3);assert.ok(calls.every(x=>x.url.endsWith('?wait=true')&&x.init.redirect==='error'&&x.init.method==='POST'));
  assert.doesNotMatch(JSON.stringify(result),/fake_test_webhook/);
});
test('a failed second send stops, reports the confirmed count and never exposes the secret',async()=>{
  let n=0;const result=await sendDiscordPreview(env,async()=>{
    if(++n===1)return Response.json({id:'123456789012345678',channel_id:'234567890123456789'});
    throw new Error(env.DISCORD_TEST_WEBHOOK);
  });
  assert.equal(n,2);assert.equal(result.sent,1);assert.equal(result.ok,false);
  assert.doesNotMatch(JSON.stringify(result),/fake_test_webhook/);
});
test('platform test route rejects non-managers, non-dev and cross-origin requests before any outbound call',async()=>{
  const request=new Request(origin+'/api/platform/discord/test-preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"confirm":"APERÇU"}'});
  const args={path:'/api/platform/discord/test-preview',method:'POST',request,env,actor:{user:{id:'user'},manager:true}};
  await assert.rejects(()=>platformApi({...args,actor:{user:{id:'user'},manager:false}}),/gestionnaires/);
  await assert.rejects(()=>platformApi({...args,env:{...env,SITE_ENV:'production'}}),/indisponible/);
  await assert.rejects(()=>platformApi({...args,request:new Request(request,{headers:{Origin:'https://evil.test','Content-Type':'application/json'}})}),/Origine/);
});
