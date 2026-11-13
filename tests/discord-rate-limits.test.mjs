import test from 'node:test';
import assert from 'node:assert/strict';
import {discordRequest} from '../server/recap-discord.mjs';
import {retryAfter,discordFetch} from '../server/discord-api.mjs';

test('retry-after uses Discord delay in seconds without consuming the response',async()=>{
  const response=Response.json({retry_after:0.25},{status:429});
  assert.equal(await retryAfter(response),300);
  assert.deepEqual(await response.json(),{retry_after:0.25});
  assert.equal(await retryAfter(Response.json({retry_after:6},{status:429})),null);
  assert.equal(await retryAfter(new Response('',{status:429,headers:{'retry-after':'2'}})),2050);
  assert.equal(await retryAfter(Response.json({},{status:200})),null);
});

test('a short Discord rate limit retries once and succeeds',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  let calls=0;
  globalThis.fetch=async()=>++calls===1?Response.json({retry_after:0},{status:429}):Response.json({id:'message'});
  assert.deepEqual(await discordRequest({DISCORD_BOT_TOKEN:'fake'},'POST','/channels/test/messages',{content:'hello'}),{id:'message'});
  assert.equal(calls,2);
});

test('a long Discord rate limit stops the pass without repeated calls',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({retry_after:60},{status:429});};
  await assert.rejects(discordRequest({DISCORD_BOT_TOKEN:'fake'},'GET','/guilds/test/channels'),error=>error.status===429);
  assert.equal(calls,1);
});

test('a repeated short rate limit stops after the single retry',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({retry_after:0},{status:429});};
  await assert.rejects(discordRequest({DISCORD_BOT_TOKEN:'fake'},'GET','/guilds/test/channels'),error=>error.status===429);
  assert.equal(calls,2);
});

test('every module asks Discord the same way: one more try after a short wait, then the answer as data', async t => {
  const original = globalThis.fetch, calls = [];
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? Response.json({retry_after:0.01, code:0}, {status:429}) : Response.json({code:50007}, {status:403});
  };
  const answer = await discordFetch({DISCORD_BOT_TOKEN:' fake '}, 'POST', '/channels/1/messages', {content:'x'});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bot fake');
  assert.deepEqual({ok:answer.ok, status:answer.status, code:answer.code}, {ok:false, status:403, code:50007});
});
