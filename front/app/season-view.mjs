import {state,esc,button,loadArchive,showError,can,api} from './core.mjs';
import {monthKey,seasonMonths,monthDays} from '../season-calendar.mjs';
import {currentSeason,validSeason} from '../../shared/season.mjs';
import {raceMatches,raceFilterView} from '../race-filters.mjs';
import {weekEventKind} from './week-view.mjs';
import {eventCircuitName} from './solo.mjs';
import {SIMS,simForEvent} from '../../shared/catalog.mjs';
import {isStream,streamDetails,streamSpan} from '../../shared/stream.mjs';
import {durationLabel} from '../../shared/duration.mjs';
import {parisDay} from '../week-days.mjs';

const DAY=86400000;
const monthName=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});
const dayName=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const hour=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});
const shortMonthName=new Intl.DateTimeFormat('fr-FR',{month:'short',timeZone:'UTC'});
const shortLabel=key=>shortMonthName.format(new Date(key+'-01T12:00:00Z'));
const label=key=>monthName.format(new Date(key+'-01T12:00:00Z'));
const storageKey=()=>`em_tdz_season_view:${state.community?.id||''}:${state.user?.id||''}`;
let archiveRequest=null;
export function seasonSettings(){
  const key=storageKey(),start=validSeason(state.communitySeason?.start)?state.communitySeason.start:currentSeason();
  if(state.tdzSeason?.key!==key||state.tdzSeason.start!==start){
    let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    state.tdzSeason={key,start,view:saved?.view==='season'?'season':'month',expanded:saved?.expanded===true,month:Math.max(0,seasonMonths(start).indexOf(monthKey(Date.now())))};
  }
  return state.tdzSeason;
}
export function changeSeason(field,value){
  const settings=seasonSettings();
  if(field==='expanded')settings.expanded=!settings.expanded;
  if(field==='view')settings.view=value==='season'?'season':'month';
  if(field==='month')settings.month=Math.max(0,Math.min(2,Number(value)||0));
  if(field==='today'){settings.month=Math.max(0,seasonMonths(settings.start).indexOf(monthKey(Date.now())));settings.view='month';}
  try{localStorage.setItem(settings.key,JSON.stringify({view:settings.view,expanded:settings.expanded}));}catch{}
}
export async function saveSeason(){
  const year=document.querySelector('[data-season-year]'),quarter=document.querySelector('[data-season-quarter]');
  if(!year?.reportValidity()||!quarter)return;
  state.communitySeason=await api('/api/community/season','PUT',{start:`${year.value}-${quarter.value}`,version:state.communitySeason?.version||0});
  state.tdzSeason=null;
}
function seasonCard(item,now){
  const {event,starts,mine,endsAt,startsAt}=item,stream=isStream(event),sim=simForEvent(event);
  const kind=weekEventKind(event).label,simName=SIMS.find(s=>s.id===sim)?.short||'';
  const rounds=event.rounds?.length?event.rounds:[{circuit:event.circuit,durationMinutes:event.durationMinutes}];
  const circuits=[...new Set(rounds.map(r=>eventCircuitName(event,r.circuit)))].join(' / ');
  const duration=rounds.map(r=>Number(r.durationMinutes)>0?durationLabel(r.durationMinutes):'Durée à préciser').join(' + ');
  const times=starts.map(s=>s.departure.hideClock?'À définir':hour.format(s.startsAt).replace(':','h').replace(/h00$/,'h')).join(' · ');
  const info=stream?streamDetails(event):event.details||{},streamTime=streamSpan(info.streamTime,info.streamEnd);
  const past=(endsAt||startsAt)<now;
  const title=stream?event.name:circuits;
  const compactTitle=stream?title:rounds.map(r=>eventCircuitName(event,r.circuit).replace(/^Circuit (?:de |du |des |d[’'])/i,'')).join(' / ');
  const full=[event.name,simName,kind,stream?'':circuits,times,stream?'':duration,streamTime&&`Stream ${streamTime}`,mine&&'Inscrit',past&&'Terminé'].filter(Boolean).join(' · ');
  return `<button type="button" class="tdz-race sim-${esc(sim)}${past?' is-past':''}" data-action="open" data-id="${esc(event.id)}" aria-label="${esc(full)}" title="${esc(full)}"><span class="tdz-race-kind">${stream?'Stream':`<span>${esc(simName)}</span><span class="tdz-kind-separator"> · </span><span>${esc(kind)}</span>`}</span><strong class="tdz-race-circuit"><span class="tdz-circuit-full">${esc(title)}</span><span class="tdz-circuit-short">${esc(compactTitle)}</span></strong>${!stream&&event.name!==circuits?`<span class="tdz-race-name">${esc(event.name)}</span>`:''}<span class="tdz-race-schedule"><span class="tdz-race-time">${esc(times)}</span>${!stream?`<span class="tdz-race-duration" title="Durée de course">${esc(duration)}</span>`:''}</span>${streamTime?`<span class="tdz-race-stream"><span>Stream</span><span class="tdz-stream-time"> · ${esc(streamTime)}</span></span>`:''}${mine?'<span class="tdz-race-mine">✓ Inscrit</span>':''}${past?'<span class="tdz-race-status">Terminé</span>':''}</button>`;
}
export function renderSeasonCalendar(events,filters,rerender,extra={}){
  const settings=seasonSettings(),months=seasonMonths(settings.start),now=Date.now();
  state.tdzCalendarExpanded=settings.expanded;
  if(!state.archiveLoaded&&!archiveRequest){
    archiveRequest=loadArchive().then(()=>{if(state.page==='home'&&state.listFormat==='solo'&&state.eventTdz)rerender();}).catch(showError).finally(()=>{archiveRequest=null;});
  }
  const matching=events.filter(event=>raceMatches(event,filters,{communityId:state.community?.id,archived:true})&&(state.eventFilter!=='mine'||(event.departures||[]).some(d=>(d.availability||[]).some(r=>r.mine&&r.status!=='unavailable')))).map(event=>raceFilterView(event,filters,{communityId:state.community?.id}));
  const cards=day=>day.items.map(item=>seasonCard(item,now)).join('');
  const monthContent=(key,full)=>{
    const days=monthDays(matching,key),count=days.reduce((n,day)=>n+day.items.length,0);
    if(full)return `<section class="tdz-season-month" aria-label="${esc(label(key))}"><h2>${esc(label(key))}<small>${count} événement${count>1?'s':''}</small></h2>${days.filter(day=>day.inMonth&&day.items.length).map(day=>`<section class="tdz-season-date"><h3>${esc(dayName.format(new Date(day.day*DAY)))}</h3><div class="tdz-season-cards">${cards(day)}</div></section>`).join('')||'<p class="empty">Aucun événement programmé.</p>'}</section>`;
    return `<section class="tdz-month-view" aria-label="${esc(label(key))}"><h2 class="tdz-calendar-title">${esc(label(key))}<small>${count} événement${count>1?'s':''}</small></h2><div class="tdz-month-grid" style="--tdz-weeks:${days.length/7}">${['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(name=>`<div class="tdz-weekday"><span class="tdz-weekday-full">${name}</span><span class="tdz-weekday-short" aria-hidden="true">${name.slice(0,1)}</span></div>`).join('')}${days.map(day=>`<section class="tdz-month-day${day.inMonth?'':' is-outside'}${day.day===parisDay(now)?' is-today':''}" aria-label="${esc(dayName.format(new Date(day.day*DAY)))}" ${day.inMonth?'':'aria-hidden="true"'}><h3><span class="tdz-day-number"${day.day===parisDay(now)?' aria-current="date"':''}>${new Date(day.day*DAY).getUTCDate()}</span></h3><div class="tdz-day-cards">${cards(day)}</div></section>`).join('')}</div><div class="tdz-mobile-agenda" aria-label="Événements du mois">${days.filter(day=>day.inMonth&&day.items.length).map(day=>`<section class="tdz-mobile-agenda-day"><h3>${esc(dayName.format(new Date(day.day*DAY)))}</h3><div class="tdz-mobile-agenda-cards">${cards(day)}</div></section>`).join('')}</div>${count?'':'<p class="empty">Aucun événement programmé ce mois-ci.</p>'}</section>`;
  };
  const undated=matching.filter(event=>!(event.departures||[]).some(d=>d.startsAt!==null&&d.startsAt!==''&&Number.isFinite(Number(d.startsAt))));
  const editor=can('create_race')?`<details class="tdz-season-editor"><summary>Définir la saison</summary><div class="tdz-period-fields"><label>Année<input type="number" min="2000" max="2100" required data-season-year value="${settings.start.slice(0,4)}"></label><label>Trimestre<select data-season-quarter>${[['01','Janvier – mars'],['04','Avril – juin'],['07','Juillet – septembre'],['10','Octobre – décembre']].map(([value,text])=>`<option value="${value}"${settings.start.endsWith(value)?' selected':''}>${text}</option>`).join('')}</select></label>${button('tdz-season-save','Enregistrer pour tous','','secondary-button')}</div></details>`:'';
  const calendar=`<section class="tdz-calendar" aria-label="Calendrier de saison"><div class="tdz-season-toolbar"><strong class="tdz-season-label">Saison ${Math.floor((Number(settings.start.slice(5))-1)/3)+1} · ${settings.start.slice(0,4)}<small>${esc(label(months[0]))} → ${esc(label(months[2]))}</small></strong>${editor}${extra.quick||''}<div class="event-filter" role="group" aria-label="Présentation du calendrier">${button('tdz-season','Mois',`data-field="view" data-value="month" aria-pressed="${settings.view==='month'}"`,'event-filter-button')}${button('tdz-season','Toute la saison',`data-field="view" data-value="season" aria-pressed="${settings.view==='season'}"`,'event-filter-button')}</div>${button('tdz-calendar-expand',state.tdzCalendarExpanded?'Réduire':'Plein écran',`aria-label="${state.tdzCalendarExpanded?'Quitter le plein écran':'Afficher le calendrier en plein écran'}"`,'secondary-button tdz-expand')}</div>${extra.panel||''}${settings.view==='month'?`<div class="tdz-month-tabs" role="group" aria-label="Mois de la saison">${button('tdz-season','‹',`data-field="month" data-value="${settings.month-1}" aria-label="Mois précédent" ${settings.month===0?'disabled':''}`,'secondary-button')}${months.map((key,index)=>button('tdz-season',esc(shortLabel(key)),`data-field="month" data-value="${index}" title="${esc(label(key))}" aria-pressed="${settings.month===index}"`,'secondary-button')).join('')}${button('tdz-season','›',`data-field="month" data-value="${settings.month+1}" aria-label="Mois suivant" ${settings.month===2?'disabled':''}`,'secondary-button')}${months.includes(monthKey(now))?button('tdz-season','Aujourd’hui','data-field="today"','secondary-button'):''}</div>${monthContent(months[settings.month],false)}`:`<div class="tdz-season-overview">${months.map(key=>monthContent(key,true)).join('')}</div>`}${undated.length?`<section class="tdz-undated"><h2>Dates à confirmer</h2>${undated.map(event=>button('open',esc(event.name),`data-id="${esc(event.id)}"`,'secondary-button')).join('')}</section>`:''}${!state.archiveLoaded?`<p class="tdz-calendar-hint">${archiveRequest?'Chargement des événements passés…':'Les événements passés n’ont pas pu être chargés.'}</p>`:''}<p class="tdz-calendar-hint">Heure de Paris · Violet : stream · Vue mémorisée</p></section>`;
  return state.tdzCalendarExpanded?`<dialog class="tdz-calendar-dialog" aria-label="Calendrier de saison en plein écran">${calendar}</dialog>`:calendar;
}
// Native dialog provides keyboard focus containment and Escape on desktop and mobile.
document.addEventListener('endurance:render',()=>{
  const dialog=document.querySelector('.tdz-calendar-dialog');
  if(!dialog){if(!document.querySelector('.tdz-calendar'))state.tdzCalendarExpanded=false;return;}
  if(!dialog.open)dialog.showModal();
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.querySelector('[data-action="tdz-calendar-expand"]')?.click();},{once:true});
});
