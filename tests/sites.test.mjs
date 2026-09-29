import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import app from '../server/worker-with-migrations.mjs';
import {cookieNames} from '../server/core.mjs';

// One site per community: <slug>.endurance-manager.app, one sign-in shared by all of them.
const MAIN='https://commu-dev.endurance-manager.app', TEST_SITE='https://commu-test.endurance-manager.app';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
function setup(extra={}){
  const DB=new D1();
  DB.db.prepare("INSERT INTO communities(id,slug,name,short_name,created_at) VALUES('c-test','commu-test','Commu Test','TEST',0)").run();
  const env={DB,APP_ORIGIN:MAIN,BASE_DOMAIN:'endurance-manager.app',SITE_ENV:'development',COMMUNITY:'commu-dev',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'secret',
    ASSETS:{fetch:async()=>new Response('<html>site</html>',{headers:{'Content-Type':'text/html'}})},...extra};
  const call=(url,init={})=>app.fetch(new Request(url,{...init,headers:{'CF-Connecting-IP':'1.2.3.4',...init.headers}}),env,{waitUntil(){}});
  return {DB,env,call};
}
const cookiesOf=response=>response.headers.getSetCookie();

test('the address chooses the community; an unknown community has no site', async () => {
  const {call}=setup();
  assert.equal((await (await call(`${MAIN}/api/session`)).json()).community.slug,'commu-dev');
  assert.equal((await (await call(`${TEST_SITE}/api/session`)).json()).community.slug,'commu-test');
  const unknown=await call('https://inconnue.endurance-manager.app/api/session');
  assert.equal(unknown.status,404);
  const page=await call('https://inconnue.endurance-manager.app/lmu/',{headers:{Accept:'text/html'}});
  assert.equal(page.status,404);assert.match(await page.text(),/Communauté introuvable/);
  // A write must come from the site it is sent to.
  const cross=await call(`${TEST_SITE}/api/auth/logout`,{method:'POST',headers:{Origin:MAIN,'Content-Type':'application/json'},body:'{}'});
  assert.equal(cross.status,403);
});

test('one Discord return address; the player comes back to the community site the sign-in started from', async () => {
  const {DB,call}=setup();
  const start=await call(`${TEST_SITE}/api/auth/discord?return=${encodeURIComponent('/lmu/#event=11111111-1111-4111-8111-111111111111')}`);
  assert.equal(start.status,302);
  const discord=new URL(start.headers.get('Location'));
  assert.equal(discord.searchParams.get('redirect_uri'),`${MAIN}/api/auth/discord/callback`,'a single return address');
  const set=cookiesOf(start);
  assert.ok(set.every(value=>value.includes('Domain=.endurance-manager.app;')),'shared by the sites of the platform');
  assert.ok(set.some(value=>value.startsWith('__Secure-em_dev_oauth=')),'development cookies have their own names');
  const jar=set.map(value=>value.split(';')[0]).join('; ');
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/token')?{access_token:'mock'}:{id:'222222222222222222',username:'Leo'});
  let callback;
  try{callback=await call(`${MAIN}/api/auth/discord/callback?code=c&state=${discord.searchParams.get('state')}`,{headers:{Cookie:jar}});}finally{globalThis.fetch=realFetch;}
  assert.equal(callback.headers.get('Location'),`${TEST_SITE}/lmu/#event=11111111-1111-4111-8111-111111111111`);
  const session=cookiesOf(callback).find(value=>value.startsWith('__Secure-em_dev_session='));
  assert.match(session,/Domain=\.endurance-manager\.app;.*HttpOnly; Secure/);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
  // The same session works on another community site (access then depends on its Discord server).
  const cookie=session.split(';')[0];
  assert.equal((await (await call(`${TEST_SITE}/api/session`,{headers:{Cookie:cookie}})).json()).user.name,'Leo');
  assert.equal((await (await call(`${MAIN}/api/session`,{headers:{Cookie:cookie}})).json()).user.name,'Leo');
});

test('never sent back to another site after Discord, and production cookies keep their own names', async () => {
  const {call}=setup();
  const start=await call(`${TEST_SITE}/api/auth/discord`);
  const jar=cookiesOf(start).map(value=>value.split(';')[0]).map(pair=>pair.startsWith('__Secure-em_dev_return=')?`__Secure-em_dev_return=${encodeURIComponent('https://evil.example/steal')}`:pair).join('; ');
  const state=new URL(start.headers.get('Location')).searchParams.get('state');
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/token')?{access_token:'mock'}:{id:'222222222222222222',username:'Leo'});
  let callback;
  try{callback=await call(`${MAIN}/api/auth/discord/callback?code=c&state=${state}`,{headers:{Cookie:jar}});}finally{globalThis.fetch=realFetch;}
  assert.equal(callback.headers.get('Location'),`${MAIN}/`);
  assert.equal(cookieNames({BASE_DOMAIN:'endurance-manager.app'}).session,'__Secure-em_session');
  assert.equal(cookieNames({}).session,'__Host-em_session','single site (production today): unchanged');
});

test('"Mes communautés": the communities of the player, with the address of each site; shown only to players of several communities', async () => {
  const {DB,call}=setup();
  const user='222222222222222222',raw='e'.repeat(64);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES(?,?,0)").run(user,'Leo');
  DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,user,4102444800);
  DB.db.prepare("UPDATE communities SET discord_guild_id='900000000000000001'").run();
  const time=Math.floor(Date.now()/1000);
  const member=DB.db.prepare("INSERT INTO memberships(community_id,user_id,status,checked_at,created_at) VALUES(?,?,'member',?,?)");
  const headers={Cookie:`__Secure-em_dev_session=${raw}`};
  member.run('e0a1c0de-0000-4000-8000-000000000001',user,time,time);
  assert.deepEqual((await (await call(`${MAIN}/api/session`,{headers})).json()).communities,[],'a single community: no selector');
  member.run('c-test',user,time,time);
  const mine=(await (await call(`${MAIN}/api/session`,{headers})).json()).communities;
  assert.deepEqual(mine.map(item=>[item.slug,item.url,item.current]),[['commu-dev',`${MAIN}/`,true],['commu-test',`${TEST_SITE}/`,false]]);
  assert.equal((await (await call(`${TEST_SITE}/api/session`,{headers})).json()).communities.length,2,'the same on every site');
});

test('the main address stays open to every Discord player, organizers keep their role; community sites stay reserved', async () => {
  const APEX='https://endurance-manager.app';
  const {DB,call}=setup({APP_ORIGIN:APEX});
  const session=async (user,role)=>{const raw=user.slice(0,1).repeat(64);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    DB.db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,?,?,0)").run(user,'Joueur',role);DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,user,4102444800);return {Cookie:`__Secure-em_dev_session=${raw}`};};
  const pilot=await session('555555555555555555','pilot'),organizer=await session('666666666666666666','organizer');
  const apex=await (await call(`${APEX}/api/session`,{headers:pilot})).json();
  assert.equal(apex.access,'member');assert.equal(apex.openSite,true,'the site keeps its look (no community name)');assert.deepEqual(apex.permissions.sort(),['endurance','solo_open']);
  assert.ok((await (await call(`${APEX}/api/session`,{headers:organizer})).json()).permissions.includes('create_race'));
  assert.equal((await (await call(`${APEX}/api/session`)).json()).access,'anonymous','signed in with Discord');
  assert.notEqual((await (await call(`${MAIN}/api/session`,{headers:pilot})).json()).access,'member','community sites: members of their Discord only');
});
