// DEV-only exercise: actual Discord channels and exact production renderers. No live race data or sync.
import {isDevelopment} from './dev-environment.mjs';
import {diagnoseDiscordPreview} from './discord-test-preview.mjs';
import {discordFetch,botToken} from './discord-api.mjs';
import {buildWeeklyDiscordPayload,buildWeekHeadPayload,categoryEmojiName,parisWeek} from './discord-weekly-format.mjs';
import {flattenDepartures,siteOf} from './discord-weekly-snapshot.mjs';
import {crewVoiceName,recapPayload} from './crew-discord.mjs';
import {raceThreadName} from './recap-discord.mjs';
import {absentButton} from './discord-interactions.mjs';
import {brandEmojiAsset,categoryEmojiAsset,uploadDisplayEmoji} from './discord-display-emojis.mjs';
const origin='https://dev.endurance-manager.app',day=86400000;
const valid=id=>typeof id==='string'&&/^\d{15,22}$/.test(id);
const view=1n<<10n, access=(view|(1n<<11n)|(1n<<14n)|(1n<<16n)|(1n<<20n)|(1n<<21n)).toString();
const sandbox='EM · TEST DEV — vocaux';
const uuid=n=>'de000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sample=[
 ['Hypercar','Toyota GR010 Hybrid'],['LMP2 ELMS','Oreca 07 Gibson ELMS'],['LMP2 WEC','Oreca 07 Gibson'],
 ['LMP3','Ligier JS P325'],['GTE','Ferrari 488 GTE'],['GT3','Ferrari 296 LMGT3']
];
export function realPreviewFixture(now=Date.now()){
  const week=parisWeek(now+7*day),startsAt=(week.monday+5)*day+12*3600000;
  const race=(n,name,circuit,categories,start)=>({id:uuid(n),name,circuit,categories:JSON.stringify(categories),duration_hours:6,duration_minutes:360,event_type:'special',departures:JSON.stringify([{id:uuid(n+100),startsAt:start}])});
  const races=[race(1,'6H de Spa — TEST','spa',sample.map(x=>x[0]),startsAt),race(2,'IMSA Endurance — TEST','iracing-spa',['GTP','GT3'],startsAt+day)];
  const departures=flattenDepartures(races);
  const crew=(pair,i)=>({id:uuid(200+i),name:'EM TEST '+String(i+1).padStart(2,'0'),category:pair[0],car:pair[1],locked:i%2===0,pilots:['Pilote '+String.fromCharCode(65+i*2),'Pilote '+String.fromCharCode(66+i*2)]});
  departures[0].crews=sample.map(crew);
  departures[0].unassignedPilots=[{name:'Pilote sans équipage',categories:['LMP2 ELMS','LMP2 WEC']}];
  departures[1].crews=[crew(['GTP','Cadillac V-Series.R GTP'],6)];
  return {races,departures,periodLabel:week.label};
}
const requiredAssets=fixture=>[...new Map(fixture.departures.flatMap(d=>[
  ...d.categories.map(category=>categoryEmojiAsset(categoryEmojiName(d.circuit.startsWith('iracing-')?'iracing':'lmu',category))),
  ...d.crews.map(crew=>brandEmojiAsset(crew.car))
]).filter(Boolean).map(asset=>[asset.name,asset])).values()];
const failure=(stage,error,extra={})=>({ok:false,stage,error,...extra});
function safePayload(payload){
  // Keep actual embeds unchanged; only prevent interactions with nonexistent test races.
  return {...payload,allowed_mentions:{parse:[]},flags:4096,
    components:(payload.components||[]).map(row=>({...row,components:row.components.map(button=>({...button,disabled:true}))}))};
}
export function realPreviewPayloads(env,community,fixture,emojis,threadIds,now){
  const site=siteOf(env,community);
  const snapshot=departures=>({currentDepartures:[],futureDepartures:departures,periodLabel:fixture.periodLabel});
  const week=[safePayload(buildWeekHeadPayload(fixture.periodLabel,site,'all')),...['lmu','iracing'].map(sim=>safePayload(buildWeeklyDiscordPayload(snapshot(fixture.departures.filter(d=>(d.circuit.startsWith('iracing-')?'iracing':'lmu')===sim)),site,now,sim,emojis,{weekly:true,threads:threadIds,head:false})))];
  const threads=fixture.departures.map((d,i)=>({name:raceThreadName(fixture.races[i]),eventId:d.eventId,payload:safePayload(buildWeeklyDiscordPayload(snapshot([d]),site,now,'all',emojis,{alone:true,absent:absentButton}))}));
  const voices=fixture.departures.flatMap(d=>d.crews.map(crew=>{
    const row={crew_id:crew.id,crew_name:crew.name,car:crew.car,category:crew.category,locked:crew.locked,event_id:d.eventId,event_name:d.eventName,circuit:d.circuit,event_sim:d.circuit.startsWith('iracing-')?'iracing':'lmu',event_format:'crew',event_details:JSON.stringify(d.details||{}),owner_user_id:null};
    return {name:crewVoiceName(row),payload:safePayload(recapPayload(env,community,row,{startsAt:d.startsAt,endsAt:d.endsAt,minutes:d.durationMinutes,pending:false},crew.pilots.map(name=>({name})),emojis))};
  }));
  return {week,threads,voices};
}
export async function realDiscordPreview(env,actor,action,{diagnose=diagnoseDiscordPreview,call=discordFetch,now=Date.now()}={}){
  if(!isDevelopment(env)||env.APP_ORIGIN!==origin||!actor?.manager||!valid(actor.user?.id))return failure('sécurité','Réservé au gestionnaire sur dev.');
  if(!['APERÇU','PREPARER_LOGOS'].includes(action))return failure('sécurité','Action inconnue.');
  if(!botToken(env)||!valid(env.DISCORD_CLIENT_ID))return failure('bot','Le bot de dev n’est pas configuré.');
  const connection=await diagnose(env);
  if(!connection.ok)return connection;
  const {channelId,guildId}=connection;
  if(!valid(channelId)||!valid(guildId))return failure('destination','Destination non vérifiée.');
  let stage='destination';const created={category:null,threads:[],voices:[],messages:[]},added=[];
  const request=async(method,path,body)=>{
    const answer=await call(env,method,path,body);
    if(!answer.ok)throw Object.assign(new Error('Discord a refusé l’opération.'),{status:answer.status,code:answer.code});
    return answer.data;
  };
  try{
    const target=await request('GET',`/channels/${channelId}`);
    const denied=target?.permission_overwrites?.some(x=>x.id===guildId&&Number(x.type)===0&&(BigInt(x.deny||0)&view)!==0n);
    if(target?.id!==channelId||target.guild_id!==guildId||target.type!==0||!denied)return failure(stage,'Le webhook doit pointer vers un salon texte explicitement privé (@everyone : Voir le salon refusé).');
    stage='bot';
    const bot=await request('GET','/users/@me');
    if(!valid(bot?.id)||bot.id!==env.DISCORD_CLIENT_ID||!bot.bot)return failure(stage,'L’identité du bot de dev ne correspond pas à l’application configurée.');
    const fixture=realPreviewFixture(now),assets=requiredAssets(fixture);
    stage='logos';
    const registry=await request('GET',`/applications/${env.DISCORD_CLIENT_ID}/emojis`);
    if(!Array.isArray(registry?.items))return failure(stage,'Registre des emojis du bot indisponible.');
    const emojis=Object.fromEntries(registry.items.filter(x=>valid(x.id)).map(x=>[x.name,x.id]));
    const missing=assets.filter(asset=>!emojis[asset.name]);
    if(action==='PREPARER_LOGOS'){
      // Explicit opt-in: additions only, application-wide if the bot is shared.
      for(const asset of missing){
        const id=await uploadDisplayEmoji(env,asset,request);
        if(!id)return failure(stage,'Image indisponible ou refusée : '+asset.name,{added,missing:missing.filter(x=>!added.includes(x.name)).map(x=>x.name)});
        added.push(asset.name);
      }
      return {ok:true,stage,added,missing:[],sent:0};
    }
    if(missing.length)return failure(stage,'Logos manquants : utilise « Préparer les logos » avant le vrai test.',{missing:missing.map(x=>x.name)});
    stage='isolation';
    const channels=await request('GET',`/guilds/${guildId}/channels`);
    if(!Array.isArray(channels))return failure(stage,'Impossible de vérifier les salons du serveur.');
    if(channels.some(x=>x.type===4&&x.name===sandbox))return failure(stage,'Une catégorie de test existe déjà. Supprime uniquement les anciens vocaux de test et leur catégorie avant de relancer.');
    const overwrites=[{id:guildId,type:0,allow:'0',deny:view.toString()},{id:actor.user.id,type:1,allow:access,deny:'0'},{id:bot.id,type:1,allow:access,deny:'0'}];
    const cat=await request('POST',`/guilds/${guildId}/channels`,{name:sandbox,type:4,permission_overwrites:overwrites});
    if(!valid(cat?.id)||cat.guild_id!==guildId||cat.type!==4)throw new Error('Création non confirmée');
    created.category=cat.id;
    const community={name:'Endurance Manager — TEST DEV',slug:env.COMMUNITY||'test',modules:{combos:true},appearance:{}};
    const ids={};
    const send=async(id,payload)=>{const result=await request('POST',`/channels/${id}/messages`,payload);if(!valid(result?.id))throw new Error('Message non confirmé');created.messages.push(result.id);};
    stage='fils';
    for(const race of fixture.races){
      const thread=await request('POST',`/channels/${channelId}/threads`,{name:raceThreadName(race),type:11,auto_archive_duration:10080});
      if(!valid(thread?.id)||thread.parent_id!==channelId)throw new Error('Fil non confirmé');
      ids[race.id]=thread.id;created.threads.push(thread.id);
    }
    const payloads=realPreviewPayloads(env,community,fixture,emojis,ids,now);
    stage='récap semaine';
    for(const payload of payloads.week)await send(channelId,payload);
    stage='récap course';
    for(const thread of payloads.threads)await send(ids[thread.eventId],thread.payload);
    stage='vocaux';
    for(const voice of payloads.voices){
      const result=await request('POST',`/guilds/${guildId}/channels`,{name:voice.name,type:2,parent_id:cat.id,permission_overwrites:overwrites});
      if(!valid(result?.id)||result.guild_id!==guildId||result.parent_id!==cat.id||result.type!==2)throw new Error('Vocal non confirmé');
      created.voices.push(result.id);
      await send(result.id,voice.payload);
    }
    return {ok:true,stage:'terminé',sent:created.messages.length,created,channelUrl:connection.channelUrl};
  }catch(error){
    const status=Number.isSafeInteger(error?.status)?error.status:0,code=Number.isSafeInteger(error?.code)?error.code:0;
    return failure(stage,status?`Discord refuse l’opération (HTTP ${status}${code?' · Discord '+code:''}).`:'Opération non confirmée. Vérifie le salon avant de réessayer.',{httpStatus:status,discordCode:code,sent:created.messages.length,created,added});
  }
}
