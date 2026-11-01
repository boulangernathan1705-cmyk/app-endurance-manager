import {racesPath} from './races-path.mjs';
import {durationLabel,PRE_RACE_MINUTES} from '../shared/duration.mjs';
import {catalogForGame,SIMS,TRACK_LIMITS,normalizeTdzEventType} from '../shared/catalog.mjs';
import {hourLabel as streamHour,streamPlatform} from '../shared/stream.mjs';

const DAY_MS=86_400_000,HOUR_MS=3_600_000,TIME_ZONE='Europe/Paris';
const circuitNames=new Map([...catalogForGame('lmu').circuits,...catalogForGame('iracing').circuits].map(c=>[c.id,c.name]));
// What a recap message covers (community_recaps.scope).
const SCOPE_LABELS={all:'',lmu:' LMU',iracing:' iRacing'};
const SIM_MARKS={lmu:'🏎️',iracing:'🏁'};
const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const startLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'});
const endLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const updateTimeLabel=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const recapDay=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,weekday:'short',day:'numeric',month:'short'});
const recapWeekday=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,weekday:'short'});
const recapTime=new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'numeric',minute:'2-digit',hourCycle:'h23'});
const markers=new Map([['Hypercar','🟦'],['LMP2 ELMS','🟨'],['LMP2 WEC','🟨'],['LMP3','🟩'],['GT3','🟪'],['GTE','🟥']]);

// A pilot entered in several classes appears under their first class in this order.
const PILOT_CATEGORY_ORDER=['Hypercar','LMP2 ELMS','LMP2 WEC','LMP3','GTE','GT3'];
const categoryRank=category=>{const rank=PILOT_CATEGORY_ORDER.indexOf(category);return rank<0?PILOT_CATEGORY_ORDER.length:rank;};
const orderedCategories=categories=>[...categories].sort((a,b)=>categoryRank(a)-categoryRank(b));
const entryRank=entry=>Math.min(...(entry.categories||[entry.category]).map(categoryRank),PILOT_CATEGORY_ORDER.length);
const orderedEntries=entries=>[...entries].sort((a,b)=>entryRank(a)-entryRank(b));

function localDay(timestamp){
  const parts=Object.fromEntries(ymd.formatToParts(timestamp).map(p=>[p.type,p.value]));
  return Math.floor(Date.UTC(+parts.year,+parts.month-1,+parts.day)/DAY_MS);
}
function dayDate(day){return new Date(day*DAY_MS+12*HOUR_MS);}
function dayKey(day){const d=new Date(day*DAY_MS);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
function weekFromMonday(monday){const sunday=monday+6;return{key:dayKey(monday),monday,sunday,label:`semaine du ${startLabel.format(dayDate(monday))} au ${endLabel.format(dayDate(sunday))}`};}
export function parisWeek(timestamp=Date.now()){const day=localDay(timestamp),weekday=new Date(day*DAY_MS).getUTCDay();return weekFromMonday(day-(weekday===0?6:weekday-1));}
export function nextParisWeek(timestamp=Date.now()){return weekFromMonday(parisWeek(timestamp).monday+7);}
// The week turns on the Monday at 7h30 (Paris), with the morning announcement and the events' calendar (Nathan, 2026-11-01).
export const WEEK_TURN_HOURS=7.5;
// When the week of `timestamp` hands over to the next one: the next Monday at 7h30, Paris time (summer or winter).
export function weekTurnAfter(timestamp){
  const monday=parisWeek(timestamp).monday+7;
  for(const offset of [1,2]){const at=monday*DAY_MS+WEEK_TURN_HOURS*HOUR_MS-offset*HOUR_MS;if(localDay(at)===monday&&updateTimeLabel.format(at)==='07:30')return at;}
  return monday*DAY_MS+WEEK_TURN_HOURS*HOUR_MS-HOUR_MS;
}
// Nathan's rule: a race's Discord thread and its crews' voices open on the Monday (Paris) of the week of the start,
// together with the week's calendar, whatever the race's length.
export function raceWeekOpen(startsAt,now=Date.now()){return Number.isFinite(Number(startsAt))&&parisWeek(Number(startsAt)).monday<=parisWeek(now).monday;}
export function isInParisWeek(timestamp,week){const day=localDay(timestamp);return day>=week.monday&&day<=week.sunday;}
export function isDepartureRelevant(startsAt,durationHours,week,now=Date.now()){
  if(!Number.isFinite(startsAt)||!isInParisWeek(startsAt,week))return false;
  const hours=Number(durationHours),endAt=startsAt+(Number.isFinite(hours)&&hours>0?hours*HOUR_MS+PRE_RACE_MINUTES*60_000:0);
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
// The category logos of the site, uploaded as the bot's own emojis (images/discord-emojis, « em_gt3 »).
export function categoryEmojiName(sim,category){
  const image=catalogForGame(sim).categories?.[category]?.image;
  if(!image)return '';
  const file=image.replace(/\.[a-z]+$/,'');
  return 'em_'+({HC:'hypercar',LMP2:'lmp2',P3:'lmp3',GT3:'gt3',GTE:'gte'}[file]||file.replace('iracing-','ir_').replaceAll('-','_'));
}
export const CATEGORY_EMOJI_NAMES=[...new Set(['lmu','iracing'].flatMap(sim=>Object.keys(catalogForGame(sim).categories).map(category=>categoryEmojiName(sim,category))))];
// Its logo when the bot has it, otherwise its colour.
function categoryMark(category,sim,emojis={}){
  const name=categoryEmojiName(sim,category),id=emojis[name];
  return id?`<:${name}:${id}>`:markers.get(category)||'⬜';
}
// One way to write a start everywhere (Nathan, 2026-11-01): « Dim. 1 nov. · 13h00 », Paris time. Discord's <t:…> dates
// show in each reader's own language (« Sunday, November 1, 2026 1:00 PM »), so they are kept for « dans 2 heures » only.
export function clockLabel(startsAt){return recapTime.format(startsAt).replace(':','h');}
export function startTimeLabel(startsAt,timePending=false){return `${cap(recapDay.format(startsAt))} · ${timePending?'horaire à confirmer':clockLabel(startsAt)}`;}
function departureTitle(departure){return startTimeLabel(departure.startsAt,departure.timePending);}
// One crew per block, separated by a blank line: name, then its car, then one pilot per line.
function crewBlock(crew,sim,emojis){
  const marker=categoryMark(crew.category,sim,emojis),status=crew.locked?'🔒':'🔓';
  return [`${marker} **${clean(crew.name)}** · ${clean(crew.category)} ${status}`,crew.car&&`🏎️ ${clean(crew.car)}`,
    ...(crew.pilots.length?crew.pilots.map(name=>`👤 ${clean(name)}`):['*Aucun pilote*'])].filter(Boolean).join('\n');
}
const asPilot=pilot=>typeof pilot==='string'?{name:pilot,categories:[]}:pilot;
function pilotLine(pilot,sim,emojis){
  return [`👤 ${clean(pilot.name)}`,...orderedCategories(pilot.categories||[]).map(category=>emojis[categoryEmojiName(sim,category)]?categoryMark(category,sim,emojis):`${categoryMark(category,sim,emojis)} ${clean(category)}`)].join(' ');
}
// Pilots without a crew: one per line with the logos of their categories.
function unassignedBlock(pilots,sim,emojis){
  const list=orderedEntries(pilots.map(asPilot));
  if(!list.some(pilot=>pilot.categories?.length))return `📋 **Sans équipage** : ${list.map(pilot=>clean(pilot.name)).join(', ')}`;
  return ['📋 **Sans équipage**',...list.map(pilot=>pilotLine(pilot,sim,emojis))].join('\n');
}
// Compare both readings before truncating: repeated schedules versus repeated pilots.
function unassignedField(departures,compact,emojis){
  const sim=simOf(departures[0]),pilots=new Map();
  for(const departure of departures)for(const pilot of (departure.unassignedPilots||[]).map(asPilot)){
    if(!pilots.has(pilot.name))pilots.set(pilot.name,{name:pilot.name,categories:[],starts:[]});
    const entry=pilots.get(pilot.name);
    for(const category of pilot.categories||[])if(!entry.categories.includes(category))entry.categories.push(category);
    entry.starts.push(departure);
  }
  if(!pilots.size)return [];
  const startsLabel=starts=>{
    if(starts.length===departures.length)return 'tous les départs';
    if(compact)return `${starts.length} départ${starts.length>1?'s':''}`;
    const days=new Map();
    for(const departure of [...starts].sort((a,b)=>a.startsAt-b.startsAt)){
      const day=recapWeekday.format(departure.startsAt);
      if(!days.has(day))days.set(day,[]);
      days.get(day).push(departure.timePending?'horaire à confirmer':hourLabel(departure.startsAt));
    }
    return [...days].map(([day,times])=>`${day} ${times.join(', ')}`).join(' · ');
  };
  const byPilot=orderedEntries([...pilots.values()]).map(pilot=>`${pilotLine(pilot,sim,emojis)} · ${startsLabel(pilot.starts)}`).join('\n');
  const byDeparture=[...departures].sort((a,b)=>a.startsAt-b.startsAt)
    .filter(departure=>departure.unassignedPilots?.length)
    .map(departure=>{
      const list=orderedEntries(departure.unassignedPilots.map(asPilot));
      const time=departure.timePending?'horaire à confirmer':hourLabel(departure.startsAt);
      return [`📅 **${recapDay.format(departure.startsAt)} · ${time}** — ${list.length} pilote${list.length>1?'s':''}`,
        ...list.map(pilot=>pilotLine(pilot,sim,emojis))].join('\n');
    }).join('\n\n');
  // A small line penalty estimates vertical space; within 20%, favour reading by start.
  const readingSize=value=>value.length+8*value.split('\n').length;
  const value=!compact&&readingSize(byDeparture)<=readingSize(byPilot)*1.2?byDeparture:byPilot;
  return [{name:'📋 Sans équipage',value:cut(value,1024),inline:false}];
}
function departureValue(departure,compact=false,emojis={},title=departureTitle){
  const sim=simOf(departure);
  if(compact){
    const lines=[`🕐 **${departureTitle(departure)}**`,...orderedEntries(departure.crews).map(crew=>`${categoryMark(crew.category,sim,emojis)} ${clean(crew.name)} · ${crew.pilots.length} pilote${crew.pilots.length>1?'s':''}`)];
    if(departure.unassignedPilots?.length)lines.push(`📋 Sans équipage : ${departure.unassignedPilots.length}`);
    if(!departure.crews.length&&!departure.unassignedPilots?.length)lines.push('Personne d’inscrit pour l’instant.');
    return cut(lines.join('\n'),1024);
  }
  const blocks=[`🕐 **${title(departure)}**`,...orderedEntries(departure.crews).map(crew=>crewBlock(crew,sim,emojis))];
  if(departure.unassignedPilots?.length)blocks.push(unassignedBlock(departure.unassignedPilots,sim,emojis));
  if(!departure.crews.length&&!departure.unassignedPilots?.length)blocks.push('Personne d’inscrit pour l’instant.');
  return cut(blocks.join('\n\n'),1024);
}
// The starts of a race: only those with entries in detail (time, crews, pilots without a crew); the empty ones
// in one line at the end, so a special event with 15 starts stays short. A race with a single start keeps it.
const BLANK='\u200b';
function raceFields(departures,compact,emojis){
  const hasEntries=departure=>departure.crews.length||departure.unassignedPilots?.length;
  const absentPilots=[...new Set(departures.flatMap(departure=>departure.absentPilots||[]))];
  const absences=absentPilots.length?[{name:'🚫 Pilotes absents',value:cut(absentPilots.map(clean).join(', '),compact?300:1024),inline:false}]:[];
  if(departures.length===1)return [{name:BLANK,value:departureValue(departures[0],compact,emojis),inline:false},...absences];
  // Starts with crews in detail, a blank line after each; the pilots without a crew once, below.
  const filled=departures.filter(departure=>departure.crews.length);
  const fields=filled.slice(0,22).map(departure=>({name:BLANK,value:departureValue({...departure,unassignedPilots:[]},compact,emojis),inline:false}));
  fields.push(...unassignedField(departures,compact,emojis));
  if(!departures.some(hasEntries))fields.push({name:BLANK,value:'Personne d’inscrit pour l’instant.',inline:false});
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
function raceEmbed(departures,siteUrl,compact=false,current=false,emojis={}){
  const first=departures[0],{title,note}=eventTitleAndNote(first.eventName);
  const circuit=circuitNames.get(first.circuit)||first.circuit||'Circuit à préciser';
  const duration=first.durationMinutes||first.durationHours?durationLabel(first.durationMinutes||first.durationHours*60):'';
  const details=[`📍 ${clean(circuit)}`,duration&&`⏱️ ${duration}`,TYPE_LABELS[first.eventType]&&`🏷️ ${TYPE_LABELS[first.eventType]}`].filter(Boolean).join(' · ');
  const embed={title:cut(`${current?'🔴 En cours — ':'🏁 '}${title}`,256),description:cut([details,note,startsRecap(departures)].filter(Boolean).join('\n'),4096),color:current?0xd71920:SIM_COLORS[simOf(first)],
    fields:raceFields(departures,compact,emojis)};
  const url=raceUrl(siteUrl,first);if(url)embed.url=url;
  return embed;
}
// The race's conditions as set on the site (« Infos de la course »), on the race's card and on the crews' voice cards.
const SKY={clear:'☀️',lightClouds:'🌤️',partlyCloudy:'⛅',mostlyCloudy:'🌥️',overcast:'☁️',cloudyDrizzle:'🌦️',cloudyLightRain:'🌦️',
  overcastLightRain:'🌧️',overcastRain:'🌧️',overcastHeavyRain:'🌧️',overcastStorm:'⛈️'};
const WEATHER={dry:'☀️ Sec',mixed:'🌦️ Variable',rain:'🌧️ Pluie'};
export function conditionFields(info={}){
  const weather=[WEATHER[info.weather],Array.isArray(info.weatherSlots)&&info.weatherSlots.some(Boolean)?info.weatherSlots.map(sky=>SKY[sky]||'❔').join(' '):'',clean(info.weatherNote)].filter(Boolean);
  return [weather.length&&{name:'🌦️ Météo',value:cut(weather.join('\n'),1024),inline:true},
    info.tyres&&{name:'🛞 Pneus',value:`${info.tyres} pneu${info.tyres>1?'s':''}`,inline:true},
    TRACK_LIMITS[info.trackLimits]&&{name:'🚧 Limites de piste',value:TRACK_LIMITS[info.trackLimits],inline:true},
    info.fairShare===true&&{name:'⚖️ Partage équitable',value:'Oui',inline:true}].filter(Boolean);
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
// `emojis`: ids of the bot's category emojis by name; without them the categories keep their colour.
// `weekly`: the week's message of one sim (« 📝 Endurances LMU · semaine du … »), not a race's channel.
// `alone`: a race's thread, its block only (the week is already in the channel's message).
// `threads`: « un fil par course », the week's message lists the races only, each a link to its thread ({eventId: thread id}).
// With threads, the banner, the week and the link to the site are in a message of their own above (buildWeekHeadPayload):
// each sim's message is its name, its races and the time of update.
export function buildWeeklyDiscordPayload(snapshot,site={},updatedAt=Date.now(),scope='lmu',emojis={},{weekly=false,alone=false,threads=null,absent=null,head=true}={}){
  const siteUrl=typeof site==='string'?(()=>{try{return new URL(site).origin;}catch{return '';}})():String(site.url||'');
  const sim=SCOPE_LABELS[scope]??' LMU',simPage=scope==='iracing'?'/iracing/':scope==='all'?'/':'/lmu/';
  const current=Array.isArray(snapshot.currentDepartures)?snapshot.currentDepartures:[],future=Array.isArray(snapshot.futureDepartures)?snapshot.futureDepartures:[];
  const period=snapshot.periodLabel||'semaine à venir';
  const header={title:cut(weekly?`📝 Endurances${sim} · ${period}`:`📝 ${cap(period)}`,256),color:0x52d3d8};
  // « Semaine du … » leads to the site's home (« Accueil », the week of every sim), like the calendar's title (Nathan, 2026-11-01).
  if(siteUrl)header.url=`${siteUrl}/`;
  if(site.name){header.author={name:cut(site.name,256)};if(siteUrl)header.author.url=`${siteUrl}/`;if(site.logoUrl)header.author.icon_url=site.logoUrl;}
  if(threads){delete header.url;delete header.author;delete header.title;}
  if(!current.length&&!future.length){
    if(threads){
      Object.assign(header,{title:`${SIM_MARKS[scope]||'🏁'} Aucune endurance${sim} cette semaine`,color:0x6b7280,footer:footer(updatedAt)});
      return weekCards(header,site,siteUrl,period,head);
    }
    header.description=`Aucune course avec un équipage engagé n’est en cours et aucun prochain départ${sim} n’est programmé.`;
    header.title=`Aucune endurance${sim} à préparer`;header.color=0x6b7280;header.footer=footer(updatedAt);
    return{content:'',embeds:[header],allowed_mentions:{parse:[]}};
  }
  if(threads){
    // One message per sim and channel (Nathan, 2026-11-01, « option A »): the card of the community and the week with its
    // banner (first message of the channel), then the sim's card, each race in two or three lines (its day and the link to
    // its thread; circuit, length and type; its start times and crews).
    const races=[...groupByRace(current).map(group=>[group,true]),...groupByRace(future).map(group=>[group,false])];
    const box=([group,live])=>{const first=group[0],thread=threads[first.eventId],url=raceUrl(siteUrl,first),name=clean(eventTitleAndNote(first.eventName).title);
      const circuit=circuitNames.get(first.circuit)||first.circuit||'Circuit à préciser';
      const duration=first.durationMinutes||first.durationHours?durationLabel(first.durationMinutes||first.durationHours*60):'';
      const day=recapDay.format(first.startsAt);
      const times=group.map(departure=>departure.timePending?'horaire à confirmer':recapDay.format(departure.startsAt)===day?`**${clockLabel(departure.startsAt)}**`:`${recapDay.format(departure.startsAt).split(' ')[0]} ${clockLabel(departure.startsAt)}`);
      const crews=group.reduce((total,departure)=>total+(departure.crews||[]).filter(crew=>crew.pilots?.length).length,0);
      return [`${live?'🔴 **En cours** · ':''}**${cap(day)}** · ${thread?`<#${thread}>`:url?`[${name}](${url})`:name}`,
        [`📍 ${clean(circuit)}`,duration&&`⏱️ ${duration}`,TYPE_LABELS[first.eventType]&&`🏷️ ${TYPE_LABELS[first.eventType]}`].filter(Boolean).join(' · '),
        [`🕑 ${[...new Set(times)].join(' · ')}`,crews&&`👥 ${crews} équipage${crews>1?'s':''}`].filter(Boolean).join(' · ')].join('\n');};
    let shown=races.length,description='';
    // 4096 characters at most: the last races go to the site.
    do{description=[...races.slice(0,shown).map(box),shown<races.length&&`… et ${races.length-shown} autre${races.length-shown>1?'s':''} sur le site.`].filter(Boolean).join('\n\n');}while(description.length>4000&&--shown>0);
    Object.assign(header,{color:SIM_COLORS[scope]||header.color,title:cut(`${SIM_MARKS[scope]||'🏁'}${sim} · ${races.length} course${races.length>1?'s':''} à venir`,256),description,footer:footer(updatedAt)});
    if(siteUrl)header.url=`${siteUrl}${simPage}`;
    return weekCards(header,site,siteUrl,period,head);
  }
  const build=compact=>{
    const blocks=[...groupByRace(current).map(group=>raceEmbed(group,siteUrl,compact,true,emojis)),...groupByRace(future).map(group=>raceEmbed(group,siteUrl,compact,false,emojis))];
    // 10 blocks at most: beyond 8 races, the others are listed (linked) in one last block.
    if(blocks.length>8){
      const rest=groupByRace([...current,...future]).slice(8);
      blocks.length=8;
      blocks.push({title:'Autres courses de la semaine',color:0x52d3d8,description:cut(rest.map(group=>{const url=raceUrl(siteUrl,group[0]),name=clean(eventTitleAndNote(group[0].eventName).title);return `🏁 ${url?`[${name}](${url})`:name} — ${departureTitle(group[0])}`;}).join('\n'),4096)});
    }
    return alone&&blocks.length?blocks:[header,...blocks];
  };
  let embeds=build(false);
  if(embeds.reduce((total,embed)=>total+embedSize(embed),0)>5600)embeds=build(true);
  const last=embeds[embeds.length-1];
  // The banner stays on the week's and the day's messages: in a race's thread it took half the height for nothing.
  if(site.bannerUrl&&!alone)last.image={url:site.bannerUrl};
  last.footer=footer(updatedAt);
  const payload={content:'',embeds:fitDiscordEmbeds(embeds.slice(0,10)),allowed_mentions:{parse:[]}};
  // A race's thread: « S’inscrire » opens the race on the site, « Absent » (absent: its button) marks it from Discord.
  const first=[...current,...future][0],url=raceUrl(siteUrl,first);
  if(alone&&url)payload.components=[{type:1,components:[{type:2,style:5,label:'S’inscrire',emoji:{name:'✅'},url},...(absent?[absent(first.eventId)]:[])]}];
  return payload;
}

// The week's message of a sim in « un fil par course »: on the first message of the channel, the card of the community, the
// week (a link to the site) and its banner above the sim's card. A wide clear picture under the sim's card gives it the
// banner's width: the two cards line up (Nathan, 2026-11-01).
function weekCards(card,site,siteUrl,period,head){
  const embeds=[card];
  if(siteUrl)card.image={url:`${siteUrl}/images/discord-spacer.png`};
  if(head){
    const top=buildWeekHeadPayload(period,site,'all').embeds[0];
    embeds.unshift(top);
  }
  return{content:'',embeds,components:[],allowed_mentions:{parse:[]}};
}
// Above the sims' messages of a channel: the community, the week (a link to the site) and the banner.
// counts: the races of the week by sim ({lmu, iracing}), one box each for the sims of the channel.
export function buildWeekHeadPayload(periodLabel,site={},scope='all'){
  const siteUrl=String(site.url||'');
  const embed={title:cut(`📝 ${cap(periodLabel||'semaine à venir')}`,256),color:0x52d3d8};
  if(site.name){embed.author={name:cut(site.name,256)};if(siteUrl)embed.author.url=`${siteUrl}/`;if(site.logoUrl)embed.author.icon_url=site.logoUrl;}
  if(site.bannerUrl)embed.image={url:site.bannerUrl};
  // The week links to the site's home (« Accueil »: the week of every sim) rather than a button (less room); components:[] takes off the buttons of before.
  if(siteUrl)embed.url=`${siteUrl}/`;
  return{content:'',embeds:[embed],components:[],allowed_mentions:{parse:[]}};
}

const SIM_SHORT=Object.fromEntries(SIMS.map(sim=>[sim.id,sim.short]));
// One event of the calendar: its day and time on top (Paris time), then its name (link to it), sim, circuits, places and lobby.
// A stream (« Annoncer un stream »): its day, its title (link to it), its times, the streamer's crew and the stream's link.
function streamBox(event,siteUrl){
  const name=clean(event.name),url=siteUrl?`${siteUrl}/lmu/#event=${encodeURIComponent(event.id)}`:'',stream=event.stream;
  return{name:cut(`🎙 ${cap(recapDay.format(event.startsAt))}`,256),value:cut([url?`**[${name}](${url})**`:`**${name}**`,streamFacts(stream),stream.crew&&streamCrewText(stream.crew)].filter(Boolean).join('\n'),1024),inline:false};
}
// « 📺 Stream 19h45 sur [Twitch](…) · 🏁 Départ 20h00 · 🎮 LMU ».
function streamFacts(stream){
  const on=stream.streamUrl?` sur [${streamPlatform(stream.streamUrl)}](${stream.streamUrl})`:'';
  return [stream.streamTime?`📺 Stream ${streamHour(stream.streamTime)}${on}`:on&&`📺 En direct${on}`,stream.raceTime&&`🏁 Départ ${streamHour(stream.raceTime)}`,(stream.activity||stream.raceSim)&&`🎮 ${clean(stream.activity || SIM_SHORT[stream.raceSim] || stream.raceSim)}`].filter(Boolean).join(' · ');
}
const streamCrewText=crew=>`👥 ${clean(crew.eventName)} avec l’**${clean(crew.crew)}**${crew.pilots.length?` · ${crew.pilots.map(clean).join(', ')}`:''}`;
function calendarBox(event,siteUrl){
  if(event.stream)return streamBox(event,siteUrl);
  const name=clean(event.name),url=siteUrl?`${siteUrl}/${event.sim==='iracing'?'iracing':'lmu'}/#event=${encodeURIComponent(event.id)}`:'';
  const circuits=[...new Set(event.circuits.map(circuit=>circuitNames.get(circuit)||circuit).filter(Boolean))].map(clean).join(', ');
  const when=startTimeLabel(event.startsAt,event.timePending);
  const places=event.capacity
    ?`👥 ${Math.min(event.entered,event.capacity)}/${event.capacity} places${event.entered>=event.capacity?' · complet':''}${event.entered>event.capacity?` · ${event.entered-event.capacity} en attente`:''}`
    :event.entered?`👥 ${event.entered} inscrit${event.entered>1?'s':''}`:'👥 personne pour l’instant';
  return{name:cut(`🏁 ${when}`,256),value:cut([url?`**[${name}](${url})**`:`**${name}**`,[`🎮 ${SIM_SHORT[event.sim]||clean(event.sim)}`,circuits&&`📍 ${circuits}`].filter(Boolean).join(' · '),[places,event.access&&(event.access==='safe'?'🔒 SAFE':'🟢 OPEN')].filter(Boolean).join(' · '),event.capacity&&event.entered<event.capacity?`${event.capacity-event.entered} places disponibles`:''].filter(Boolean).join('\n'),1024),inline:false};
}
// The week's events (« EVENT SOLO », « EVENT TDZ »): one box per event, in the order of their starts.
// `snapshot`: {periodLabel, events:[{id,name,sim,circuits,startsAt,timePending,capacity,entered,access}]}.
export const CALENDAR_FORMAT = 'calendar-v3:';
export function buildCalendarPayload(snapshot,site={},updatedAt=Date.now()){
  const siteUrl=String(site.url||''),events=Array.isArray(snapshot.events)?snapshot.events:[];
  // One title (Nathan, 2026-11-01): « 📅 Events du 26 octobre au 1 novembre 2026 ».
  const period=String(snapshot.periodLabel||'').replace(/^semaine /i,'');
  const embed={title:cut(`📅 Events ${period||'de la semaine'}`,256),color:events.length?0xe7b653:0x6b7280};
  if(events.length){embed.fields=events.slice(0,events.length>25?24:25).map((event,index)=>{const field=calendarBox(event,siteUrl);if(index)field.name=cut(`────────────\n${field.name}`,256);return field;});if(events.length>25)embed.fields.push({name:BLANK,value:`… et ${events.length-24} autres events sur le site.`,inline:false});}
  else embed.description='Aucun événement de prévu pour l’instant.';
  if(site.bannerUrl)embed.image={url:site.bannerUrl};
  embed.footer=footer(updatedAt);
  // The title links to the events (no button: less room); components:[] takes off the buttons of before.
  if(siteUrl)embed.url=`${siteUrl}/events/`;
  return{content:'',embeds:[embed],components:[],allowed_mentions:{parse:[]}};
}

// The race a change is about: its id in the address, or the entry / crew to look up (null when unknown).
export function mutationTarget(request){
  let path;try{path=racesPath(new URL(request.url).pathname);}catch{return null;}
  const match=path.match(/^\/api\/(events|registrations|crews)\/([a-f0-9-]{36})/);
  return match?{kind:match[1],id:match[2]}:null;
}
export function isWeeklyDiscordMutation(request){
  const method=String(request?.method||'').toUpperCase();if(!['POST','PUT','PATCH','DELETE'].includes(method))return false;
  let path;try{path=racesPath(new URL(request.url).pathname);}catch{return false;}
  const uuid='[a-f0-9-]{36}';
  if(new RegExp(`^/api/events/${uuid}/absence$`).test(path))return ['PUT','DELETE'].includes(method);
  // The Discord setting: the crews' voice channels follow at once.
  if(path==='/api/community/discord'&&['PUT','DELETE'].includes(method))return true;
  if(path==='/api/events'&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}/official$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}$`).test(path)&&['PATCH','DELETE'].includes(method))return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/registrations$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/events/${uuid}/departures/${uuid}/crews$`).test(path)&&method==='POST')return true;
  if(new RegExp(`^/api/registrations/${uuid}$`).test(path))return true;
  if(new RegExp(`^/api/crews/${uuid}(?:/members(?:/${uuid})?)?$`).test(path))return true;
  return false;
}

// « Annonce du jour » (server/discord-announce.mjs): at 7h30 the day's events and endurances, to make the pilots want to come.
// The day of a time in Paris (« 2026-10-28 »).
export function parisDay(timestamp){return dayKey(localDay(timestamp));}
// Each race has its hook: the event's type (BOULOULES, Training, Gridfest) or else its sim, then OPEN / SAFE behind it; the
// endurances after their kind. Only at TDZ do the events have types and OPEN / SAFE (as on the site).
export const ANNOUNCE_HOOKS={
  lmu:'Protos et GT vous attendent sur Le Mans Ultimate : place à la course !',
  iracing:'Place à iRacing : chaque dixième compte.',
  ams2:'Automobilista 2 au programme : du pilotage pur et des bagarres serrées.',
  ace:'Assetto Corsa EVO au programme : sortez les gants, ça va glisser.',
  acrally:'Spéciales au programme : notes en main et pied droit au plancher.',
  BOULOULES:'Soirée BOULOULES ! Ambiance détendue et fous rires garantis, le chrono passe après.',
  'TONDEUZ TRAINING':'Entraînement collectif : on tourne, on compare, on progresse ensemble.',
  Gridfest:'C’est le Gridfest ! Pilote pour ton streamer et viens faire le show.',
  open:'Grille ouverte à tous sur {sim}, nouveaux comme habitués !',
  safe:'Course SAFE sur {sim} : on roule propre et on respecte les autres.',
  official:'Course officielle LMU aujourd’hui : nos équipages défendent les couleurs de la communauté !',
  officialIracing:'Course spéciale iRacing aujourd’hui : nos équipages défendent les couleurs de la communauté !',
  championship:'Manche de championnat aujourd’hui : chaque point compte, on vise le podium !',
  endurance:'Jour d’endurance : relais, stratégie, et tout l’équipage soudé jusqu’au drapeau à damier.'};
const isGridfestType=type=>['Gridfest','Grindfest'].includes(type);
// One sentence (Nathan, 2026-11-01): the event's type, else OPEN / SAFE with its sim, else its sim. OPEN / SAFE is also on
// the line of its time.
export function eventHook(event){
  const type=isGridfestType(event.type)?'Gridfest':normalizeTdzEventType(event.type);
  if(event.tdz&&ANNOUNCE_HOOKS[type]&&!['open','safe'].includes(type))return ANNOUNCE_HOOKS[type];
  if(event.tdz&&['open','safe'].includes(event.access))return ANNOUNCE_HOOKS[event.access].replace('{sim}',SIM_SHORT[event.sim]||clean(event.sim)||'LMU');
  return ANNOUNCE_HOOKS[event.sim]||ANNOUNCE_HOOKS.lmu;
}
export function raceHook(race){
  const iracing=String(race.circuit||'').startsWith('iracing-');
  if(race.eventType==='lmu')return ANNOUNCE_HOOKS.championship;
  if(race.official)return iracing?ANNOUNCE_HOOKS.officialIracing:ANNOUNCE_HOOKS.official;
  return ANNOUNCE_HOOKS.endurance;
}
const ANNOUNCE_SIM_COLORS={lmu:0xd8322c,iracing:0x2f6fd6,ams2:0xf08a24,ace:0x2fae5b,acrally:0x8b5cf6};
const ROUND_WEATHER={sun:'☀️',cloud:'⛅',overcast:'☁️',rain:'🌧️',random:'🎲 météo aléatoire'};
const plural=(count,word)=>`${count} ${word}${count>1?'s':''}`;
// « Ce soir 21h00 » after 18h, else « Aujourd’hui 14h00 » (Paris time).
function announceTime(startsAt,timePending){
  if(timePending)return 'Aujourd’hui · horaire à confirmer';
  const hour=Number(new Intl.DateTimeFormat('fr-FR',{timeZone:TIME_ZONE,hour:'numeric',hourCycle:'h23'}).formatToParts(startsAt).find(part=>part.type==='hour').value);
  return `${hour>=18?'Ce soir':'Aujourd’hui'} ${recapTime.format(startsAt).replace(':','h')}`;
}
// The buttons under each race: « S’inscrire » opens it on the site, « Absent » (absent: its button) marks it from Discord.
function announceButtons(url,eventId,absent){
  return url?[{type:1,components:[{type:2,style:5,label:'S’inscrire',emoji:{name:'✅'},url},...(absent?[absent(eventId)]:[])]}]:[];
}
// « 📺 Lancement du stream sur Twitch à 19h45 »: the community's stream (site.streamUrl, a link on its platform) and the
// stream times the admins gave today's events (streams: [{name, time:'19:45'}]). Without a stream time today, nothing:
// the streamer neither streams nor races that day (Nathan, 2026-11-01).
function streamLine(site,streams=[]){
  const url=String(site.streamUrl||''),host=url&&URL.canParse(url)?new URL(url).hostname.replace(/^www\./,''):'';
  const label=/(^|\.)twitch\.tv$/.test(host)?'Twitch':/(^|\.)(youtube\.com|youtu\.be)$/.test(host)?'YouTube':/(^|\.)kick\.com$/.test(host)?'Kick':'notre chaîne';
  const where=url?` sur [${label}](${url})`:'',at=time=>time.replace(':','h');
  const times=[...new Map(streams.filter(item=>item.time).map(item=>[item.time,item])).values()].sort((a,b)=>a.time.localeCompare(b.time));
  if(!url||!times.length)return '';
  return `📺 Lancement du stream${where} à ${times.length===1?at(times[0].time):times.map(item=>`${at(item.time)} (${clean(item.name)})`).join(', ')}`;
}
// The first message: the community, « C'est jour de course ! », what the day holds and the banner; it pings @everyone.
// counts: {events, races, streams}.
export function buildAnnounceIntro(counts,site={}){
  const parts=[counts.events&&`**${plural(counts.events,'event')}**`,counts.races&&`**${plural(counts.races,'endurance')}**`,counts.lives&&`**${plural(counts.lives,'stream')}**`].filter(Boolean);
  const streamOnly=counts.lives>0&&!counts.events&&!counts.races;
  const embed={title:streamOnly?'🎙 C’est jour de stream !':'🏁 C’est jour de course !',color:streamOnly?0x9146ff:0xd71920,
    description:[`Aujourd’hui sur le serveur : ${parts.join(' et ')}.`,streamLine(site,counts.streams),streamOnly?'Retrouve les horaires et les liens du live ci-dessous 👇':'Inscris-toi, préviens si tu ne viens pas, et rendez-vous en piste 👇'].filter(Boolean).join('\n\n')};
  if(site.name){embed.author={name:cut(site.name,256)};if(site.url)embed.author.url=`${site.url}/`;if(site.logoUrl)embed.author.icon_url=site.logoUrl;}
  if(site.bannerUrl)embed.image={url:site.bannerUrl};
  return{content:'@everyone',embeds:[embed],allowed_mentions:{parse:['everyone']}};
}
function roundName(round){
  if(round.randomCategory||round.circuit==='random'||round.circuit==='iracing-random')return '📍 Circuit aléatoire · 🎲 catégorie au hasard';
  return `📍 ${clean(circuitNames.get(round.circuit)||round.circuit||'Circuit à préciser')}`;
}
// A single round on one line, as an endurance (Nathan, 2026-11-01): « 📍 Portimão · LMP3 · 🏎️ Ligier · ⏱️ 4 h · 🎲 météo aléatoire ».
function roundLine(round){
  const categories=round.randomCategory?'':(round.categories?.length?round.categories:round.category?[round.category]:[]).map(clean).join(', ');
  return [roundName(round),categories,round.car&&`🏎️ ${clean(round.car)}`,round.durationMinutes&&`⏱️ ${durationLabel(round.durationMinutes)}`,
    ROUND_WEATHER[round.weather],round.fuel>1&&`⛽ ×${round.fuel}`,round.tyres>1&&`🛞 ×${round.tyres}`].filter(Boolean).join(' · ');
}
// Compare each fact independently: a common circuit must not hide a different car.
// Missing values are not evidence that a setting is shared by all rounds.
function sharedRoundDetails(rounds){
  const facts=round=>({
    circuit:round.circuit?`📍 ${clean(circuitNames.get(round.circuit)||round.circuit)}`:'',
    category:round.randomCategory?'🎲 Catégorie au hasard':(round.categories?.length?round.categories:round.category?[round.category]:[]).map(clean).sort().join(', '),
    car:round.car?`🏎️ ${clean(round.car)}`:'',
    weather:ROUND_WEATHER[round.weather]||'',
    fuel:round.fuel!=null?`⛽ Carburant ×${round.fuel}`:'',
    tyres:round.tyres!=null?`🛞 Pneus ×${round.tyres}`:'',
    capacity:round.capacity?`👥 ${round.capacity} places`:''
  });
  const values=rounds.map(facts),keys=Object.keys(values[0]);
  const shared=keys.filter(key=>values[0][key]&&values.every(value=>value[key]===values[0][key]));
  const lines=value=>[
    ['circuit','category','car'].map(key=>value[key]).filter(Boolean).join(' · '),
    ['weather','fuel','tyres'].map(key=>value[key]).filter(Boolean).join(' · '),
    value.capacity
  ].filter(Boolean).join('\n');
  const common=Object.fromEntries(shared.map(key=>[key,values[0][key]]));
  return {common:lines(common),commonFields:[
      {name:'📍 Circuit et voiture',value:lines({circuit:common.circuit,category:common.category,car:common.car})},
      {name:'Conditions communes',value:lines({weather:common.weather,fuel:common.fuel,tyres:common.tyres,capacity:common.capacity})}
    ].filter(field=>field.value).map(field=>({...field,inline:false})),
    fields:rounds.slice(0,4).map((round,index)=>({name:`Manche ${index+1}${round.durationMinutes?` · Course : ${round.durationMinutes} min`:''}`,inline:false,
      value:cut([lines(Object.fromEntries(keys.filter(key=>!shared.includes(key)).map(key=>[key,values[index][key]]))),
        [round.practice&&`Essais : ${round.practice} min`,round.qualifying&&`Qualifications : ${round.qualifying} min`].filter(Boolean).join(' · ')
      ].filter(Boolean).join('\n')||BLANK,1024)}))};
}
// An event of the day: its hook, the admin's note, when and on which sim, its rounds, the count of présents and the buttons.
// event: {id,name,sim,type,access,tdz,note,startsAt,timePending,rounds,capacity,entered,streamers,rally,password}.
export function buildAnnounceEvent(event,site={},updatedAt=Date.now(),absent=null){
  const siteUrl=String(site.url||''),url=siteUrl?`${siteUrl}/${event.sim==='iracing'?'iracing':'lmu'}/#event=${encodeURIComponent(event.id)}`:'';
  const gridfest=isGridfestType(event.type),rounds=Array.isArray(event.rounds)?event.rounds:[];
  const typeLabel=event.tdz&&event.type&&!['OPEN','SAFE'].includes(event.type)?`🏷️ ${clean(gridfest?'Gridfest':normalizeTdzEventType(event.type))}`:'';
  const lines=[eventHook(event),event.note&&`*« ${clean(event.note)} »*`,
    [`🕘 ${announceTime(event.startsAt,event.timePending)}`,`🎮 ${SIM_SHORT[event.sim]||clean(event.sim)}`,typeLabel,event.tdz&&!gridfest&&event.access&&event.access.toUpperCase()].filter(Boolean).join(' · ')];
  const rally=event.rally;
  const grouped=!rally&&rounds.length>1?sharedRoundDetails(rounds):null;
  if(rally){
    if(rally.stages?.length)lines.push(`🏔️ Spéciales : ${rally.stages.map(clean).join(', ')}`);
    const cars=rally.carMode==='category'&&rounds[0]?.category?`🚗 Catégorie imposée : ${clean(rounds[0].category)}`:rally.carMode==='car'&&rounds[0]?.car?`🚗 Voiture imposée : ${clean(rounds[0].car)}`:rally.carMode==='all'?'🚗 Toutes voitures':'';
    lines.push([cars,rally.minutes&&`⏱️ environ ${durationLabel(rally.minutes)}`].filter(Boolean).join(' · '));
    if(rally.host)lines.push(`🏠 Hôte : ${clean(rally.host)}`);
  }else if(rounds.length===1)lines.push(roundLine(rounds[0]));
  if(gridfest&&event.streamers?.length)lines.push(event.streamers.map(streamer=>`🎙️ ${streamer.twitchUrl?`[${clean(streamer.name)}](${streamer.twitchUrl})`:clean(streamer.name)} · ${Math.min(streamer.entered,streamer.capacity)}/${streamer.capacity} places${streamer.entered>=streamer.capacity?' · complet':''}`).join('\n'));
  const places=event.capacity&&!gridfest?(event.entered>=event.capacity?` · complet${event.entered>event.capacity?` · ${event.entered-event.capacity} en attente`:''}`:` · ${plural(event.capacity-event.entered,'place')} restante${event.capacity-event.entered>1?'s':''}`):'';
  const count=`✅ **${plural(Math.min(event.entered,event.capacity||event.entered),'présent')}**${places}`;
  const [hook,note,when,...details]=lines;
  const embed={title:cut(`🏁 ${clean(event.name)}`,256),color:ANNOUNCE_SIM_COLORS[event.sim]||0xe7b653,description:cut([`**${when}**`,hook,note,...details].filter(Boolean).join('\n\n'),4096)};
  if(grouped)embed.fields=[...grouped.commonFields.filter(field=>field.name==='📍 Circuit et voiture'),...grouped.fields,...grouped.commonFields.filter(field=>field.name!=='📍 Circuit et voiture')];
  embed.fields=[...(embed.fields||[]),{name:BLANK,value:count,inline:false}];
  if(event.password)embed.fields.push({name:BLANK,value:'🔑 Mot de passe disponible sur la fiche',inline:false});
  if(url)embed.url=url;
  if(event.logoUrl)embed.thumbnail={url:event.logoUrl};
  embed.footer=footer(updatedAt);
  return{content:'',embeds:[embed],components:announceButtons(url,event.id,absent),allowed_mentions:{parse:[]}};
}
// A stream of the day (« Annoncer un stream »): « Ce soir, c’est stream ! », its times and link, the streamer's crew when he
// races; no « Présent » nor « Absent ». event: {id,name,startsAt,stream:{streamTime,raceSim,raceTime,streamUrl,crew}}.
export function buildAnnounceStream(event,site={},updatedAt=Date.now()){
  const siteUrl=String(site.url||''),stream=event.stream,hour=Number(String(stream.streamTime||stream.raceTime||'').split(':')[0]);
  const embed={title:cut(`🎙 ${clean(event.name)}`,256),color:0x9146ff,
    description:cut([`**${hour>=18?'Ce soir':'Aujourd’hui'}, c’est stream !**`,streamFacts(stream),stream.crew&&streamCrewText(stream.crew)].filter(Boolean).join('\n'),4096)};
  if(siteUrl)embed.url=`${siteUrl}/lmu/#event=${encodeURIComponent(event.id)}`;
  embed.footer=footer(updatedAt);
  return{content:'',embeds:[embed],components:[],allowed_mentions:{parse:[]}};
}
// An endurance of the day: its hook, its conditions, then each of today's starts with its crews and pilots (as in its
// thread). race: {id,name,circuit,eventType,official,durationMinutes,details,departures} (departures: today's, as loaded
// for the threads).
export function buildAnnounceRace(race,site={},updatedAt=Date.now(),emojis={},absent=null){
  const siteUrl=String(site.url||''),first={eventId:race.id,circuit:race.circuit},url=raceUrl(siteUrl,first);
  const {title,note}=eventTitleAndNote(race.name),circuit=circuitNames.get(race.circuit)||race.circuit||'Circuit à préciser';
  const info=race.details||{};
  const conditions=[`📍 ${clean(circuit)}`,race.durationMinutes&&`⏱️ ${durationLabel(race.durationMinutes)}`,WEATHER[info.weather],info.tyres&&`🛞 ${plural(info.tyres,'pneu')}`,
    TRACK_LIMITS[info.trackLimits]&&`🚧 Limites ${TRACK_LIMITS[info.trackLimits].toLowerCase()}`,info.fairShare===true&&'⚖️ Partage équitable'].filter(Boolean).join(' · ');
  const departures=(race.departures||[]).filter(departure=>departure.crews.length||departure.unassignedPilots?.length);
  // « Aujourd’hui 13h00 », as the events: a Discord date would show in each reader's language, in full.
  const today=departure=>announceTime(departure.startsAt,departure.timePending);
  // Each start: its time, then one line per crew with its pilots' names, to put them forward (Nathan, 2026-11-01).
  const sim=simOf(first),startBlock=departure=>[`🕐 **${today(departure)}**`,...orderedEntries(departure.crews).map(crew=>`${categoryMark(crew.category,sim,emojis)} **${clean(crew.name)}** · ${crew.pilots.map(clean).join(', ')}`)].join('\n');
  const fields=departures.length?[{name:BLANK,value:cut(departures.slice(0,20).map(startBlock).join('\n\n'),1024),inline:false}]:[];
  if(!departures.length)fields.push({name:BLANK,value:`${(race.departures||[]).map(departure=>`🕐 **${today(departure)}**`).join('\n')}\nAucun équipage pour l’instant : lance-toi !`,inline:false});
  const pilots=new Set(departures.flatMap(departure=>[...departure.crews.flatMap(crew=>crew.pilots),...(departure.unassignedPilots||[]).map(pilot=>typeof pilot==='string'?pilot:pilot.name)]));
  const crews=departures.reduce((total,departure)=>total+departure.crews.length,0);
  fields.push({name:BLANK,value:`✅ **${plural(pilots.size,'présent')}**${crews?` · ${plural(crews,'équipage')}`:''}`,inline:false});
  const embed={title:cut(`🏁 ${title}`,256),color:SIM_COLORS[simOf(first)],description:cut([`**${raceHook(race)}**`,note,conditions].filter(Boolean).join('\n'),4096),fields};
  if(url)embed.url=url;
  embed.footer=footer(updatedAt);
  const [fitted]=fitDiscordEmbeds([embed]);
  return{content:'',embeds:[fitted],components:announceButtons(url,race.id,absent),allowed_mentions:{parse:[]}};
}


// A single Discord message: community intro, the day's cards, and the existing banner.
export function buildCompleteAnnouncement(intro, items, site={}) {
  const head=structuredClone(intro.embeds[0]);
  delete head.image;
  const cards=items.slice(0,9).flatMap(item=>structuredClone(item.payload.embeds||[])).slice(0,9);
  const streamLink=String(head.description||'').match(/\[(Twitch|YouTube|Kick|notre chaîne)\]\((https?:\/\/[^\s)]+)\)/);
  // Start directly with the first race; no generic introduction or event counts.
  delete head.author;
  head.title=cards[0]?.title||'Rendez-vous';
  head.description=cards[0]?.description||'';
  if(cards[0]?.url)head.url=cards[0].url;
  head.fields=[];
  for(const [index,card] of cards.entries()) {
    const title=card.url?`**[${card.title}](${card.url})**`:`**${card.title}**`;
    if(index)head.fields.push({name:'────────────',value:cut([title,card.description].filter(Boolean).join('\n\n'),1024),inline:false});
    const fields=card.fields||[];
    if(fields.length) {
      // Real embed fields provide breathing room between rounds and participation.
      const limit=Math.max(1,Math.floor((24-cards.length)/cards.length));
      const selected=fields.length<=limit?fields:[...fields.slice(0,limit-1),fields.at(-1)];
      head.fields.push(...selected.map((field,index)=>({...field,
        name:field.name,inline:false})));
    }
  }
  if(cards.length===1) {
    head.color=cards[0].color||head.color;
    if(cards[0].thumbnail)head.thumbnail=cards[0].thumbnail;
  }
  if(items.length>9)head.fields.push({name:'────────────',value:`… et ${items.length-9} autres rendez-vous : [calendrier complet](${site.url}/events/).`,inline:false});
  if(site.bannerUrl)head.image={url:site.bannerUrl};
  const lastFooter=cards.at(-1)?.footer;
  if(lastFooter)head.footer=lastFooter;
  const embeds=[head];
  const actionable=items.filter(item=>item.payload.components?.length);
  const components=actionable.length<=5 ? actionable.map(item=>({type:1,components:item.payload.components[0].components.map(button=>({...button,
    label:cut(`${button.style===5?'S’inscrire':'Absent'}${actionable.length>1?` · ${item.name}`:''}`,80)}))}))
    : [{type:1,components:[{type:2,style:5,label:'Inscriptions et absences sur le site',url:`${site.url}/events/`}]}];
  // Embed fields appear above its image: keep the live link just above the banner.
  if(streamLink&&head.fields.length<25){
    const channel=new URL(streamLink[2]).pathname.split('/').filter(Boolean)[0]||'';
    // « 📺 En direct avec La Praline · 13h45 », whatever the hour (« La soirée avec… » at 13h45 read wrong, Nathan 2026-11-01).
    const name=clean(site.streamName||channel);
    const times=[...new Set((site.streams||[]).map(stream=>stream.time).filter(time=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort();
    const at=times.length?` · ${times.map(time=>time.replace(':','h')).join(', ')}`:'';
    head.fields.push({name:cut(`📺 En direct${name?` avec ${name}`:''}${at}`,256),value:`**[▶ Rejoindre le stream](${streamLink[2]})**`,inline:false});
  }
  return {content:intro.content,embeds:fitDiscordEmbeds(embeds),components,allowed_mentions:intro.allowed_mentions};
}
