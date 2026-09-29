import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {syncWeeklyDiscord} from '../server/discord-weekly.mjs';
import {GUILD, DEV_COMMUNITY, linkTestServer} from './fixtures/discord-server.mjs';

// « Mise en place » of a community by its admins, and new communities by the platform managers.
const ROOT='https://site.example', MANAGER='111111111111111111', OWNER='333333333333333333', PILOT='222222222222222222';
const HOOK_LMU='https://discord.com/api/webhooks/123456789012345678/lmu-token-aaaaaaaaaaaaaaaaaaaa';
const HOOK_IR='https://discord.com/api/webhooks/223456789012345678/iracing-token-bbbbbbbbbbbbbbbbbbbb';
const MIGRATIONS=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');for(const file of MIGRATIONS)this.db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));}
  prepare(sql){const self=this;return {params:[],bind(...params){this.params=params;return this;},async first(){return self.db.prepare(sql).get(...this.params)||null;},async all(){return {results:self.db.prepare(sql).all(...this.params)};},async run(){const result=self.db.prepare(sql).run(...this.params);return {meta:{changes:Number(result.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
// Fake Discord: the bot sees the server (owner OWNER, PILOT member); webhooks record what they receive.
function fakeDiscord(t, {bot=true}={}) {
  const posts=[];let nextId=900000000000000100n;
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (url, options={})=>{
    const text=String(url);
    if(text.includes('/api/webhooks/')){
      if(text.includes('deleted'))return new Response('{}',{status:404});
      posts.push({url:text.split('?')[0].split('/messages/')[0],method:options.method,body:JSON.parse(options.body||'{}')});
      return Response.json({id:String(nextId++)});
    }
    const path=text.replace('https://discord.com/api/v10','');
    if(!bot)return new Response('{}',{status:403});
    if(path===`/guilds/${GUILD}`)return Response.json({id:GUILD,name:'Serveur test',owner_id:OWNER});
    if(path===`/guilds/${GUILD}/roles`)return Response.json([{id:GUILD,name:'@everyone',permissions:'0',position:0}]);
    const member=path.match(/\/members\/(\d+)$/);
    if(member)return [OWNER,PILOT].includes(member[1])?Response.json({user:{id:member[1]},roles:[]}):new Response('{}',{status:404});
    return new Response('{}',{status:404});
  };
  t.after(()=>{globalThis.fetch=realFetch;});
  return posts;
}
function setup(){
  const DB=new D1();linkTestServer(DB.db);
  for(const id of [MANAGER,OWNER,PILOT])DB.db.prepare("INSERT INTO users(id,name,created_at) VALUES(?,?,0)").run(id,'Joueur '+id.slice(0,3));
  const env={DB,APP_ORIGIN:ROOT,ADMIN_DISCORD_IDS:MANAGER,DISCORD_BOT_TOKEN:'test-bot',DISCORD_CLIENT_ID:'app-id',DISCORD_CLIENT_SECRET:'secret'};
  const as=async (userId,path,method='GET',body)=>{
    const raw=userId.slice(0,1).repeat(64);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    DB.db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,userId,4102444800);
    const headers={Cookie:`__Host-em_session=${raw}`,'CF-Connecting-IP':userId};
    if(method!=='GET'){headers.Origin=ROOT;headers['Content-Type']='application/json';}
    const response=await worker.fetch(new Request(ROOT+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
    return {status:response.status,data:await response.json()};
  };
  return {DB,env,as};
}
const future=Date.now()+3*86400000;
function addRace(DB,id,circuit){
  DB.db.prepare(`INSERT INTO events(id,name,duration_hours,circuit,categories,departures,created_by,created_at,community_id)
    VALUES(?,?,4,?,'["GT3"]',?,?,0,?)`).run(id,circuit.startsWith('iracing')?'Endurance iRacing':'Endurance LMU',circuit,JSON.stringify([{id:id.replace(/^1/,'2'),startsAt:future}]),OWNER,DEV_COMMUNITY);
}

test('the setup page shows each step: bot on the server, roles, recap, invitation, announcement', async t => {
  fakeDiscord(t);
  const {as}=setup();
  assert.equal((await as(PILOT,'/api/community/setup')).status,403,'admins only');
  const setupPage=(await as(OWNER,'/api/community/setup')).data;
  assert.equal(setupPage.guild.botPresent,true);assert.equal(setupPage.guild.name,'Serveur test');
  assert.match(setupPage.botInviteUrl,new RegExp(`client_id=app-id&scope=bot&permissions=0&guild_id=${GUILD}&disable_guild_select=true`));
  assert.equal(setupPage.siteUrl,ROOT);assert.deepEqual(setupPage.recaps,[]);
  assert.equal((await as(OWNER,'/api/community/invite','PATCH',{url:'https://evil.example/x'})).status,400);
  assert.equal((await as(OWNER,'/api/community/invite','PATCH',{url:'https://discord.gg/abcDEF'})).status,200);
  assert.equal((await as(OWNER,'/api/community/setup')).data.discordInviteUrl,'https://discord.gg/abcDEF');
});

test('recap: one message for both simulators, or two messages in two channels; webhooks never shown again', async t => {
  const posts=fakeDiscord(t);
  const {DB,env,as}=setup();
  addRace(DB,'10000000-0000-4000-8000-000000000001','spa');addRace(DB,'10000000-0000-4000-8000-000000000002','iracing-spa');
  assert.equal((await as(OWNER,'/api/community/recaps','PUT',{recaps:[{scope:'all',webhookUrl:'https://evil.example/api/webhooks/1/2'}]})).status,400,'Discord webhooks only');
  assert.equal((await as(OWNER,'/api/community/recaps','PUT',{recaps:[{scope:'all',webhookUrl:HOOK_LMU},{scope:'lmu',webhookUrl:HOOK_IR}]})).status,400,'"both" is a single message');
  // One message, LMU and iRacing together: published at once.
  const saved=await as(OWNER,'/api/community/recaps','PUT',{recaps:[{scope:'all',webhookUrl:HOOK_LMU}]});
  assert.equal(saved.status,200);assert.equal(saved.data.published,true);
  assert.equal(posts.length,1);assert.match(JSON.stringify(posts[0].body),/Endurance LMU/);assert.match(JSON.stringify(posts[0].body),/Endurance iRacing/);
  const page=(await as(OWNER,'/api/community/setup')).data;
  assert.deepEqual(page.recaps.map(item=>[item.scope,item.webhook]),[['all','webhook …5678']]);
  assert.doesNotMatch(JSON.stringify(page),/lmu-token/,'the webhook is never shown again');
  // Two messages, one per simulator (two channels): each one only has its races.
  posts.length=0;
  assert.equal((await as(OWNER,'/api/community/recaps','PUT',{recaps:[{scope:'lmu',webhookUrl:HOOK_LMU},{scope:'iracing',webhookUrl:HOOK_IR}]})).status,200);
  const lmu=posts.find(post=>post.url===HOOK_LMU),iracing=posts.find(post=>post.url===HOOK_IR);
  assert.match(JSON.stringify(lmu.body),/Endurance LMU/);assert.doesNotMatch(JSON.stringify(lmu.body),/Endurance iRacing/);
  assert.match(JSON.stringify(iracing.body),/Endurance iRacing/);assert.doesNotMatch(JSON.stringify(iracing.body),/Endurance LMU/);
  assert.match(JSON.stringify(iracing.body),new RegExp(`${ROOT}/iracing/`),'the message links to the community site');
  // An empty address keeps the saved webhook; the next update edits the messages instead of posting new ones.
  assert.equal((await as(OWNER,'/api/community/recaps','PUT',{recaps:[{scope:'lmu',webhookUrl:''},{scope:'iracing',webhookUrl:''}]})).status,200);
  posts.length=0;addRace(DB,'10000000-0000-4000-8000-000000000003','monza');
  await syncWeeklyDiscord(env,Date.now());
  assert.deepEqual(posts.map(post=>[post.url,post.method]),[[HOOK_LMU,'PATCH']],'a new LMU race: only the LMU message is edited in place');
  // No recap: nothing is sent any more.
  assert.equal((await as(OWNER,'/api/community/recaps','PUT',{recaps:[]})).status,200);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM community_recaps').get().n,0);
});

test('« Tester » sends a message to the channel, and says when Discord refuses the webhook', async t => {
  const posts=fakeDiscord(t);
  const {as}=setup();
  assert.equal((await as(OWNER,'/api/community/recaps/test','POST',{webhookUrl:HOOK_LMU})).status,200);
  assert.match(posts[0].body.content,/bien relié/);assert.deepEqual(posts[0].body.allowed_mentions,{parse:[]});
  const refused=await as(OWNER,'/api/community/recaps/test','POST',{webhookUrl:'https://discord.com/api/webhooks/123456789012345678/deleted-token-cccccccccccccccc'});
  assert.equal(refused.status,400);assert.match(refused.data.error,/supprimé/);
  assert.equal((await as(PILOT,'/api/community/recaps/test','POST',{webhookUrl:HOOK_LMU})).status,403);
});

test('platform managers create a community, linked to its Discord server; nobody else can', async t => {
  fakeDiscord(t);
  const {DB,as}=setup();
  const input={name:'Team Rookie',shortName:'TRR',slug:'team-rookie',guildId:'900000000000000099'};
  assert.equal((await as(OWNER,'/api/platform/communities','POST',input)).status,403,'community admins cannot');
  const created=await as(MANAGER,'/api/platform/communities','POST',input);
  assert.equal(created.status,201);assert.match(created.data.botInviteUrl,/guild_id=900000000000000099/);
  assert.equal(DB.db.prepare("SELECT discord_guild_id FROM communities WHERE slug='team-rookie'").get().discord_guild_id,'900000000000000099');
  assert.equal((await as(MANAGER,'/api/platform/communities','POST',{...input,slug:'autre-nom'})).status,409,'one community per Discord server');
  assert.equal((await as(MANAGER,'/api/platform/communities','POST',{...input,guildId:'900000000000000098'})).status,409,'address already taken');
  assert.equal((await as(MANAGER,'/api/platform/communities','POST',{...input,slug:'-bad-',guildId:'900000000000000097'})).status,400);
  const list=(await as(MANAGER,'/api/platform/communities')).data.communities;
  assert.deepEqual(list.map(item=>item.slug).sort(),['commu-dev','team-rookie']);
});
