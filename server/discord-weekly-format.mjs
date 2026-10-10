import {racesPath} from './races-path.mjs';
import {durationLabel} from '../shared/duration.mjs';
import {catalogForGame} from '../shared/catalog.mjs';

const DAY_MS=86_400_000,HOUR_MS=3_600_000,TIME_ZONE='Europe/Paris';
const circuitNames=new Map([...catalogForGame('lmu').circuits,...catalogForGame('iracing').circuits].map(c=>[c.id,c.name]));
// What a recap message covers (community_recaps.scope).
const SCOPE_LABELS={all:'',lmu:' LMU',iracing:' iRacing'};
const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const startLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'});
const endLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const updateTimeLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const recapDay=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,weekday:'short',day:'numeric',month:'short'});
const recapTime=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'numeric',minute:'2-digit',hourCycle:'h23'});
const markers=new Map([['Hypercar','🟦'],['LMP2 ELMS','🟨'],['LMP2 WEC','🟨'],['LMP3','🟩'],['GT3','🟪'],['GTE','🟥']]);

function localDay(timestamp){
  const parts=Object.fromEntries(ymd.formatToParts(timestamp).map(p=>[p.type,p.value]));
  return Math.floor(Date.UTC(+parts.year,+parts.month-1,+parts.day)/DAY_MS);
}
function dayDate(day){return new Date(day*DAY_MS+12*HOUR_MS);}
function dayKey(day){const d=new Date(day*DAY_MS);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
function weekFromMonday(monday){const sunday=monday+6;return{key:dayKey(monday),monday,sunday,label:`semaine du ${startLabel.format(dayDate(monday))} au ${endLabel.format(dayDate(sunday))}`};}
export function parisWeek(timestamp=Date.now()){const day=localDay(timestamp),weekday=new Date(day*DAY_MS).getUTCDay();return weekFromMonday(day-(weekday===0?6:weekday-1));}
export function nextParisWeek(timestamp=Date.now()){return weekFromMonday(parisWeek(timestamp).monday+7);}
export function isInParisWeek(timestamp,week){const day=localDay(timestamp);return day>=week.monday&&day<=week.sunday;}
export function isDepartureRelevant(startsAt,durationHours,week,now=Date.now()){
  if(!Number.isFinite(startsAt)||!isInParisWeek(startsAt,week))return false;
  const hours=Number(durationHours),endAt=startsAt+(Number.isFinite(hours)&&hours>0?hours*HOUR_MS:0);
  return startsAt>=now||endAt>now;
}

function clean(value){return String(value??'').replace(/[\\`*_~|>]/g,'\\$&').trim();}
function cut(value,length){const text=String(value??'');return text.length<=length?text:`${text.slice(0,length-1).trimEnd()}…`;}
function cap(value){const text=String(value??'').trim();return text?text[0].toUpperCase()+text.slice(1):'';}
// "Le Mans (horaires à confirmer)": the note in brackets is shown under the race name.
function eventTitleAndNote(eventName){
  const text=String(eventName??'').trim(),match=text.match(/^(.*?)\s*\(([^)]*horaires?[^)]*)\)\s*$/i);
  if(!match)return{title:clean(text),note:''};
  return{title:clean(match[1]),note:cap(clean(match[2]))};
}

// Link of a race on the site of its community: the simulator space of the race, then the race itself.
export function raceUrl(siteUrl,departure){
  if(!siteUrl)return undefined;
  const space=String(departure.circuit||'').startsWith('iracing-')?'iracing':'lmu';
  return `${siteUrl}/${space}/#event=${encodeURIComponent(departure.eventId)}`;
}
const SIM_COLORS={lmu:0xd8322c,iracing:0x2f6fd6};
const TYPE_LABELS={special:'Événement spécial',lmu:'Championnat',private:'Championnat privé'};
const simOf=departure=>String(departure.circuit||'').startsWith('iracing-')?'iracing':'lmu';
// Discord shows <t:…> timestamps in each reader's own time zone.
const discordTime=(startsAt,style)=>`<t:${Math.floor(startsAt/1000)}:${style}>`;
function departureTitle(departure){return departure.timePending?`${discordTime(departure.startsAt,'D')} — horaire à confirmer`:discordTime(departure.startsAt,'F');}
function departureValue(departure,compact=false){
  const lines=[`🕐 **${departureTitle(departure)}**`];
  for(const crew of departure.crews){
    const marker=markers.get(crew.category)||'⬜',status=crew.locked?'🔒':'🔓';
    lines.push(compact?`${marker} ${clean(crew.name)} · ${crew.pilots.length} pilote${crew.pilots.length>1?'s':''}`
      :`${marker} **${clean(crew.name)}** · ${clean(crew.category)} ${status}\n${crew.car?`🏎️ ${clean(crew.car)}\n`:''}${crew.pilots.length?crew.pilots.map(name=>`👤 ${clean(name)}`).join(' · '):'Aucun pilote affecté'}`);
  }
  if(departure.unassignedPilots?.length)lines.push(`📋 Sans équipage : ${compact?departure.unassignedPilots.length:departure.unassignedPilots.map(clean).join(', ')}`);
  if(!departure.crews.length&&!departure.unassignedPilots?.length)lines.push('Personne d’inscrit pour l’instant.');
  return cut(lines.join('\n'),1024);
}
// The starts of a race: only those with entries in detail (time, crews, pilots without a crew); the empty ones
// in one line at the end, so a special event with 15 starts stays short. A race with a single start keeps it.
const BLANK='\u200b';
function raceFields(departures,compact){
  const hasEntries=departure=>departure.crews.length||departure.unassignedPilots?.length;
  const absentPilots=[...new Set(departures.flatMap(departure=>departure.absentPilots||[]))];
  const absences=absentPilots.length?[{name:'🚫 Pilotes absents',value:cut(absentPilots.map(clean).join(', '),compact?300:1024),inline:false}]:[];
  if(departures.length===1)return [{name:BLANK,value:departureValue(departures[0],compact),inline:false},...absences];
  const filled=departures.filter(hasEntries);
  const fields=filled.slice(0,23).map(departure=>({name:BLANK,value:departureValue(departure,compact),inline:false}));
  if(!filled.length)fields.push({name:BLANK,value:'Personne d’inscrit pour l’instant.',inline:false});
  return [...fields,...absences];
}
// At the top of a race: its days and their start times, Paris time (« 📅 **sam. 17 oct.** · 8h, 14h, 20h »).
function hourLabel(startsAt){return recapTime.format(startsAt).replace(/^(\d+):00$/,'$1h').replace(':','h');}
function startsRecap(departures){
  const days=new Map();
  for(const departure of [...departures].sort((a,b)=>a.startsAt-b.startsAt)){
    const day=recapDay.format(departure.startsAt);
    if(!days.has(day))days.set(day,[]);
    days.get(day).push(departure.timePending?'horaire à confirmer':hourLabel(departure.startsAt));
  }
  return [...days].map(([day,times])=>`📅 **${day}** · ${[...new Set(times)].join(', ')}`).join('\n');
}
// One block per race: its name is the link to the race, the bar has the colour of its simulator.
function raceEmbed(departures,siteUrl,compact=false,current=false){
  const first=departures[0],{title,note}=eventTitleAndNote(first.eventName);
  const circuit=circuitNames.get(first.circuit)||first.circuit||'Circuit à préciser';
  const duration=first.durationMinutes||first.durationHours?durationLabel(first.durationMinutes||first.durationHours*60):'';
  const details=[`📍 ${clean(circuit)}`,duration&&`⏱️ ${duration}`,TYPE_LABELS[first.eventType]&&`🏷️ ${TYPE_LABELS[first.eventType]}`].filter(Boolean).join(' · ');
  const embed={title:cut(`${current?'🔴 En cours — ':'🏁 '}${title}`,256),description:cut([details,note,startsRecap(departures)].filter(Boolean).join('\n'),4096),color:current?0xd71920:SIM_COLORS[simOf(first)],
    fields:raceFields(departures,compact)};
  const url=raceUrl(siteUrl,first);if(url)embed.url=url;
  return embed;
}
function groupByRace(departures){
  const groups=new Map();
  for(const departure of departures){const key=departure.eventId||departure.eventName;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(departure);}
  return [...groups.values()];
}
const embedSize=embed=>JSON.stringify([embed.title,embed.description,embed.author?.name,embed.footer?.text,...(embed.fields||[]).flatMap(field=>[field.name,field.value])]).length;
// Discord's 6000-character budget applies to all embeds together, including field names.
function fitDiscordEmbeds(embeds){
  const size=()=>embeds.reduce((total,embed)=>total+[embed.title,embed.description,embed.author?.name,embed.footer?.text,...(embed.fields||[]).flatMap(field=>[field.name,field.value])].reduce((sum,text)=>sum+String(text||'').length,0),0);
  let shortened=false;
  while(size()>5900){
    const candidates=embeds.flatMap(embed=>[
      {object:embed,key:'description'},...(embed.fields||[]).map(field=>({object:field,key:'value'}))
    ]).filter(item=>String(item.object[item.key]||'').length>80).sort((a,b)=>b.object[b.key].length-a.object[a.key].length);
    if(candidates.length){const {object,key}=candidates[0];object[key]=cut(object[key],Math.max(80,Math.floor(object[key].length/2)));}
    else{
      const embed=embeds.filter(item=>(item.fields||[]).some(field=>field.name!=='🚫 Pilotes absents')).sort((a,b)=>b.fields.length-a.fields.length)[0];
      if(!embed)break;
      embed.fields.splice(embed.fields.findIndex(field=>field.name!=='🚫 Pilotes absents'),1);
    }
    shortened=true;
  }
  if(shortened)embeds[0].footer={text:'Détails complets des équipages et pilotes sur le site.'};
  return embeds;
}
function footer(updatedAt){return{text:`Endurance Manager · mise à jour à ${updateTimeLabel.format(updatedAt)}`};}

// The weekly message: a header with the community, one block per race (its name links to the race on the
// community's site), the community's banner at the bottom. Discord allows 10 blocks and 6000 characters.
// `site`: {url, name, logoUrl, bannerUrl} of the community (url: address of its site).
export function buildWeeklyDiscordPayload(snapshot,site={},updatedAt=Date.now(),scope='lmu'){
  const siteUrl=typeof site==='string'?(()=>{try{return new URL(site).origin;}catch{return '';}})():String(site.url||'');
  const sim=SCOPE_LABELS[scope]??' LMU',simPage=scope==='iracing'?'/iracing/':scope==='all'?'/':'/lmu/';
  const current=Array.isArray(snapshot.currentDepartures)?snapshot.currentDepartures:[],future=Array.isArray(snapshot.futureDepartures)?snapshot.futureDepartures:[];
  const header={title:cut(`📝 ${cap(snapshot.periodLabel||'semaine à venir')}`,256),color:0x52d3d8};
  if(siteUrl)header.url=`${siteUrl}${simPage}`;
  if(site.name){header.author={name:cut(site.name,256)};if(siteUrl)header.author.url=`${siteUrl}/`;if(site.logoUrl)header.author.icon_url=site.logoUrl;}
  if(!current.length&&!future.length){
    header.description=`Aucune course avec un équipage engagé n’est en cours et aucun prochain départ${sim} n’est programmé.`;
    header.title=`Aucune endurance${sim} à préparer`;header.color=0x6b7280;header.footer=footer(updatedAt);
    return{content:'',embeds:[header],allowed_mentions:{parse:[]}};
  }
  const build=compact=>{
    const blocks=[...groupByRace(current).map(group=>raceEmbed(group,siteUrl,compact,true)),...groupByRace(future).map(group=>raceEmbed(group,siteUrl,compact))];
    // 10 blocks at most: beyond 8 races, the others are listed (linked) in one last block.
    if(blocks.length>8){
      const rest=groupByRace([...current,...future]).slice(8);
      blocks.length=8;
      blocks.push({title:'Autres courses de la semaine',color:0x52d3d8,description:cut(rest.map(group=>{const url=raceUrl(siteUrl,group[0]),name=clean(eventTitleAndNote(group[0].eventName).title);return `🏁 ${url?`[${name}](${url})`:name} — ${departureTitle(group[0])}`;}).join('\n'),4096)});
    }
    return [header,...blocks];
  };
  let embeds=build(false);
  if(embeds.reduce((total,embed)=>total+embedSize(embed),0)>5600)embeds=build(true);
  const last=embeds[embeds.length-1];
  if(site.bannerUrl)last.image={url:site.bannerUrl};
  last.footer=footer(updatedAt);
  return{content:'',embeds:fitDiscordEmbeds(embeds.slice(0,10)),allowed_mentions:{parse:[]}};
}

export function isWeeklyDiscordMutation(request){
  const method=String(request?.method||'').toUpperCase();if(!['POST','PUT','PATCH','DELETE'].includes(method))return false;
  let path;try{path=racesPath(new URL(request.url).pathname);}catch{return false;}
  const uuid='[a-f0-9-]{36}';
  if(new RegExp(`^/api/events/${uuid}/absence$`).test(path))return ['PUT','DELETE'].includes(method);
  if(path==='/api/events'&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}$`).test(path)&&['PATCH','DELETE'].includes(method))return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/registrations$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/crews$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/registrations/${uuid}$`).test(path))return true;
  if(new RegExp(`^/api/crews/${uuid}(?:/members(?:/${uuid})?)?$`).test(path))return true;
  return false;
}
