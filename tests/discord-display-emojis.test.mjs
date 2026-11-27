import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brandEmojiAsset,brandMark,categoryEmojiAsset,readDisplayEmojis,registerOneDisplayEmoji,knownDisplayEmojis} from '../server/discord-display-emojis.mjs';
test('application logos are optional, bounded and shared by application, not guild',async()=>{
  const env={DISCORD_CLIENT_ID:'display-test-1',ASSETS:{fetch:async request=>new Response(readFileSync(new URL('..'+new URL(request.url).pathname,import.meta.url)))}};
  const calls=[];
  const request=async(method,path,body)=>{calls.push({method,path,body});return method==='GET'?{items:[{name:'em_hypercar',id:'111'}]}:{id:'222'};};
  assert.equal(await readDisplayEmojis(env,request,100000),knownDisplayEmojis(env));
  assert.deepEqual(knownDisplayEmojis(env),{em_hypercar:'111'});
  const assets=[brandEmojiAsset('Toyota GR010 Hybrid'),brandEmojiAsset('Ferrari 296 LMGT3')];
  assert.equal(assets[0].path,'/images/brands/toyota.webp');
  await registerOneDisplayEmoji(env,assets,request,100000);
  assert.equal(brandMark('Toyota GR010 Hybrid',knownDisplayEmojis(env)),'<:em_brand_toyota:222>');
  assert.equal(calls[1].path,'/applications/display-test-1/emojis');
  assert.match(calls[1].body.image,/^data:image\/webp;base64,/);
  await registerOneDisplayEmoji(env,assets,request,100001);
  assert.equal(calls.length,2,'not a burst of uploads');
  assert.equal(brandMark('Unknown car',knownDisplayEmojis(env)),'');
  assert.equal(categoryEmojiAsset('em_hypercar').path,'/images/discord-emojis/hypercar.png');
  assert.equal(knownDisplayEmojis({DISCORD_CLIENT_ID:'another-app'}),null);
});
test('failed registry or asset fetch is cosmetic',async()=>{
  const env={DISCORD_CLIENT_ID:'display-test-2',ASSETS:{fetch:async()=>new Response('not an image')}};
  const fail=async()=>{throw new Error('Discord unavailable');};
  assert.equal(await readDisplayEmojis(env,fail,100000),null);
  assert.doesNotReject(()=>registerOneDisplayEmoji(env,[brandEmojiAsset('Toyota GR010 Hybrid')],fail,100000));
});


test('a missing asset does not block other brands',async()=>{
  const env={DISCORD_CLIENT_ID:'display-test-3',ASSETS:{fetch:async request=>new URL(request.url).pathname.includes('toyota')?new Response('',{status:404}):new Response(readFileSync(new URL('..'+new URL(request.url).pathname,import.meta.url)))}};
  const calls=[];const request=async(method,path,body)=>{calls.push({method,path,body});return method==='GET'?{items:[]}:{id:'321'};};
  await readDisplayEmojis(env,request,100000);
  const assets=[brandEmojiAsset('Toyota GR010 Hybrid'),brandEmojiAsset('Ferrari 296 LMGT3')];
  await registerOneDisplayEmoji(env,assets,request,100000);
  await registerOneDisplayEmoji(env,assets,request,100000+31*60000);
  assert.equal(calls.length,2);assert.equal(calls[1].body.name,'em_brand_ferrari');
});
