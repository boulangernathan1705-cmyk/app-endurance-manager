import {simForEvent} from '../shared/catalog.mjs';

export const raceFilterKey=(game,format='endurance')=>format==='solo'?'em_race_filters_v1_solo':`em_race_filters_v2_${game}`;
const communityOfEntry=(item,fallback)=>item?.community?.id||fallback;

export function raceMatches(event,filters,{communityId='',now=Date.now(),archived=false}={}){
  if(filters.communities.length){
    // A race of the site's community, or an official race with an entry or a crew of a chosen community.
    const chosen=new Set(filters.communities);
    const ok=event.official?(event.departures||[]).some(departure=>(departure.availability||[]).some(reg=>chosen.has(communityOfEntry(reg,communityId)))||(departure.crews||[]).some(crew=>chosen.has(communityOfEntry(crew,communityId)))):chosen.has(communityId);
    if(!ok)return false;
  }
  if(filters.types.length&&!filters.types.some(type=>type==='official'?event.official:(event.eventType||'private')===type))return false;
  if(filters.categories.length&&!(event.categories||[]).some(category=>filters.categories.includes(category)))return false;
  if(filters.sims.length&&!filters.sims.includes(simForEvent(event)))return false;
  if(filters.kinds.length&&!filters.kinds.includes(event.details?.type||''))return false;
  if(filters.from||filters.to){
    // One start (its Paris date) in the chosen days.
    const days=(event.departures||[]).map(departure=>departure.date).filter(Boolean);
    if(!days.some(day=>(!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)))return false;
  }
  if(filters.situation){
    const departures=(event.departures||[]).filter(d=>archived||Number(d.startsAt)>now);
    const registrations=departures.flatMap(d=>(d.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable').map(reg=>({reg,crew:(d.crews||[]).some(crew=>(crew.registrationIds||[]).includes(reg.id))})));
    const registered=registrations.length>0,withCrew=registrations.some(item=>item.crew);
    if(filters.situation==='registered'&&!registered)return false;
    if(filters.situation==='crew'&&!withCrew)return false;
    if(filters.situation==='no-crew'&&(!registered||withCrew))return false;
    if(filters.situation==='free'&&registered)return false;
    if(filters.situation==='absent'&&!(event.absences||[]).some(item=>item.mine))return false;
  }
  return true;
}

export function mySituation(event,{includePast=false}={}){
  const now=Date.now();
  const departures=[...(event.departures||[])].filter(d=>includePast||Number(d.startsAt)>now).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  let first=null;
  for(const departure of departures){
    const regs=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
    if(!regs.length)continue;
    for(const reg of regs){
      const crew=(departure.crews||[]).find(item=>(item.registrationIds||[]).includes(reg.id));
      if(crew)return {departure,reg,crew,mates:(crew.registrationIds||[]).map(id=>departure.availability.find(item=>item.id===id)).filter(item=>item&&item.id!==reg.id).map(item=>item.name)};
    }
    first??={departure,reg:regs[0],crew:null,mates:[],categories:regs.map(reg=>reg.category).filter(Boolean)};
  }
  return first;
}
