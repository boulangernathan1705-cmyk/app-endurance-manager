// Optional TDZ home: common view and filters, scoped to community and account.
import {state,button,esc} from './core.mjs';
import {filterStorageKey,readFilterState,writeFilterState} from '../filter-state.mjs';
import {weekStart,parisDay} from '../week-days.mjs';
import {simForEvent} from '../../shared/catalog.mjs';
import {isStream} from '../../shared/stream.mjs';
import {parisMonth,seasonMonths} from '../../shared/season.mjs';
export const fusedTdzHome=()=>state.access==='member'&&state.eventTdz&&state.soloRaces;
const key=()=>filterStorageKey('tdz-home',{communityId:state.community?.id,userId:state.user?.id});
const views=['week','month','list'],kinds=['lmu','iracing','event','stream','mine'];
export function homePrefs(){
  const scope=key();
  if(state.tdzHomeScope!==scope){
    const saved=readFilterState(scope);
    state.tdzHomeScope=scope;
    state.tdzHomePrefs={view:views.includes(saved.view)?saved.view:'week',filters:Array.isArray(saved.filters)?saved.filters.includes('all')?['all']:saved.filters.filter(k=>kinds.includes(k)):[]};
    state.weekOffset=0;
  }
  return state.tdzHomePrefs;
}
function save(){writeFilterState(key(),homePrefs());}
export function homeView(){return homePrefs().view;}
// Opening the home is different from browsing it: keep preferences, reset the calendar position.
export function resetHomeDate(){
  if(fusedTdzHome())homePrefs();
  state.weekOffset=0;
  if(!fusedTdzHome())return;
  state.calendarShift=0;state.calendarMonth=parisMonth();state.calendarDay=null;state.calendarStep=0;
}
const weekMonth=()=>parisMonth(Date.now()+(Number(state.weekOffset)||0)*7*86400000);
export function setHomeView(view){
  if(!views.includes(view))return;
  const prior=homeView();
  if(view==='month'&&prior!=='month'){
    const month=weekMonth();
    let shift=0;
    for(let i=0;i<120&&!seasonMonths(state.tdzSeason,parisMonth(),shift).includes(month);i++)shift+=month<seasonMonths(state.tdzSeason,parisMonth(),shift)[0]?-1:1;
    state.calendarShift=shift;state.calendarMonth=month;state.calendarDay=null;
  }
  if(prior==='month'&&view!=='month'){
    // Only an explicitly selected day or a different month changes the week. Returning from
    // the same month without picking a day must not jump back to the month's first week.
    const month=state.calendarMonth;
    if(state.calendarDay?.startsWith(month)){
      const date=Date.parse(state.calendarDay+'T12:00:00Z');
      if(Number.isFinite(date))state.weekOffset=(weekStart(date)-weekStart())/7;
    }else if(month&&month!==weekMonth()){
      const date=month===parisMonth()?Date.now():Date.parse(month+'-01T12:00:00Z');
      if(Number.isFinite(date))state.weekOffset=(weekStart(date)-weekStart())/7;
    }
  }
  homePrefs().view=view;save();
}
export function homeViewSwitch(){return '<div class="cal-view" role="group" aria-label="Affichage">'+[['week','Semaine'],['month','Mois'],['list','Liste']].map(([k,label])=>button('tdz-home-view',label,'data-view="'+k+'" aria-pressed="'+(homeView()===k)+'"','event-filter-button')).join('')+'</div>';}
export function selectHomeFilter(k){
  const p=homePrefs(),chosen=new Set(p.filters);
  if(k==='all'){chosen.clear();chosen.add('all');}else if(kinds.includes(k)){chosen.delete('all');if(chosen.has(k))chosen.delete(k);else chosen.add(k);}
  p.filters=[...chosen];save();
}
// No selection: the TDZ programme. Explicit 'Tout': all types. A selected simulator replaces the implicit default.
export function homeFilters(){const filters=homePrefs().filters;return new Set(filters.includes('all')?[]:filters.length?filters:['event']);}
export function homeFilterBar(){
  const chosen=homeFilters();
  return '<div class="event-filter week-filters" role="group" aria-label="Filtrer les événements">'+[['all','Tout'],['lmu','Endurance LMU'],['iracing','Endurance iRacing'],['event','Events TDZ'],['stream','📺 Streams'],['mine','Mes courses']].map(([k,label])=>button('week-filter',(k==='all'?'':'<i aria-hidden="true"></i>')+label,'data-filter="'+k+'" aria-pressed="'+(k==='all'?!chosen.size:chosen.has(k))+'"','event-filter-button week-filter is-'+k)).join('')+'</div>';
}
const monthDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'});
export function homeWeekNav(){
  const offset=Number(state.weekOffset)||0,monday=weekStart(Date.now(),offset),date=n=>monthDay.format(new Date(n*86400000)).replace(/^1 /,'1er ');
  const label=offset===0?'Cette semaine':offset===1?'La semaine prochaine':offset===-1?'La semaine dernière':'Semaine du '+date(monday);
  return '<div class="week-nav" role="group" aria-label="Changer de semaine">'+button('week','‹','data-offset="-1" aria-label="Semaine précédente"','secondary-button week-step')+'<span class="week-label">'+esc(label)+'<small>du '+esc(date(monday))+' au '+esc(date(monday+6))+'</small></span>'+button('week','›','data-offset="1" aria-label="Semaine suivante"','secondary-button week-step')+(offset?button('week','Revenir à cette semaine','data-offset="0"','link-button week-back'):'')+'</div>';
}
export function weekContains(departure,monday){
  const at=Number(departure.startsAt);
  if(departure.startsAt==null||!Number.isFinite(at)||departure.tbd)return false;
  const day=parisDay(at);return day>=monday&&day<monday+7;
}

// Shared filtering by departure: a registration or stream on another day must not leak into the selected week.
export function homeMatches(event,departure){
  const chosen=homeFilters(),types=[...chosen].filter(k=>k!=='mine');
  const solo=event.format==='solo',game=event.otherGame||simForEvent(event);
  const regs=(departure.availability||[]).filter(reg=>reg.status!=='unavailable');
  const mine=regs.some(reg=>reg.mine),streamed=regs.some(reg=>reg.streamTime);
  if(types.length&&!types.includes(solo?'event':game)&&!(types.includes('event')&&streamed)&&!(types.includes('stream')&&(isStream(event)||streamed||Boolean(event.details?.streamTime))))return false;
  if(chosen.has('mine')&&!mine)return false;
  return true;
}
export function filterHomeEvents(events){
  return events.flatMap(event=>{const departures=(event.departures||[]).filter(d=>homeMatches(event,d));return departures.length||(!(event.departures||[]).length&&homeMatches(event,{}))?[{...event,departures}]:[];});
}

// TDZ activities (including streamed endurance starts) come before plain endurances.
export function homePriority(event){
  return event.format==='solo'||isStream(event)||(event.departures||[]).some(d=>(d.availability||[]).some(reg=>reg.status!=='unavailable'&&reg.streamTime))?0:1;
}

// Group starts by Paris day, without changing the full event.
export function agendaDays(events,monday){
  const days=Array.from({length:7},(_,i)=>({day:monday+i,events:[]}));
  for(const event of events){
    if(event.schedulePending)continue;
    const grouped=new Map();
    for(const departure of event.departures||[]){
      if(!weekContains(departure,monday))continue;
      const day=parisDay(Number(departure.startsAt));
      if(!grouped.has(day))grouped.set(day,[]);
      grouped.get(day).push(departure);
    }
    for(const [day,departures] of grouped){
      departures.sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
      days[day-monday].events.push({...event,departures});
    }
  }
  for(const day of days)day.events.sort((a,b)=>Number(a.departures[0].startsAt)-Number(b.departures[0].startsAt)||String(a.name).localeCompare(String(b.name),'fr'));
  return days.filter(day=>day.events.length);
}
