import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {previewOfficialDiscord,applyOfficialDiscord,OFFICIAL_GUILD as GUILD,OFFICIAL_APPLICATION as BOT,SETUP_PERMISSIONS} from '../server/official-discord-setup.mjs';
import worker from '../server/worker.mjs';
const OWNER='111111111111111111';
function setup(t){
  const db=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const DB={prepare(sql){return {params:[],bind(...params){this.params=params;return this;},async first(){return db.prepare(sql).get(...this.params)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.params).changes)}};}};}};
  const state={guild:{id:GUILD,name:'Endurance Manager',owner_id:OWNER,features:['COMMUNITY']},roles:[{id:GUILD,permissions:'0'},{id:'bot-role',permissions:SETUP_PERMISSIONS}],channels:[],messages:[],failure:null};
  const calls=[];let id=800000000000000000n;const original=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
    if(state.failure?.(path,method))return Response.json({}, {status:429});
    if(method==='GET'){
      if(path===`/guilds/${GUILD}`)return Response.json(state.guild);
      if(path===`/guilds/${GUILD}/roles`)return Response.json(state.roles);
      if(path===`/guilds/${GUILD}/channels`)return Response.json(state.channels);
      if(path===`/guilds/${GUILD}/members/${BOT}`)return Response.json({roles:['bot-role']});
      if(path.includes('/messages?'))return Response.json(state.messages.filter(item=>path.includes(item.channel_id)));
    }
    if(method==='POST'){
      const item={...body,id:String(id++)};
      if(path.endsWith('/roles')){state.roles.push(item);return Response.json(item);}
      if(path.endsWith('/channels')){state.channels.push(item);return Response.json(item);}
      if(path.endsWith('/messages')){Object.assign(item,{channel_id:path.split('/')[2],author:{id:BOT}});state.messages.push(item);return Response.json(item);}
    }
    return Response.json({}, {status:404});
  };
  t.after(()=>{globalThis.fetch=original;db.close();});
  const env={DB,DISCORD_CLIENT_ID:BOT,DISCORD_BOT_TOKEN:'fake-only',APP_ORIGIN:'https://site.example',SITE_ENV:'development',OFFICIAL_DISCORD_SETUP_ENABLED:'true',ADMIN_DISCORD_IDS:OWNER};
  return {env,db,state,calls};
}
async function complete(env){let result;for(let i=0;i<10;i++){result=await applyOfficialDiscord(env,OWNER,GUILD);if(result.done)return result;}throw new Error('Setup did not finish');}
const writes=calls=>calls.filter(call=>call.method!=='GET');

test('preview lists the agreed structure and messages without any Discord or database writes',async t=>{
  const {env,db,calls}=setup(t);const preview=await previewOfficialDiscord(env,OWNER);
  assert.equal(preview.guildId,GUILD);assert.equal(preview.items.filter(item=>item.type===4).length,7);
  assert.equal(preview.items.filter(item=>item.type===15).length,3);
  assert.equal(preview.items.filter(item=>item.type===2).length,2);
  assert.ok(!preview.items.some(item=>['résultats','recherche-équipage','lmu','iracing'].includes(item.name)));
  assert.equal(writes(calls).length,0);assert.equal(db.prepare('SELECT count(*) AS n FROM official_discord_setup').get().n,0);
  assert.ok(!JSON.stringify(preview).includes('fake-only'));
});

test('explicit batched setup is repeatable, creates private staff/read-only welcome areas, and never activates race modules',async t=>{
  const {env,db,state,calls}=setup(t);await complete(env);
  assert.equal(state.roles.filter(role=>role.name).length,4);assert.ok(state.roles.filter(role=>role.name).every(role=>role.permissions==='0'));
  assert.equal(state.channels.length,20);assert.equal(state.messages.length,3);
  const staff=state.channels.find(channel=>channel.name==='Équipe');assert.equal(staff.permission_overwrites.find(item=>item.id===GUILD).deny,'1024');
  for(const name of ['Administrateur','Modérateur'])assert.ok(staff.permission_overwrites.some(item=>item.id===state.roles.find(role=>role.name===name).id&&item.allow==='68608'));
  const welcome=state.channels.find(channel=>channel.name==='Accueil');assert.equal(welcome.permission_overwrites.find(item=>item.id===GUILD).deny,'2048');
  assert.ok(state.messages.every(message=>message.flags===4096&&message.allowed_mentions.parse.length===0));
  assert.equal(db.prepare('SELECT count(*) AS n FROM community_recap_settings').get().n,0);
  const before=calls.length;await complete(env);assert.equal(writes(calls.slice(before)).length,0);
});

test('confirmation, ownership, Community mode, application and required permissions are checked before writes',async t=>{
  const {env,state,calls}=setup(t);
  await assert.rejects(applyOfficialDiscord(env,OWNER,'wrong'),error=>error.status===400);
  await assert.rejects(previewOfficialDiscord(env,'other'),error=>error.status===403);
  state.guild.features=[];await assert.rejects(previewOfficialDiscord(env,OWNER),/Communauté/);state.guild.features=['COMMUNITY'];
  await assert.rejects(previewOfficialDiscord({...env,DISCORD_CLIENT_ID:'other'},OWNER),/application/);
  state.roles[1].permissions='3214352';await assert.rejects(applyOfficialDiscord(env,OWNER,GUILD),/fils/);
  assert.equal(writes(calls).length,0);
});

test('conflicts with duplicate names, wrong types or an exposed staff category block all creation',async t=>{
  const {env,state,calls}=setup(t);state.channels.push({id:'existing',name:'Équipe',type:4,permission_overwrites:[]});
  assert.equal((await previewOfficialDiscord(env,OWNER)).items.find(item=>item.name==='Équipe').action,'conflict');
  await assert.rejects(applyOfficialDiscord(env,OWNER,GUILD),/conflit/);assert.equal(writes(calls).length,0);
  state.channels=[];state.roles.push({id:'one',name:'Support'},{id:'two',name:'Support'});
  await assert.rejects(applyOfficialDiscord(env,OWNER,GUILD),/conflit/);assert.equal(writes(calls).length,0);
});

test('existing Community rule/update channels are reused without moving or deleting them',async t=>{
  const {env,state,calls}=setup(t);
  state.guild.rules_channel_id='rules';state.guild.public_updates_channel_id='updates';
  state.channels.push({id:'rules',name:'regles-existantes',type:0,parent_id:null},{id:'updates',name:'suivi-existant',type:0,parent_id:null});
  await complete(env);assert.equal(state.channels.filter(item=>item.name==='règlement').length,0);
  assert.equal(state.channels.filter(item=>item.name==='suivi-discord').length,0);
  assert.ok(calls.every(call=>!['DELETE','PATCH'].includes(call.method)));
  assert.ok(state.messages.some(item=>item.channel_id==='rules'));
});

test('an active setup lock prevents overlapping creation and a rate limit releases the lock for resume',async t=>{
  const {env,db,state,calls}=setup(t);
  db.prepare('INSERT INTO official_discord_setup(guild_id,lock_until) VALUES(?,?)').run(GUILD,Date.now()+60000);
  await assert.rejects(applyOfficialDiscord(env,OWNER,GUILD),error=>error.status===409);assert.equal(writes(calls).length,0);
  db.prepare('UPDATE official_discord_setup SET lock_until=0').run();
  state.failure=(path,method)=>method==='POST';await assert.rejects(applyOfficialDiscord(env,OWNER,GUILD),error=>error.status===429);
  assert.equal(db.prepare('SELECT lock_until FROM official_discord_setup').get().lock_until,0);
  state.failure=null;await complete(env);assert.equal(state.channels.length,20);assert.equal(state.messages.length,3);
});

test('API is inaccessible in production or without the temporary flag and rejects non-managers before Discord calls',async t=>{
  const {env,db,calls}=setup(t);const raw='a'.repeat(64),digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))).toString('hex');
  db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run(OWNER,'Owner');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,4102444800)').run(digest,OWNER);
  const call=override=>worker.fetch(new Request('https://site.example/api/admin/official-discord-setup',{headers:{Cookie:`__Host-em_session=${raw}`}}),{...env,...override});
  assert.equal((await call({SITE_ENV:'production'})).status,404);
  assert.equal((await call({OFFICIAL_DISCORD_SETUP_ENABLED:'false'})).status,404);
  assert.equal((await call({ADMIN_DISCORD_IDS:''})).status,403);assert.equal(calls.length,0);
  assert.equal((await call({})).status,200);assert.equal(writes(calls).length,0);
  const post=origin=>worker.fetch(new Request('https://site.example/api/admin/official-discord-setup',{method:'POST',headers:{Cookie:`__Host-em_session=${raw}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({confirmGuildId:'wrong'})}),env);
  assert.equal((await post('https://other.example')).status,403);
  assert.equal((await post('https://site.example')).status,400);assert.equal(writes(calls).length,0);
});
