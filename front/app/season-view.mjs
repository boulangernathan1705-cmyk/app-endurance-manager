import {state,esc,button,loadArchive,showError} from './core.mjs';
import {monthKey,validMonth,shiftMonth,seasonMonths,monthDays} from '../season-calendar.mjs';
import {raceMatches,raceFilterView} from '../race-filters.mjs';
import {weekEventCard,weekEventKind} from './week-view.mjs';

const DAY=86400000;
const monthName=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});
const dayName=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const label=key=>monthName.format(new Date(key+'-01T12:00:00Z'));
const storageKey=()=>`em_tdz_season:${state.community?.id||''}:${state.user?.id||''}`;
let archiveRequest=null;
export function seasonSettings(){
  const key=storageKey();
  if(state.tdzSeason?.key!==key){
    let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    state.tdzSeason={key,start:validMonth(saved?.start)?saved.start:monthKey(Date.now()),length:saved?.length===3?3:4,view:saved?.view==='season'?'season':'month',month:0};
  }
  return state.tdzSeason;
}
export function changeSeason(field,value){
  const settings=seasonSettings();
  if(field==='start'&&validMonth(value)){settings.start=value;settings.month=0;}
  if(field==='length'){settings.length=Number(value)===3?3:4;settings.month=Math.min(settings.month,settings.length-1);}
  if(field==='view')settings.view=value==='season'?'season':'month';
  if(field==='month')settings.month=Math.max(0,Math.min(settings.length-1,Number(value)||0));
  if(field==='shift'){const start=shiftMonth(settings.start,Number(value)*settings.length);if(validMonth(start)){settings.start=start;settings.month=0;}}
  try{localStorage.setItem(settings.key,JSON.stringify(settings));}catch{}
}
export function renderSeasonCalendar(events,filters,rerender){
  const settings=seasonSettings(),months=seasonMonths(settings.start,settings.length),now=Date.now();
  // Reuse the cached archive endpoint, once per session, to keep the beginning of the season visible.
  if(!state.archiveLoaded&&!archiveRequest){
    archiveRequest=loadArchive().then(()=>{if(state.page==='home'&&state.listFormat==='solo'&&state.eventTdz)rerender();}).catch(showError).finally(()=>{archiveRequest=null;});
  }
  const matching=events.filter(event=>raceMatches(event,filters,{communityId:state.community?.id,archived:true})&&(state.eventFilter!=='mine'||(event.departures||[]).some(d=>(d.availability||[]).some(r=>r.mine&&r.status!=='unavailable')))).map(event=>raceFilterView(event,filters,{communityId:state.community?.id}));
  const cards=day=>day.items.map(item=>weekEventCard({...item,kind:weekEventKind(item.event),pending:item.starts.every(start=>start.departure.hideClock===true)},now)).join('');
  const monthContent=(key,full)=>{
    const days=monthDays(matching,key),count=days.reduce((n,day)=>n+day.items.length,0);
    if(full)return `<section class="tdz-season-month" aria-label="${esc(label(key))}"><h2>${esc(label(key))}<small>${count} événement${count>1?'s':''}</small></h2>${days.filter(day=>day.inMonth&&day.items.length).map(day=>`<section class="tdz-season-date"><h3>${esc(dayName.format(new Date(day.day*DAY)))}</h3><div class="tdz-season-cards">${cards(day)}</div></section>`).join('')||'<p class="empty">Aucun événement programmé.</p>'}</section>`;
    return `<section aria-label="${esc(label(key))}"><h2 class="tdz-calendar-title">${esc(label(key))}<small>${count} événement${count>1?'s':''}</small></h2><div class="tdz-month-grid">${['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(name=>`<div class="tdz-weekday" aria-hidden="true">${name}</div>`).join('')}${days.map(day=>`<section class="tdz-month-day${day.inMonth?'':' is-outside'}${day.items.length?' has-events':''}" aria-label="${esc(dayName.format(new Date(day.day*DAY)))}" ${day.inMonth?'':'aria-hidden="true"'}><h3><span class="tdz-day-long">${esc(dayName.format(new Date(day.day*DAY)))}</span><span class="tdz-day-number">${new Date(day.day*DAY).getUTCDate()}</span></h3><div class="tdz-day-cards">${cards(day)}</div></section>`).join('')}</div>${count?'':'<p class="empty">Aucun événement programmé ce mois-ci.</p>'}</section>`;
  };
  // Undated events remain reachable instead of disappearing from the calendar.
  const undated=matching.filter(event=>!(event.departures||[]).some(d=>d.startsAt!==null&&d.startsAt!==''&&Number.isFinite(Number(d.startsAt))));
  return `<section class="tdz-calendar" aria-label="Calendrier de saison"><div class="tdz-season-toolbar"><div class="tdz-period-fields"><label>Début de période<input type="month" min="2000-01" max="2100-12" data-season-field="start" value="${settings.start}"></label><label>Durée<select data-season-field="length"><option value="3" ${settings.length===3?'selected':''}>3 mois</option><option value="4" ${settings.length===4?'selected':''}>4 mois</option></select></label></div><div class="event-filter" role="group" aria-label="Présentation du calendrier">${button('tdz-season','Mois',`data-field="view" data-value="month" aria-pressed="${settings.view==='month'}"`,'event-filter-button')}${button('tdz-season','Toute la saison',`data-field="view" data-value="season" aria-pressed="${settings.view==='season'}"`,'event-filter-button')}</div></div><div class="tdz-period-nav">${button('tdz-season','‹', 'data-field="shift" data-value="-1" aria-label="Période précédente"','secondary-button')}<strong>${esc(label(months[0]))} → ${esc(label(months.at(-1)))}</strong>${button('tdz-season','›','data-field="shift" data-value="1" aria-label="Période suivante"','secondary-button')}</div>${settings.view==='month'?`<div class="tdz-month-tabs" role="group" aria-label="Mois de la saison">${months.map((key,index)=>button('tdz-season',esc(label(key)),`data-field="month" data-value="${index}" aria-pressed="${settings.month===index}"`,'secondary-button')).join('')}</div>${monthContent(months[settings.month],false)}`:`<div class="tdz-season-overview">${months.map(key=>monthContent(key,true)).join('')}</div>`}${undated.length?`<section class="tdz-undated"><h2>Dates à confirmer</h2>${undated.map(event=>button('open',esc(event.name),`data-id="${esc(event.id)}"`,'secondary-button')).join('')}</section>`:''}${!state.archiveLoaded?`<p class="tdz-calendar-hint">${archiveRequest?'Chargement des événements passés…':'Les événements passés n’ont pas pu être chargés.'}</p>`:''}<p class="tdz-calendar-hint">Période et présentation mémorisées dans ce navigateur.</p></section>`;
}
