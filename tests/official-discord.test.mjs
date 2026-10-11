import test from 'node:test';
import assert from 'node:assert/strict';
import {setupOfficialServer, OFFICIAL_LAYOUT, OFFICIAL_ROLES, sameName} from '../server/official-discord.mjs';

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
    const role=path.match(/^\/guilds\/\d+\/roles\/(\d+)$/);
    if(role&&method==='PATCH'){const found=roles.find(item=>item.id===role[1]);Object.assign(found,body);return Response.json(found);}
    if(path===`/guilds/${GUILD}/channels`&&method==='PATCH'){for(const item of body)Object.assign(channels.find(channel=>channel.id===item.id),{position:item.position});return new Response(null,{status:204});}
    if(path===`/guilds/${GUILD}/channels`){
      if(method==='GET')return Response.json(channels);
      if([5,15].includes(body.type)&&!guild.features.includes('COMMUNITY'))return Response.json({code:50024},{status:400});
      const channel={...body,id:String(next++)};channels.push(channel);return Response.json(channel);}
    const one=path.match(/^\/channels\/(\d+)$/);
    if(one){const index=channels.findIndex(item=>item.id===one[1]);if(index<0)return Response.json({},{status:404});
      if(method==='DELETE'){channels.splice(index,1);return Response.json({});}
      Object.assign(channels[index],body);return Response.json(channels[index]);}
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
    for(const channel of group.channels.filter(item=>!item.existing))assert.equal(channels.find(item=>item.name===channel.name).parent_id,category.id,channel.name);
  }
  assert.equal(channels.find(item=>item.name==='annonces').type,5);
  const ideas=channels.find(item=>item.name==='idées');assert.equal(ideas.type,15);
  assert.deepEqual(ideas.available_tags.map(tag=>tag.name),['Proposée','Prévue','Faite']);assert.deepEqual(ideas.default_reaction_emoji,{emoji_name:'👍'});
  // The team's channels: hidden from everyone, seen by the staff and the bot.
  const staff=roles.find(role=>role.name==='Staff').id,team=channels.find(item=>item.name==='modération');
  assert.deepEqual(team.permission_overwrites.map(item=>item.id),[GUILD,staff,BOT]);assert.equal(team.permission_overwrites[0].deny,String(1n<<10n));
  // Welcome: everyone reads, only the staff writes.
  assert.equal(channels.find(item=>item.name==='bienvenue').permission_overwrites[0].allow,'0');
});

test('a second run, or a server made by hand, keeps what exists and only adds what is missing', async t=>{
  const {calls,channels}=fakeDiscord(t,{features:['COMMUNITY'],roles:[{id:GUILD,name:'@everyone'},{id:'1',name:'Staff',permissions:OFFICIAL_ROLES[0].permissions}],
    channels:[{id:'10',type:4,name:'📌 Infos'},{id:'11',type:0,name:'bienvenue',parent_id:'10'},{id:'12',type:0,name:'reglement',parent_id:'10'},{id:'13',type:15,name:'bugs',parent_id:'20'},{id:'20',type:4,name:'🆘 AIDE'}]});
  const {made,kept}=await setupOfficialServer(env,GUILD);
  assert.ok(kept.includes('@Staff')&&kept.includes('📌 INFOS')&&kept.includes('#bienvenue')&&kept.includes('#règlement')&&kept.includes('#bugs'));
  assert.ok(!made.includes('Mode Communauté'));assert.ok(!calls.some(call=>call.method==='DELETE'));
  assert.equal(channels.filter(item=>sameName(item.name,'bugs')).length,1);
  const before=channels.length;calls.length=0;const again=await setupOfficialServer(env,GUILD);
  assert.deepEqual(again.made,[]);assert.deepEqual(again.moved,[]);assert.equal(channels.length,before);
  assert.ok(!calls.some(call=>call.method!=='GET'),'nothing to change the second time');
});

test('the former layout is tidied up: renamed, moved, nothing deleted but the empty voice category; races under INFOS', async t=>{
  const {channels}=fakeDiscord(t,{features:['COMMUNITY'],roles:[{id:GUILD,name:'@everyone'},{id:'1',name:'Staff'},{id:'3',name:'Organisateur'}],channels:[
    {id:'1',type:0,name:'règlement',position:0},{id:'2',type:0,name:'suivi-discord',position:1},
    {id:'10',type:4,name:'👋 ACCUEIL',position:0},{id:'11',type:0,name:'bienvenue',parent_id:'10'},{id:'12',type:5,name:'annonces',parent_id:'10'},{id:'13',type:0,name:'bien-démarrer',parent_id:'10'},
    {id:'20',type:4,name:'💬 COMMUNAUTÉ',position:1},{id:'21',type:0,name:'discussion',parent_id:'20'},
    {id:'30',type:4,name:'🏎️ LMU · 10h de Road Atlanta',position:2},{id:'31',type:0,name:'récap',parent_id:'30'},{id:'32',type:2,name:'Les plots',parent_id:'30'},
    {id:'40',type:4,name:'🆘 AIDE ET RETOURS',position:3},{id:'41',type:15,name:'aide',parent_id:'40'},{id:'42',type:15,name:'bugs',parent_id:'40'},{id:'43',type:15,name:'fonctionnalités',parent_id:'40'},
    {id:'50',type:4,name:'🔊 VOCAUX GÉNÉRAUX',position:4},{id:'51',type:2,name:'Discussion',parent_id:'50'},{id:'52',type:2,name:'Détente',parent_id:'50'},
    {id:'60',type:4,name:'🔒 ÉQUIPE',position:5},{id:'61',type:0,name:'modération',parent_id:'60'},{id:'62',type:0,name:'logs-bot',parent_id:'60'}]});
  const {made,moved,anchor}=await setupOfficialServer(env,GUILD);
  assert.deepEqual(made,[]);assert.equal(anchor,'10');
  const at=id=>channels.find(item=>item.id===id);
  assert.equal(at('10').name,'📌 INFOS');assert.equal(at('40').name,'🆘 AIDE');assert.equal(at('43').name,'idées');
  assert.equal(at('1').parent_id,'10');assert.equal(at('1').permission_overwrites[0].allow,'0','rules read-only');
  assert.equal(at('2').parent_id,'60');assert.equal(at('2').permission_overwrites[0].deny,String(1n<<10n),'hidden in the team');
  assert.equal(at('51').parent_id,'20');assert.equal(at('52').parent_id,'20');assert.equal(at('50'),undefined,'empty voice category deleted');
  assert.equal(at('13').parent_id,'10','unknown channels stay');assert.equal(at('31').parent_id,'30');assert.equal(at('32').parent_id,'30');
  assert.ok(moved.includes('#idées')&&moved.includes('📌 INFOS'));
  assert.deepEqual(channels.filter(item=>item.type===4).sort((a,b)=>a.position-b.position).map(item=>item.name),
    ['📌 INFOS','🏎️ LMU · 10h de Road Atlanta','💬 COMMUNAUTÉ','🆘 AIDE','🔒 ÉQUIPE']);
});

test('without the rights the bot says so, and what was made stays', async t=>{
  fakeDiscord(t,{refuse:(method,path)=>method==='POST'&&path.endsWith('/channels')});
  await assert.rejects(setupOfficialServer(env,GUILD),error=>/Administrateur/.test(error.message)&&error.made.includes('@Staff'));
});

test('the setup gives the Staff and the Organisateur their rights, and @everyone, the Staff and the Organisateur their site permissions', async t=>{
  const {roles}=fakeDiscord(t,{roles:[{id:GUILD,name:'@everyone'},{id:'1',name:'Staff',permissions:'8'},{id:'3',name:'Organisateur',permissions:'0'}]});
  const result=await setupOfficialServer(env,GUILD);
  assert.notEqual(roles.find(role=>role.id==='1').permissions,'8');
  assert.ok(result.moved.includes('@Staff')&&result.kept.includes('@Organisateur'));
  assert.deepEqual(result.site,{[GUILD]:['access','endurance','crews'],1:['access','admin'],3:['access','admin']});
});
