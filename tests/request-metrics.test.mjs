import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredDatabase,measureRequest} from '../server/request-metrics.mjs';

function database() {
  const calls=[];
  const result={results:[{name:'private-name'}],meta:{rows_read:3,rows_written:0,duration:2}};
  return {calls,prepare(sql) {
    return {bind(...params){calls.push(['bind',params]);return this;},async all(){calls.push(['all',sql]);return result;},async run(){calls.push(['run',sql]);return result;}};
  },async batch(statements){calls.push(['batch',statements.length]);assert.ok(statements.every(s=>typeof s.all==='function'));return statements.map(()=>result);}};
}

test('D1 metrics count first, all and batch once, without re-executing queries or exposing SQL',async()=>{
  const DB=database(),measured=measuredDatabase(DB);
  assert.equal(await measured.database.prepare('SELECT sensitive').bind('private-token').first('name'),'private-name');
  await measured.database.prepare('SELECT another').all();
  await measured.database.batch([measured.database.prepare('UPDATE one').bind('secret'),measured.database.prepare('UPDATE two')]);
  assert.deepEqual(measured.totals,{queries:4,rows_read:12,rows_written:0,sql_ms:8,metadata_complete:true});
  assert.equal(DB.calls.filter(c=>c[0]==='all').length,2);
  assert.equal(DB.calls.filter(c=>c[0]==='batch').length,1);
  assert.doesNotMatch(JSON.stringify(measured.totals),/private|secret|SELECT|UPDATE/);
});

test('sampled invocation metrics use fixed route names and counts, with no IDs, parameters or bodies',async t=>{
  const logs=[],previous=console.log;console.log=entry=>logs.push(entry);t.after(()=>{console.log=previous;});
  const request=new Request('https://private.example/api/races?game=lmu&token=private-token',{headers:{Cookie:'secret-cookie'}});
  const response=await measureRequest(request,{DB:database(),REQUEST_METRICS:'on'},async env=>{
    await env.DB.prepare('SELECT sensitive').first();return new Response(null,{status:304});
  });
  assert.equal(response.status,304);assert.equal(logs.length,1);assert.equal(logs[0].route,'events');assert.equal(logs[0].status,304);assert.equal(logs[0].rows_read,3);
  assert.doesNotMatch(JSON.stringify(logs),/private|token|cookie|sensitive/);
  await assert.rejects(measureRequest(request,{DB:database(),REQUEST_METRICS:'on'},async()=>{const error=new Error('private error');error.status=403;throw error;}));
  assert.equal(logs[1].status,403);assert.doesNotMatch(JSON.stringify(logs),/private error/);
});

test('disabled metrics and unrelated routes pass through the original binding',async()=>{
  const env={DB:database()};
  await measureRequest(new Request('https://site.example/api/races'),env,async next=>{assert.equal(next,env);return new Response();});
  env.REQUEST_METRICS='on';
  await measureRequest(new Request('https://site.example/api/auth/discord/callback?code=secret'),env,async next=>{assert.equal(next,env);return new Response();});
});
