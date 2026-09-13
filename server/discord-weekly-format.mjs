import {catalogForGame} from '../shared/catalog.mjs';

const DAY_MS=86_400_000,HOUR_MS=3_600_000,TIME_ZONE='Europe/Paris';
const circuitNames=new Map(catalogForGame('lmu').circuits.map(c=>[c.id,c.name]));
const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const startLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'});
const endLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const departureLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const updateTimeLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
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
function pilotLines(pilots){return pilots.map(name=>`👤 ${clean(name)}`).join('\n');}
function crewText(crew){
  const marker=markers.get(crew.category)||'⬜',status=crew.locked?'🔒 Complet':'🔓 Ouvert',pilots=crew.pilots.length?pilotLines(crew.pilots):'Aucun pilote affecté';
  return `${marker} ${clean(crew.name)} · ${clean(crew.category)} · ${status}\n${crew.car?`🏎️ ${clean(crew.car)}`:'🏎️ Voiture à définir'}\n${pilots}`;
}
function crewField(crew){const [name,...rest]=crewText(crew).split('\n');return{name:cut(name,256),value:cut(rest.join('\n'),1024),inline:false};}
function departureFields(departure){
  const fields=departure.crews.slice(0,23).map(crewField);
  if(departure.crews.length>23)fields.push({name:'Autres équipages',value:`${departure.crews.length-23} équipage(s) supplémentaire(s) sont visibles sur Endurance Manager.`,inline:false});
  if(departure.unassignedPilots?.length)fields.push({name:'📋 Pilotes inscrits non affectés',value:cut(pilotLines(departure.unassignedPilots),1024),inline:false});
  return fields.slice(0,25);
}
function currentDepartureEmbed(departure,appUrl){
  const circuit=circuitNames.get(departure.circuit)||departure.circuit||'Circuit à préciser';
  const embed={title:cut(`🔴 Course en cours — ${clean(departure.eventName)}`,256),description:cut(`📅 **${departureLabel.format(departure.startsAt)}**\n📍 ${clean(circuit)}\n⏱️ ${departure.durationHours||'?'} h`,4096),color:0xd71920,fields:departureFields(departure)};
  if(appUrl)embed.url=appUrl;
  return embed;
}
function eventTitleAndNote(eventName){
  const text=String(eventName??'').trim(),match=text.match(/^(.*?)\s*\(([^)]*horaires?[^)]*)\)\s*$/i);
  if(!match)return{title:clean(text),note:''};
  return{title:clean(match[1]),note:cap(clean(match[2]))};
}
function futureDepartureBlock(departure){
  const details=[...departure.crews.map(crewText)];
  if(departure.unassignedPilots?.length)details.push(`📋 Pilotes inscrits non affectés\n${pilotLines(departure.unassignedPilots)}`);
  const heading=`🕐 **${clean(departureLabel.format(departure.startsAt).replace(' à ',' — '))}**`;
  return cut(details.length?`${heading}\n${details.join('\n\n')}`:heading,1024);
}
function groupedFutureFields(departures){
  const groups=new Map();
  for(const departure of departures){const key=departure.eventId||departure.eventName||'event';if(!groups.has(key))groups.set(key,{eventName:departure.eventName,departures:[]});groups.get(key).departures.push(departure);}
  const fields=[];
  for(const group of groups.values()){
    const {title,note}=eventTitleAndNote(group.eventName);let first=true,chunk=note;
    for(const departure of group.departures){const block=futureDepartureBlock(departure),candidate=chunk?`${chunk}\n\n${block}`:block;if(candidate.length>1024&&chunk){fields.push({name:cut(first?`🏁 ${title}`:'↳ Suite',256),value:cut(chunk,1024),inline:false});first=false;chunk=block;}else chunk=candidate;}
    if(chunk)fields.push({name:cut(first?`🏁 ${title}`:'↳ Suite',256),value:cut(chunk,1024),inline:false});
  }
  return fields;
}
function futureDepartureEmbeds(departures,periodLabel,appUrl){
  const fields=groupedFutureFields(departures),embeds=[];
  for(let i=0;i<fields.length;i+=25){const embed={title:cut(`📝 ${cap(periodLabel||'semaine à venir')}`,256),color:0x2563eb,fields:fields.slice(i,i+25)};if(appUrl)embed.url=appUrl;embeds.push(embed);}
  return embeds;
}
function footer(updatedAt){return{text:`mise à jour à ${updateTimeLabel.format(updatedAt)}`};}

export function buildWeeklyDiscordPayload(snapshot,appUrl,updatedAt=Date.now()){
  const content='',current=Array.isArray(snapshot.currentDepartures)?snapshot.currentDepartures:[],future=Array.isArray(snapshot.futureDepartures)?snapshot.futureDepartures:[];
  if(!current.length&&!future.length)return{content,embeds:[{title:'Aucune endurance LMU à préparer',description:'Aucune course avec un équipage engagé n’est en cours et aucun prochain départ LMU n’est programmé.',color:0x6b7280,footer:footer(updatedAt)}],allowed_mentions:{parse:[]}};
  const embeds=[];
  for(const departure of current)embeds.push(currentDepartureEmbed(departure,appUrl));
  if(future.length)embeds.push(...futureDepartureEmbeds(future,snapshot.periodLabel,appUrl));
  const visible=embeds.slice(0,10);visible[visible.length-1].footer=footer(updatedAt);
  return{content,embeds:visible,allowed_mentions:{parse:[]}};
}

export function isWeeklyDiscordMutation(request){
  const method=String(request?.method||'').toUpperCase();if(!['POST','PATCH','DELETE'].includes(method))return false;
  let path;try{path=new URL(request.url).pathname;}catch{return false;}
  const uuid='[a-f0-9-]{36}';
  if(path==='/api/events'&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}$`).test(path)&&['PATCH','DELETE'].includes(method))return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/registrations$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/crews$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/registrations/${uuid}$`).test(path))return true;
  if(new RegExp(`^/api/crews/${uuid}(?:/members(?:/${uuid})?)?$`).test(path))return true;
  return false;
}
