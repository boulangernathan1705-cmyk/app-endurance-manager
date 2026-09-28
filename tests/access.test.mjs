import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {communityAccess, refreshMemberships, PERMISSIONS, DEFAULT_EVERYONE} from '../server/access.mjs';
import worker from '../server/worker.mjs';
import {GUILD, ORGA_ROLE, SAFE_ROLE, DEV_COMMUNITY, linkTestServer} from './fixtures/discord-server.mjs';

// Access through the community's Discord server, with a fake Discord answering the bot like the real one.
const ROOT='https://site.example', MANAGER='111111111111111111', PILOT='222222222222222222', OWNER='333333333333333333', BOSS='444444444444444444';
const ADMIN_ROLE='900000000000000010';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}

// Fake Discord server: members and their roles; calls are counted.
function fakeDiscord(t, members, {down=false}={}) {
  const calls=[];
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (url, options={})=>{
    const path=String(url).replace('https://discord.com/api/v10','');
    calls.push(path);
    assert.equal(options.headers?.Authorization,'Bot test-bot','the bot token is used');
    if(down)return new Response('{}',{status:500});
    if(path===`/guilds/${GUILD}`)return Response.json({id:GUILD,name:'Serveur test',owner_id:OWNER});
    if(path===`/guilds/${GUILD}/roles`)return Response.json([
      {id:GUILD,name:'@everyone',permissions:'0',position:0},
      {id:ORGA_ROLE,name:'Orga',permissions:'0',position:2},
      {id:SAFE_ROLE,name:'Safe',permissions:'0',position:1},
      {id:ADMIN_ROLE,name:'Staff',permissions:'8',position:3}]);
    const member=path.match(new RegExp(`^/guilds/${GUILD}/members/(\\d+)$`));
    if(member)return members[member[1]]?Response.json({user:{id:member[1]},roles:members[member[1]],nick:'Pseudo '+member[1].slice(0,3)}):new Response(JSON.stringify({code:10007}),{status:404});
    return new Response('{}',{status:404});
  };
  t.after(()=>{globalThis.fetch=realFetch;});
  return calls;
}
function setup(){
  const DB=new D1();linkTestServer(DB.db);
  for(const id of [MANAGER,PILOT,OWNER,BOSS,'555555555555555555'])DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES(?,?,0)").run(id,'Joueur '+id.slice(0,3));
  const env={DB,APP_ORIGIN:ROOT,ADMIN_DISCORD_IDS:MANAGER,DISCORD_BOT_TOKEN:'test-bot',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'secret'};
  const community={id:DEV_COMMUNITY,slug:'commu-dev',name:'Commu Dev',discordGuildId:GUILD,modules:{}};
  return {DB,env,community};
}
const accessOf=(env,community,id)=>communityAccess(env,{user:id?{id}:null},community);

test('members get the permissions of their Discord roles; others get nothing', async t => {
  const {env,community}=setup();
  const calls=fakeDiscord(t,{[PILOT]:[],[BOSS]:[ORGA_ROLE,SAFE_ROLE]});
  assert.equal((await accessOf(env,community,null)).status,'anonymous');
  const pilot=await accessOf(env,community,PILOT);
  assert.equal(pilot.status,'member');assert.deepEqual([...pilot.permissions].sort(),[...DEFAULT_EVERYONE].sort(),'@everyone by default: enter and create one\'s crew');
  const boss=await accessOf(env,community,BOSS);
  assert.ok(['create_race','manage_races','manage_crews','safe_races','register'].every(p=>boss.permissions.has(p)),'roles add up');
  assert.ok(!boss.permissions.has('admin'));
  const stranger=await accessOf(env,community,'555555555555555555');
  assert.equal(stranger.status,'not-member');assert.equal(stranger.permissions.size,0);
  // The player's other servers are never asked: only this server.
  assert.ok(calls.every(path=>path.startsWith(`/guilds/${GUILD}`)));
});

test('the owner of the server and roles with the Discord "Administrator" permission can do everything', async t => {
  const {env,community}=setup();
  fakeDiscord(t,{[OWNER]:[],[BOSS]:[ADMIN_ROLE]});
  for(const id of [OWNER,BOSS])assert.deepEqual([...(await accessOf(env,community,id)).permissions].sort(),[...PERMISSIONS].sort(),id);
});

test('platform managers enter every community; no server or no bot answer means no access', async t => {
  const {env,community}=setup();
  fakeDiscord(t,{},{down:true});
  const manager=await accessOf(env,community,MANAGER);
  assert.equal(manager.manager,true);assert.equal(manager.permissions.size,PERMISSIONS.length);
  assert.equal((await accessOf(env,community,PILOT)).status,'unavailable','Discord down and never checked: closed');
  assert.equal((await accessOf(env,{...community,discordGuildId:null},PILOT)).status,'unavailable','no server linked: closed');
});

test('memberships are checked at most once a day; leaving the server or losing a role is followed', async t => {
  const {DB,env,community}=setup();
  const members={[PILOT]:[ORGA_ROLE]};
  const calls=fakeDiscord(t,members);
  assert.ok((await accessOf(env,community,PILOT)).permissions.has('create_race'));
  const count=calls.length;
  await accessOf(env,community,PILOT);
  assert.equal(calls.length,count,'fresh check: Discord is not asked again');
  // A day later the daily task checks again: the role was removed, then the player left.
  members[PILOT]=[];
  DB.db.prepare('UPDATE memberships SET checked_at=checked_at-90000').run();
  assert.equal(await refreshMemberships(env,[community]),1);
  assert.ok(!(await accessOf(env,community,PILOT)).permissions.has('create_race'));
  delete members[PILOT];
  DB.db.prepare('UPDATE memberships SET checked_at=checked_at-90000').run();
  assert.equal((await accessOf(env,community,PILOT)).status,'not-member');
  assert.equal(DB.db.prepare('SELECT status FROM memberships WHERE user_id=?').get(PILOT).status,'left');
});

test('a community admin sets what each Discord role allows, "@everyone" included', async t => {
  const {DB,env,community}=setup();
  fakeDiscord(t,{[PILOT]:[SAFE_ROLE]});
  DB.db.prepare("INSERT INTO community_role_permissions(community_id,discord_role_id,permissions,updated_at) VALUES(?,?,?,0)").run(DEV_COMMUNITY,GUILD,JSON.stringify(['register','not-a-permission']));
  assert.deepEqual([...(await accessOf(env,community,PILOT)).permissions].sort(),['register','safe_races'],'unknown names are ignored');
});

test('the site: nothing for visitors or non-members, the members page lists the Discord roles', async t => {
  const {DB,env}=setup();
  fakeDiscord(t,{[PILOT]:[],[BOSS]:[ADMIN_ROLE]});
  const session=async (userId)=>{
    let cookieHeader='';
    if(userId){const raw='c'.repeat(63)+userId.slice(0,1);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      DB.db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,userId,4102444800);cookieHeader=`__Host-em_session=${raw}`;}
    return path=>worker.fetch(new Request(ROOT+path,{headers:{Cookie:cookieHeader,'CF-Connecting-IP':userId||'x'}}),env);
  };
  const visitor=await session(null);
  assert.equal((await (await visitor('/api/session')).json()).access,'anonymous');
  assert.equal((await visitor('/api/events')).status,401);
  const stranger=await session('555555555555555555');
  const strangerSession=await (await stranger('/api/session')).json();
  assert.equal(strangerSession.access,'not-member');assert.equal(strangerSession.community.name,'Commu Dev');
  const refused=await stranger('/api/events');assert.equal(refused.status,403);assert.match((await refused.json()).error,/membres du serveur Discord « Commu Dev »/);
  const pilot=await session(PILOT);
  assert.equal((await pilot('/api/events')).status,200);
  assert.equal((await pilot('/api/members')).status,403);
  const boss=await session(BOSS);
  const members=await (await boss('/api/members')).json();
  assert.equal(members.community.discordServer,'Serveur test');
  const listed=members.members.find(member=>member.id===BOSS);
  assert.deepEqual(listed.roles,[{id:ADMIN_ROLE,name:'Staff'}]);assert.equal(listed.discordAdmin,true);
  assert.ok(!members.members.some(member=>member.id==='555555555555555555'),'only members of the server');
});

test('community admins set the permissions of each Discord role and the modules', async t => {
  const {DB,env}=setup();
  fakeDiscord(t,{[PILOT]:[SAFE_ROLE],[BOSS]:[ADMIN_ROLE]});
  const as=async (userId,path,method='GET',body)=>{
    const raw='d'.repeat(63)+userId.slice(0,1);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    DB.db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,userId,4102444800);
    const headers={Cookie:`__Host-em_session=${raw}`,'CF-Connecting-IP':userId};
    if(method!=='GET'){headers.Origin=ROOT;headers['Content-Type']='application/json';}
    return worker.fetch(new Request(ROOT+'/api/community/'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
  };
  assert.equal((await as(PILOT,'settings')).status,403);
  const settings=await (await as(BOSS,'settings')).json();
  assert.deepEqual(settings.roles.find(role=>role.name==='@everyone').permissions,[...DEFAULT_EVERYONE]);
  assert.equal((await as(BOSS,`roles/${SAFE_ROLE}`,'PUT',{permissions:['register','create_race']})).status,200);
  assert.equal((await as(BOSS,`roles/${SAFE_ROLE}`,'PUT',{permissions:['everything']})).status,400);
  assert.equal((await as(BOSS,'roles/999999999999999999','PUT',{permissions:[]})).status,404,'only roles of the server');
  assert.ok((await communityAccess(env,{user:{id:PILOT}},{...(await import('../server/community.mjs')).DEFAULT_COMMUNITY_SLUG&&{id:DEV_COMMUNITY,slug:'commu-dev',discordGuildId:GUILD,modules:{}}})).permissions.has('create_race'));
  assert.equal((await as(BOSS,'modules','PATCH',{iracingImport:true,discordWeekly:false})).status,200);
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT modules FROM communities WHERE id=?').get(DEV_COMMUNITY).modules),{iracingImport:true,discordWeekly:false});
});
