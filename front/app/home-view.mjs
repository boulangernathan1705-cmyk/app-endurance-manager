import {app,nav,state,activeGame,esc,button,canManage,circuitLabel,eventTypeBadge,schedulePendingBadge,eventBadge,eventCategoryCount,circuitVisual,logo,dateLabel,countdown,groupEvents,notifyRender,notifyNav} from './core.mjs';
import {dateBlock,dayLabel,timeLabel} from '../dates.mjs';
import {isSolo,accessBadge,soloRoundsLabel,soloFill,ANY_CATEGORY} from './solo.mjs';

const dayKeyFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
function datedDepartures(event){return (event.departures||[]).filter(d=>Number.isFinite(Number(d.startsAt))).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));}
// Date block of a race card: the day of the next start (the last one for archived races); times are listed below.
export function raceDateBlock(event,archived){
  const dated=datedDepartures(event),upcoming=dated.filter(d=>Number(d.startsAt)>Date.now());
  const shown=archived||!upcoming.length?dated.at(-1):upcoming[0];
  return dateBlock(shown?.startsAt);
}
// Start times grouped by day ("sam. 26 · 05h 12h 16h"), all shown alike.
export function raceStarts(event,archived){
  const dated=datedDepartures(event),now=Date.now();
  const shown=archived?dated:dated.filter(d=>Number(d.startsAt)>now);
  if(!shown.length)return '';
  const days=new Map();
  for(const departure of shown){const key=dayKeyFormatter.format(new Date(Number(departure.startsAt)));if(!days.has(key))days.set(key,[]);days.get(key).push(departure);}
  const entries=[...days.values()],visible=entries.slice(0,3),hidden=entries.length-visible.length;
  const time=departure=>`<span class="race-start">${esc(timeLabel(departure.time))}</span>`;
  return `<span class="race-starts">${visible.map(list=>`<span class="race-day"><em>${esc(dayLabel(list[0].startsAt))}</em>${list.map(time).join('')}</span>`).join('')}${hidden>0?`<span class="race-day race-more">+ ${hidden} jour${hidden>1?'s':''}</span>`:''}</span>`;
}
// Where the current pilot stands on a race: their next start with a registration, and their crew if any.
export function mySituation(event,{includePast=false}={}){
  const now=Date.now();
  const departures=[...(event.departures||[])].filter(d=>includePast||Number(d.startsAt)>now).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  for(const departure of departures){
    const regs=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
    if(!regs.length)continue;
    for(const reg of regs){
      const crew=(departure.crews||[]).find(item=>(item.registrationIds||[]).includes(reg.id));
      if(crew)return {departure,reg,crew,mates:(crew.registrationIds||[]).map(id=>departure.availability.find(item=>item.id===id)).filter(item=>item&&item.id!==reg.id).map(item=>item.name)};
    }
    return {departure,reg:regs[0],crew:null,mates:[],categories:regs.map(reg=>reg.category).filter(Boolean)};
  }
  return null;
}
function situationBadge(event,archived){
  const mine=mySituation(event,{includePast:archived});
  if(!mine)return '';
  const when=(event.departures||[]).length>1?` · ${esc(timeLabel(mine.departure.time))}`:'';
  if(isSolo(event)){
    const categoryName=mine.reg.category===ANY_CATEGORY?'Peu importe':mine.reg.category;
    return mine.reg.waitlistPosition
      ?`<span class="event-situation is-waiting">Liste d’attente · ${mine.reg.waitlistPosition}${mine.reg.waitlistPosition===1?'er':'e'}</span>`
      :`<span class="event-situation is-crew">✓ Inscrit · ${esc(categoryName)}</span>`;
  }
  return mine.crew
    ?`<span class="event-situation is-crew">✓ Équipage ${esc(mine.crew.name)} · ${esc(mine.reg.category)}${when}</span>`
    :`<span class="event-situation is-registered">Inscrit · ${esc((mine.categories||[mine.reg.category]).join(' / '))}${when} · sans équipage</span>`;
}
function hasRegisteredPilot(departure){return (departure?.availability||[]).some(reg=>reg.status!=='unavailable');}
function registeredRaceStatus(event,now=Date.now()){
  const departures=[...(event.departures||[])].filter(d=>Number.isFinite(Number(d.startsAt))&&hasRegisteredPilot(d)).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt));
  return {next:departures.find(d=>Number(d.startsAt)>now)||null};
}
const gameLink=(game,full,short)=>`<a class="nav-game-switcher-button nav-game-switcher-${game}" href="/${game}/"${activeGame===game?' aria-current="page"':''}><span class="nav-full">${full}</span><span class="nav-short">${short}</span></a>`;
// Two calendars, Endurance and Solo races, plus My entries. On a race page the tab of its format is active.
function activeList(page){
  if(page==='event'){const event=state.events.find(item=>item.id===state.currentEventId);return event?.format==='solo'?'solo':'endurance';}
  return state.listFormat;
}
function syncNavSection(page){for(const item of nav.querySelectorAll('.nav-section-button')){const current=item.dataset.action==='my-entries'?page==='my-entries':page!=='my-entries'&&item.dataset.list===activeList(page);item.setAttribute('aria-current',current?'page':'false');}}
export function renderNav(){nav.innerHTML=`<div class="nav-game-switcher" role="group" aria-label="Changer de simulateur">${gameLink('lmu','Le Mans Ultimate','LMU')}${gameLink('iracing','iRacing','iRacing')}</div><div class="nav-sections" role="group" aria-label="Sections">${button('home','Endurance','data-list="endurance"','nav-section-button')}${button('home',esc(state.soloLabel),'data-list="solo"','nav-section-button')}${button('my-entries','Mes inscriptions','','nav-section-button')}</div>`;syncNavSection(state.page);notifyNav();}
document.addEventListener('endurance:render',event=>syncNavSection(event.detail?.page));
export function showRecoveryLink(){if(!state.recoveryLink)return;app.insertAdjacentHTML('afterbegin',`<section class="recovery-panel"><label for="personalLink">Ton lien personnel pour retrouver et modifier tes inscriptions sans compte</label><input id="personalLink" readonly value="${esc(state.recoveryLink)}"><p>Conserve ce lien et garde-le privé.</p>${button('copy-link','Copier le lien')}${button('hide-link','Masquer')}</section>`);}
function eventCard({event,next,archived,end}){
  const registered=registeredRaceStatus(event);const displayNext=registered.next;
  const untilNext=displayNext?displayNext.startsAt-Date.now():Infinity,statusClass=archived?'finished':displayNext&&untilNext<=3600000?'soon':'upcoming';
  const status=archived?`Tous les départs ont eu lieu · ${esc(dateLabel({startsAt:end}))}`:displayNext?`Prochain départ avec pilotes : ${esc(dateLabel(displayNext))} à ${esc(timeLabel(displayNext.time))} · <span data-countdown="${displayNext.startsAt}">${countdown(displayNext.startsAt)}</span>`:next?'Aucun départ à venir avec pilote inscrit':'Dates à confirmer';
  const situation=`${schedulePendingBadge(event)}${situationBadge(event,archived)}`;
  return `<button class="event-card event-card-harmonized race-card event-type-${event.eventType||'private'}${isSolo(event)?` is-solo is-solo-${event.access||'open'}`:''} ${archived?'archived':''}" data-action="open" data-id="${event.id}"><span class="event-card-body race-card-body"><span class="race-card-content"><span class="race-card-top">${raceDateBlock(event,archived)}<span class="race-head"><span class="event-name">${esc(event.name)}</span><span class="race-meta">${isSolo(event)?soloRoundsLabel(event):`${esc(circuitLabel(event.circuit))} · ${Number(event.durationHours)||6} h`}</span>${isSolo(event)?accessBadge(event):eventTypeBadge(event.eventType)}</span></span>${raceStarts(event,archived)}${situation?`<span class="race-situation">${situation}</span>`:''}<span class="race-fill">${isSolo(event)?`${soloFill(event)}<span class="solo-card-categories">${event.categories.map(category=>logo(category)).join('')}</span>`:`<span class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>`}</span></span><span class="race-card-circuit" aria-hidden="true">${circuitVisual(event.circuit,true)}</span><span class="event-card-status"><span class="event-countdown ${statusClass}" ${displayNext&&!archived?`data-status-time="${displayNext.startsAt}"`:''}>${status}</span></span></span></button>`;
}
export function renderHome(message=''){state.page='home';state.currentEventId=null;state.editingEvent=null;state.drafts={};state.registrationOpen.clear();const solo=state.listFormat==='solo';const listEvents=state.events.filter(event=>(event.format==='solo')===solo);const hasMine=listEvents.some(event=>mySituation(event));if(state.eventFilter==='mine'&&!hasMine)state.eventFilter='upcoming';const mineOnly=state.eventFilter==='mine';const groups=groupEvents(mineOnly?listEvents.filter(event=>mySituation(event)):listEvents,mineOnly?'upcoming':state.eventFilter);const filters=`<div class="event-filter" role="group" aria-label="Filtrer les événements">${button('event-filter','À venir',`data-filter="upcoming" aria-pressed="${state.eventFilter==='upcoming'}"`,'event-filter-button')}${hasMine?button('event-filter','Mes courses',`data-filter="mine" aria-pressed="${state.eventFilter==='mine'}"`,'event-filter-button'):''}${button('event-filter','Archivés',`data-filter="archived" aria-pressed="${state.eventFilter==='archived'}"`,'event-filter-button')}</div>`;app.innerHTML=`<div class="page-head"><h1 class="page-title">${solo?esc(state.soloLabel).toUpperCase():'ENDURANCE'}</h1>${filters}${canManage()?`<div class="home-create-event">${button('create',solo?'Ajouter une course solo':'Ajouter un événement',`data-format="${solo?'solo':'endurance'}"`,'primary-button')}</div>`:''}</div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${!state.user&&state.events.some(event=>event.departures.some(departure=>departure.availability.some(reg=>reg.mine||reg.managed)))?`<div class="toolbar home-toolbar">${button('guest-link','Mon lien personnel')}</div>`:''}${groups.length?`<div class="event-agenda">${groups.map(group=>`<section class="event-period" aria-labelledby="period-${group.key}"><h2 class="event-period-heading" id="period-${group.key}"><span>${esc(group.label)}</span><small>${group.items.length} événement${group.items.length>1?'s':''}</small></h2><div class="event-list">${group.items.map(eventCard).join('')}</div></section>`).join('')}</div>`:`<div class="empty">${state.eventFilter==='upcoming'?'Aucun événement à venir.':'Aucun événement archivé.'}</div>`}`;showRecoveryLink();notifyRender();}
