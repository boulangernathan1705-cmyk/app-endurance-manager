// The week of the « Accueil » page (front/app/week-view.mjs), Monday to Sunday in Paris time, without any page code
// (tested on its own).
import {eventMinutes,raceFinishAt} from '../shared/duration.mjs';

const DAY=86400000;
const paris=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
// The Paris date of a moment, as a day number (days since 1970-01-01).
export const parisDay=timestamp=>Date.parse(paris.format(timestamp)+'T00:00:00Z')/DAY;
// The Monday of the week of a moment (offset: weeks after it), as a day number.
export function weekStart(timestamp=Date.now(),offset=0){
  const day=parisDay(timestamp),weekday=new Date(day*DAY).getUTCDay();
  return day-(weekday===0?6:weekday-1)+offset*7;
}
const mineOn=departure=>(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable');
const pilotsOn=departure=>new Set((departure.availability||[]).filter(reg=>reg.status!=='unavailable').map(reg=>reg.participantId||reg.id)).size;
// Every race of the week, by day (the day of its start in Paris), in time order: a race of several starts that day is
// ONE item with all its starts (Nathan 2026-11-01), a race over several days on the day it starts (with its end).
export function weekDays(events,monday){
  const days=Array.from({length:7},(_,index)=>({day:monday+index,items:[]}));
  for(const event of events){
    if(event.archived)continue;
    const byDay=new Map();
    for(const departure of event.departures||[]){
      const startsAt=Number(departure.startsAt);
      if(!Number.isFinite(startsAt))continue;
      const index=parisDay(startsAt)-monday;
      if(index<0||index>6)continue;
      const minutes=eventMinutes(event);
      // An endurance finishes 30 min (practice and qualifying) after its race time, as everywhere on the site.
      const endsAt=minutes>0?(event.format==='solo'?startsAt+minutes*60000:raceFinishAt(startsAt,minutes)):null;
      if(!byDay.has(index))byDay.set(index,[]);
      byDay.get(index).push({departure,startsAt,endsAt,mine:mineOn(departure),pilots:pilotsOn(departure)});
    }
    for(const [index,starts] of byDay){
      starts.sort((a,b)=>a.startsAt-b.startsAt);
      const first=starts[0],own=starts.find(start=>start.mine);
      days[index].items.push({event,starts,departure:(own||first).departure,startsAt:first.startsAt,endsAt:starts.at(-1).endsAt,
        mine:Boolean(own),pilots:starts.reduce((sum,start)=>sum+start.pilots,0)});
    }
  }
  for(const day of days)day.items.sort((a,b)=>a.startsAt-b.startsAt||String(a.event.name).localeCompare(String(b.event.name),'fr'));
  return days;
}
