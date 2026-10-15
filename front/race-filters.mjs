import {simForEvent,GAME_CATALOGS,EVENT_TYPE_IDS,SIM_IDS} from '../shared/catalog.mjs';
import {filterStorageKey,filterSelection,filterValue,filterDate} from './filter-state.mjs';
import {filterEventCommunities,entryCommunityId} from './community-filters.mjs';
import {eventSchedule} from './schedule.mjs';

export const raceFilterKey=(game,format='endurance',context={})=>filterStorageKey(format==='solo'?'events':'endurance',{...context,game:format==='solo'?'all':game});
export const emptyRaceFilters=()=>({communities:[],types:[],categories:[],sims:[],kinds:[],from:'',to:'',situation:''});
export function normalizeRaceFilters(raw,{game='lmu',format='endurance',communityIds=[],kindIds=[]}={}){
  const source=raw&&typeof raw==='object'?raw:{},solo=format==='solo';
  const filters={...emptyRaceFilters(),
    communities:solo||communityIds.length<2?[]:filterSelection(source.communities,communityIds),
    types:solo?[]:filterSelection(source.types,['official',...EVENT_TYPE_IDS]),
    categories:solo?[]:filterSelection(source.categories,Object.keys(GAME_CATALOGS[game]?.categories||{})),
    sims:solo?filterSelection(source.sims,SIM_IDS):[],kinds:solo?filterSelection(source.kinds,kindIds):[],
    from:filterDate(source.from),to:filterDate(source.to),
    situation:filterValue(source.situation,solo?['registered','free','absent']:['registered','crew','no-crew','free'])};
  if(filters.from&&filters.to&&filters.from>filters.to)[filters.from,filters.to]=[filters.to,filters.from];
  return filters;
}
const inDateRange=(departure,filters)=>(!filters.from||departure.date>=filters.from)&&(!filters.to||departure.date<=filters.to);
export function raceFilterView(event,filters,{communityId=''}={}){
  const shown=filterEventCommunities(event,filters.communities,communityId);
  return filters.from||filters.to?{...shown,departures:(shown.departures||[]).filter(departure=>inDateRange(departure,filters))}:shown;
}
export function filteredCalendarEvents(events,filters,options={}){
  const now=options.now??Date.now(),archived=options.archived===true;
  // A date-filtered view must never turn a still-upcoming race into an archived race.
  return events.filter(event=>eventSchedule(event,now).archived===archived&&raceMatches(event,filters,{...options,now,archived}))
    .map(event=>raceFilterView(event,filters,options));
}

export function raceMatches(event,filters,{communityId='',now=Date.now(),archived=false}={}){
  event=raceFilterView(event,filters,{communityId});
  const departures=(event.departures||[]).filter(d=>archived||!Number.isFinite(Number(d.startsAt))||Number(d.startsAt)>now);
  if(filters.communities.length){
    // A race of the site's community, or an official race with an entry or a crew of a chosen community.
    const chosen=new Set(filters.communities);
    const ok=event.official?departures.some(departure=>(departure.availability||[]).some(reg=>reg.status!=='unavailable'&&chosen.has(entryCommunityId(reg,communityId)))||(departure.crews||[]).some(crew=>chosen.has(entryCommunityId(crew,communityId)))):chosen.has(communityId);
    if(!ok)return false;
  }
  if(filters.types.length&&!filters.types.some(type=>type==='official'?event.official:(event.eventType||'private')===type))return false;
  if(filters.categories.length&&!(event.categories||[]).some(category=>filters.categories.includes(category)))return false;
  if(filters.sims.length&&!filters.sims.includes(simForEvent(event)))return false;
  if(filters.kinds.length&&!filters.kinds.includes(event.details?.type||''))return false;
  if(filters.from||filters.to){
    // One start (its Paris date) in the chosen days.
    if(!departures.length)return false;
  }
  if(filters.situation){
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

export function upcomingEntries(events,now=Date.now()){
  return events.flatMap(event=>(event.departures||[]).filter(departure=>Number(departure.startsAt)>now).flatMap(departure=>
    (departure.availability||[]).filter(reg=>(reg.mine||reg.managed)&&reg.status!=='unavailable').map(reg=>({event,departure,reg}))));
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
