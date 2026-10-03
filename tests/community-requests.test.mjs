import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import app from '../server/worker-with-migrations.mjs';

// Requests for a new community (demande-communaute.html), read by the platform managers in « Plateforme ».
const SITE='https://endurance-manager.app', MANAGER='111111111111111111', OWNER='222222222222222222';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function setup(extra={}){
  const DB=new D1();
  const env={DB,APP_ORIGIN:SITE,BASE_DOMAIN:'endurance-manager.app',COMMUNITY:'commu-dev',ADMIN_DISCORD_IDS:MANAGER,DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'secret',
    ASSETS:{fetch:async()=>new Response('<html>site</html>',{headers:{'Content-Type':'text/html'}})},...extra};
  const tokens={};
  for(const [user,name,letter] of [[MANAGER,'Gestionnaire','a'],[OWNER,'Gérant','b']]){
    DB.db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(user,name);
    DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await sha(letter.repeat(64)),user,4102444800);
    tokens[user]=letter.repeat(64);
  }
  const call=(path,{as,method='GET',body}={})=>app.fetch(new Request(`${SITE}${path}`,{method,headers:{'CF-Connecting-IP':'1.2.3.4',...(as?{Cookie:`__Secure-em_session=${tokens[as]}`}:{}),
    ...(method==='GET'?{}:{Origin:SITE,'Content-Type':'application/json'})},body:body?JSON.stringify(body):undefined}),env,{waitUntil(){}});
  return {DB,call};
}
const REQUEST={communityName:'Team Rookie Racing',shortName:'TRR',slug:'team-rookie',guildId:'123456789012345678',games:'both',members:'20 à 50',inviteUrl:'https://discord.gg/abcd',message:'Nous roulons le mardi.'};

test('a signed-in Discord account sends a request; it sees it with its status', async () => {
  const {call}=await setup();
  assert.equal((await call('/api/community-requests',{method:'POST',body:REQUEST})).status,401,'signed in with Discord only');
  const sent=await call('/api/community-requests',{as:OWNER,method:'POST',body:REQUEST});
  assert.equal(sent.status,201,JSON.stringify(await sent.clone().json()));
  const {requests}=await (await call('/api/community-requests',{as:OWNER})).json();
  assert.equal(requests.length,1);assert.equal(requests[0].status,'pending');assert.equal(requests[0].slug,'team-rookie');
  assert.equal(requests[0].requester,undefined,'the requester sees their own requests only');
  assert.equal((await (await call('/api/community-requests',{as:MANAGER})).json()).requests.length,0,'never the requests of another account');
});

test('a request is checked: fields, one pending request per server, a server or an address already in use', async () => {
  const {DB,call}=await setup();
  const send=body=>call('/api/community-requests',{as:OWNER,method:'POST',body});
  assert.equal((await send({...REQUEST,guildId:'abc'})).status,400);
  assert.equal((await send({...REQUEST,slug:'dev'})).status,400,'reserved address');
  assert.equal((await send({...REQUEST,games:'acc'})).status,400);
  assert.equal((await send({...REQUEST,inviteUrl:'https://evil.example/x'})).status,400);
  assert.equal((await send(REQUEST)).status,201);
  assert.equal((await send({...REQUEST,slug:'autre'})).status,409,'one pending request per Discord server');
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,discord_guild_id,created_at) VALUES('c-x','prise','Prise','P','999999999999999999',0)").run();
  assert.equal((await send({...REQUEST,guildId:'999999999999999999',slug:'nouvelle'})).status,409,'server already has its space');
  assert.equal((await send({...REQUEST,guildId:'888888888888888888',slug:'prise'})).status,409,'address already taken');
});

test('platform managers list requests, refuse one, and creating the community closes its request', async () => {
  const {DB,call}=await setup();
  await call('/api/community-requests',{as:OWNER,method:'POST',body:REQUEST});
  assert.equal((await call('/api/platform/community-requests',{as:OWNER})).status,403,'managers only');
  const {requests}=await (await call('/api/platform/community-requests',{as:MANAGER})).json();
  assert.equal(requests.length,1);assert.deepEqual(requests[0].requester,{id:OWNER,name:'Gérant'});
  const id=requests[0].id;
  assert.equal((await call(`/api/platform/community-requests/${id}`,{as:OWNER,method:'PATCH',body:{status:'rejected'}})).status,403);
  assert.equal((await call(`/api/platform/community-requests/${id}`,{as:MANAGER,method:'PATCH',body:{status:'rejected'}})).status,200);
  assert.equal(DB.db.prepare('SELECT status FROM community_requests WHERE id=?').get(id).status,'rejected');
  await call(`/api/platform/community-requests/${id}`,{as:MANAGER,method:'PATCH',body:{status:'pending'}});
  const created=await call('/api/platform/communities',{as:MANAGER,method:'POST',body:{name:'Team Rookie Racing',shortName:'TRR',slug:'team-rookie',guildId:REQUEST.guildId,requestId:id}});
  assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  assert.equal(DB.db.prepare('SELECT status FROM community_requests WHERE id=?').get(id).status,'done');
});

test('the platform manager is told on Discord when a webhook is set; a Discord failure keeps the request', async () => {
  const hook='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz';
  const {DB,call}=await setup({COMMUNITY_REQUESTS_WEBHOOK_URL:hook});
  const realFetch=globalThis.fetch, posted=[];
  globalThis.fetch=async(url,init)=>{posted.push({url:String(url),body:JSON.parse(init.body)});throw new Error('down');};
  try{assert.equal((await call('/api/community-requests',{as:OWNER,method:'POST',body:REQUEST})).status,201);}finally{globalThis.fetch=realFetch;}
  assert.equal(posted.length,1);assert.equal(posted[0].url,hook);
  assert.match(posted[0].body.content,/Team Rookie Racing/);assert.deepEqual(posted[0].body.allowed_mentions,{parse:[]});
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM community_requests').get().n,1);
});
