import {racesPath} from './races-path.mjs';
import {durationLabel} from '../shared/duration.mjs';
import {catalogForGame, SIMS, TRACK_LIMITS} from '../shared/catalog.mjs';
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
// The week turns on the Monday at 7h30 (Paris), with the morning announcement and the events' calendar (Nathan, 2026-11-01).
export const WEEK_TURN_HOURS=7.5;
// When the week of `timestamp` hands over to the next one: the next Monday at 7h30, Paris time (summer or winter).
export function weekTurnAfter(timestamp){
  const monday=parisWeek(timestamp).monday+7;
  for(const offset of [1,2]){const at=monday*DAY_MS+WEEK_TURN_HOURS*HOUR_MS-offset*HOUR_MS;if(localDay(at)===monday&&updateTimeLabel.format(at)==='07:30')return at;}
  return monday*DAY_MS+WEEK_TURN_HOURS*HOUR_MS-HOUR_MS;
}
// The last time the week turned (Monday 7h30, Paris) at or before `timestamp`.
export function lastWeekTurn(timestamp){
  const turn=weekTurnAfter(timestamp-7*DAY_MS);
  return turn<=timestamp?turn:weekTurnAfter(timestamp-14*DAY_MS);
}
// Nathan's rule: a race's Discord thread and its crews' voices open on the Monday (Paris) of the week of the start,
// together with the week's calendar, whatever the race's length.
export function raceWeekOpen(startsAt,now=Date.now()){return Number.isFinite(Number(startsAt))&&parisWeek(Number(startsAt)).monday<=parisWeek(now).monday;}
export function isInParisWeek(timestamp,week){const day=localDay(timestamp);return day>=week.monday&&day<=week.sunday;}

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
// An endurance of the community's streamer: its start, name (link to it), sim and circuit, his crew, and his stream
// when he streams it (« Je streame ce départ »): « 📺 Stream 19h45 → 23h sur Twitch ».
function enduranceBox(event,siteUrl){
  const info=event.endurance,name=clean(event.name),url=raceUrl(siteUrl,{eventId:event.id,circuit:event.circuits[0]});
  const circuit=circuitNames.get(event.circuits[0])||event.circuits[0]||'';
  return{name:cut(`${info.streamTime?'📺':'🏁'} ${startTimeLabel(event.startsAt,event.timePending)}`,256),value:cut([url?`**[${name}](${url})**`:`**${name}**`,
    info.streamTime&&streamedLine(info.streamTime,info.streamEnd,info.streamUrl),
    [`🎮 Endurance ${SIM_SHORT[event.sim]||(event.sim==='iracing'?'iRacing':'LMU')}`,circuit&&`📍 ${clean(circuit)}`].filter(Boolean).join(' · '),
    info.crew&&`👥 **${clean(info.crew.name)}**${info.crew.pilots.length?` · ${info.crew.pilots.map(clean).join(', ')}`:''}`].filter(Boolean).join('\n'),1024),inline:false};
}
// A streamed race, in sight under its name (Nathan, 2026-11-11): « 📺 **Stream 19h45 → 23h00** sur Twitch ».
function streamedLine(time,end,url){
  const on=url?` sur [${streamPlatform(url)}](${url})`:'';
  return`📺 **Stream ${streamHour(time)}${end?` → ${streamHour(end)}`:''}**${on}`;
}
function calendarBox(event,siteUrl){
  if(event.stream)return streamBox(event,siteUrl);
  if(event.endurance)return enduranceBox(event,siteUrl);
  const name=clean(event.name),url=siteUrl?`${siteUrl}/${event.sim==='iracing'?'iracing':'lmu'}/#event=${encodeURIComponent(event.id)}`:'';
  const circuits=[...new Set(event.circuits.map(circuit=>circuitNames.get(circuit)||circuit).filter(Boolean))].map(clean).join(', ');
  const when=startTimeLabel(event.startsAt,event.timePending);
  const places=event.capacity
    ?`👥 ${Math.min(event.entered,event.capacity)}/${event.capacity} places${event.entered>=event.capacity?' · complet':''}${event.entered>event.capacity?` · ${event.entered-event.capacity} en attente`:''}`
    :event.entered?`👥 ${event.entered} inscrit${event.entered>1?'s':''}`:'👥 personne pour l’instant';
  return{name:cut(`${event.streamed?.time?'📺':'🏁'} ${when}`,256),value:cut([url?`**[${name}](${url})**`:`**${name}**`,event.streamed?.time&&streamedLine(event.streamed.time,'',event.streamed.url),[`🎮 ${SIM_SHORT[event.sim]||clean(event.sim)}`,circuits&&`📍 ${circuits}`].filter(Boolean).join(' · '),[places,event.access&&(event.access==='safe'?'🔒 SAFE':'🟢 OPEN')].filter(Boolean).join(' · '),event.capacity&&event.entered<event.capacity?`${event.capacity-event.entered} places disponibles`:''].filter(Boolean).join('\n'),1024),inline:false};
}
// The week's events (« EVENT SOLO », « EVENT TDZ »): one box per event, in the order of their starts.
// `snapshot`: {periodLabel, events:[{id,name,sim,circuits,startsAt,timePending,capacity,entered,access}]}.
// Bumped whenever the calendar's content changes: a release then redraws every calendar at once (v4: streams merged, 2026-11-11).
export const CALENDAR_FORMAT = 'calendar-v4:';
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
