import test from 'node:test';
import assert from 'node:assert/strict';
import {setupOfficialServer, OFFICIAL_LAYOUT, sameName} from '../server/official-discord.mjs';

const GUILD='900000000000000001', BOT='444444444444444444';
function fakeDiscord(t,{channels=[],roles=[{id:GUILD,name:'@everyone'}],features=[],refuse=null}={}){
  const calls=[],guild={id:GUILD,features:[...features],verification_level:0};let next=700000000000000000n;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
    const path=String(url).replace('https://discord.com/api/v10',''),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
    calls.push({method,path,body});
    if(refuse?.(method,path,body))return Response.json({code:50013},{status:403});
    if(path===`/guilds/${GUILD}`&&method==='GET')return Response.json(guild);
    if(path===`/guilds/${GUILD}`&&method==='PATCH'){
      if(!body.rules_channel_id||!body.public_updates_channel_id)return Response.json({code:50035},{status:400});
      guild.features=body.features;return Response.json(guild);}
    if(path===`/guilds/${GUILD}/roles`){if(method==='GET')return Response.json(roles);const role={...body,id:String(next++)};roles.push(role);return Response.json(role);}
    if(path===`/guilds/${GUILD}/channels`){
      if(method==='GET')return Response.json(channels);
      if([5,15].includes(body.type)&&!guild.features.includes('COMMUNITY'))return Response.json({code:50024},{status:400});
      const channel={...body,id:String(next++)};channels.push(channel);return Response.json(channel);}
    return Response.json({},{status:404});
  };
  t.after(()=>globalThis.fetch=original);
  return {calls,channels,roles,guild};
}
const env={DISCORD_BOT_TOKEN:'token',DISCORD_CLIENT_ID:BOT};

test('the bot makes the whole official server: roles, categories, channels, forums with tags, Community mode', async t=>{
  const {channels,roles,guild}=fakeDiscord(t);
  const {made,kept}=await setupOfficialServer(env,GUILD);
  assert.deepEqual(kept,[]);
  assert.deepEqual(roles.slice(1).map(role=>role.name),['Staff','Organisateur']);
  assert.ok(guild.features.includes('COMMUNITY'));assert.ok(made.includes('Mode Communauté'));
  for(const group of OFFICIAL_LAYOUT){
    const category=channels.find(item=>item.type===4&&item.name===group.name);assert.ok(category,group.name);
    for(const channel of group.channels)assert.equal(channels.find(item=>item.name===channel.name).parent_id,category.id,channel.name);
  }
  assert.equal(channels.find(item=>item.name==='annonces').type,5);
  const ideas=channels.find(item=>item.name==='fonctionnalités');assert.equal(ideas.type,15);
  assert.deepEqual(ideas.available_tags.map(tag=>tag.name),['Proposée','Prévue','Faite']);assert.deepEqual(ideas.default_reaction_emoji,{emoji_name:'👍'});
  // The team's channels: hidden from everyone, seen by the staff and the bot.
  const staff=roles.find(role=>role.name==='Staff').id,team=channels.find(item=>item.name==='modération');
  assert.deepEqual(team.permission_overwrites.map(item=>item.id),[GUILD,staff,BOT]);assert.equal(team.permission_overwrites[0].deny,String(1n<<10n));
  // Welcome: everyone reads, only the staff writes.
  assert.equal(channels.find(item=>item.name==='bienvenue').permission_overwrites[0].allow,'0');
});

test('a second run, or a server made by hand, keeps what exists and only adds what is missing', async t=>{
  const {calls,channels}=fakeDiscord(t,{features:['COMMUNITY'],roles:[{id:GUILD,name:'@everyone'},{id:'1',name:'Staff'}],
    channels:[{id:'10',type:4,name:'👋 Accueil'},{id:'11',type:0,name:'bienvenue',parent_id:'10'},{id:'12',type:0,name:'reglement',parent_id:'10'},{id:'13',type:15,name:'bugs'}]});
  const {made,kept}=await setupOfficialServer(env,GUILD);
  assert.ok(kept.includes('@Staff')&&kept.includes('👋 ACCUEIL')&&kept.includes('#bienvenue')&&kept.includes('#règlement')&&kept.includes('#bugs'));
  assert.ok(!made.includes('Mode Communauté'));assert.ok(!calls.some(call=>call.method==='PATCH'||call.method==='DELETE'));
  assert.equal(channels.filter(item=>sameName(item.name,'bugs')).length,1);
  const before=channels.length;const again=await setupOfficialServer(env,GUILD);
  assert.deepEqual(again.made,[]);assert.equal(channels.length,before);
});

test('without the rights the bot says so, and what was made stays', async t=>{
  fakeDiscord(t,{refuse:(method,path)=>method==='POST'&&path.endsWith('/channels')});
  await assert.rejects(setupOfficialServer(env,GUILD),error=>/Administrateur/.test(error.message)&&error.made.includes('@Staff'));
});
