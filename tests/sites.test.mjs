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

test('the main address is a showcase: anyone looks without signing in, only the platform managers change it', async () => {
  const APEX='https://endurance-manager.app', MANAGER='111111111111111111';
  const {DB,call}=setup({APP_ORIGIN:APEX,ADMIN_DISCORD_IDS:MANAGER});
  const session=async (user,role)=>{const raw=user.slice(0,1).repeat(64);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    DB.db.prepare("INSERT INTO users(id,name,role,created_at) VALUES(?,?,?,0)").run(user,'Joueur',role);DB.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,user,4102444800);return {Cookie:`__Secure-em_dev_session=${raw}`};};
  const pilot=await session('555555555555555555','organizer'),manager=await session(MANAGER,'pilot');
  const visitor=await (await call(`${APEX}/api/session`)).json();
  assert.equal(visitor.access,'member');assert.equal(visitor.openSite,true);assert.deepEqual(visitor.permissions,[],'read only');
  assert.equal((await call(`${APEX}/api/races`)).status,200,'the races are visible without signing in');
  assert.deepEqual((await (await call(`${APEX}/api/session`,{headers:pilot})).json()).permissions,[],'a signed-in player only looks too');
  assert.ok((await (await call(`${APEX}/api/session`,{headers:manager})).json()).permissions.includes('admin'));
  const write=(headers,path,body)=>call(`${APEX}${path}`,{method:'POST',headers:{...headers,Origin:APEX,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await write(pilot,'/api/races',{name:'Test',categories:['GT3'],departures:[{date:'2090-10-15',time:'21:00'}]})).status,403);
  // Reset of the showcase: fictional races, crews and pilots; no Discord server; nobody real.
  DB.db.prepare("UPDATE communities SET discord_guild_id='900000000000000001' WHERE slug='commu-dev'").run();
  assert.equal((await write(pilot,'/api/platform/showcase',{confirm:'VITRINE'})).status,403,'managers only');
  assert.equal((await write(manager,'/api/platform/showcase',{})).status,400,'confirmation needed');
  // D1 counts every statement of a request (50 at most on the free plan): the reset stays well below.
  let statements=0;const prepare=DB.prepare.bind(DB);DB.prepare=sql=>{statements++;return prepare(sql);};
  let reset;try{reset=await write(manager,'/api/platform/showcase',{confirm:'VITRINE'});}finally{DB.prepare=prepare;}
  assert.ok(statements<=35,`${statements} statements`);
  assert.equal(reset.status,200,await reset.clone().text());
  const community=DB.db.prepare("SELECT * FROM communities WHERE slug='commu-dev'").get();
  assert.equal(community.discord_guild_id,null);assert.equal(community.name,'Endurance Manager');
  const races=(await (await call(`${APEX}/api/races`)).json()).events;
  assert.ok(races.length>=6);assert.ok(races.every(race=>race.departures.every(departure=>/^\d{4}-\d{2}-\d{2}$/.test(departure.date)&&/^\d{2}:\d{2}$/.test(departure.time))),'each start has its date and time, as shown on the cards');assert.ok(races.some(race=>race.format==='solo'));assert.ok(races.some(race=>race.schedulePending));
  assert.ok(races.some(race=>race.departures.some(departure=>departure.crews.length&&departure.crews[0].registrationIds?.length)),'crews with their pilots');
  assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM registrations WHERE user_id IS NOT NULL").get().n,0,'no real person');
});

test('installable app: the manifest has the name of the community of the address, the platform\'s own elsewhere', async () => {
  const {call}=setup();
  const own=await (await call(`${TEST_SITE}/manifest.webmanifest`)).json();
  assert.equal(own.name,'Commu Test · Endurance Manager');assert.equal(own.short_name,'TEST');
  assert.equal(own.display,'standalone');assert.equal(own.start_url,'/');
  assert.ok(own.icons.some(icon=>icon.purpose==='maskable'));
  const platform=await (await call('https://endurance-manager.app/manifest.webmanifest')).json();
  assert.equal(platform.name,'Endurance Manager');
  const unknown=await call('https://inconnue.endurance-manager.app/manifest.webmanifest');
  assert.equal((await unknown.json()).name,'Endurance Manager','an unknown address never names a community');
});

test('installable app of a community with a Discord icon: that icon only, served at the site\'s address', async t => {
  const {DB,call}=setup();
  DB.db.prepare("UPDATE communities SET discord_guild_id='1269541162025353289', appearance=? WHERE slug='commu-test'").run(JSON.stringify({discordIcon:'72be2adc50e3b4d47e29f5609d3cb8da'}));
  const manifest=await (await call(`${TEST_SITE}/manifest.webmanifest`)).json();
  assert.deepEqual(manifest.icons.map(icon=>icon.src),['/app-icon.png?size=192&v=72be2adc50e3b4d47e29f5609d3cb8da','/app-icon.png?size=512&v=72be2adc50e3b4d47e29f5609d3cb8da'],'never the site\'s logo, nor a maskable one');
  const realFetch=globalThis.fetch,asked=[];
  globalThis.fetch=async url=>{asked.push(String(url));return new Response('png',{headers:{'Content-Type':'image/png'}});};
  t.after(()=>{globalThis.fetch=realFetch;});
  const icon=await call(`${TEST_SITE}/app-icon.png?size=180`);
  assert.equal(icon.headers.get('Content-Type'),'image/png');assert.equal(await icon.text(),'png');
  assert.deepEqual(asked,['https://cdn.discordapp.com/icons/1269541162025353289/72be2adc50e3b4d47e29f5609d3cb8da.png?size=256']);
  const platform=await (await call('https://endurance-manager.app/manifest.webmanifest')).json();
  assert.ok(platform.icons.some(icon=>icon.src==='/images/app-icon-512.png'),'the main site keeps its logo');
});
