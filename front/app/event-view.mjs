import {dateBlock,timeLabel,weekdayLong,dayMonthShort,fullDateLabel} from '../dates.mjs';
import {durationLabel,eventMinutes} from '../../shared/duration.mjs';
import {app,state,esc,button,canManage,isAdmin,can,canEditRace,officialBadge,circuitLabel,eventTypeBadge,schedulePendingBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace} from './registration.mjs';
import {renderPilots} from './crews.mjs';
import {isSolo,accessBadge,soloRoundsLabel,soloFill,soloEntryBlock,myWaitlistPosition,renderSoloEntries,soloCategoriesSummary} from './solo.mjs';
import {renderHome,raceDateBlock,raceStarts} from './home-view.mjs';
import {planningDays,renderPlanning,syncPlanning} from './planning.mjs';

function canCreateCrewOnDeparture(departure){
  if(!state.user||departure.startsAt<=Date.now())return false;
  if(can('manage_registrations'))return true;
  if(!can('endurance'))return false;
  const assigned=new Set((departure.crews||[]).flatMap(crew=>crew.registrationIds||[]));
  return (departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'&&!assigned.has(reg.id));
}

// Where the pilot stands on this start, shown in its title line: their crew, or their categories.
function myDepartureBadge(departure){
  const regs=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
  if(!regs.length)return '';
  for(const reg of regs){
    const crew=(departure.crews||[]).find(item=>(item.registrationIds||[]).includes(reg.id));
    if(crew)return `<span class="departure-mine-badge is-crew">✓ Équipage ${esc(crew.name)} · ${esc(reg.category)}</span>`;
  }
  return `<span class="departure-mine-badge">✓ Inscrit · ${esc(regs.map(reg=>reg.category).join(' / '))}</span>`;
}

// Solo race: the start keeps its registration window, but lists participants instead of crews.
function renderSoloDeparture(event,departure,open){
  const locked=departure.startsAt<=Date.now(),own=ownRegistration(departure),editorOpen=state.registrationOpen.has(departure.id);
  const blocked=soloEntryBlock(event),waiting=myWaitlistPosition(departure);
  const main=own?button('my-registration','Modifier mon inscription',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')
    :blocked?`<span class="solo-blocked">${esc(blocked)}</span>`
    :button('my-registration','Je participe',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle');
  const other=can('manage_registrations')?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot" data-tip="Inscris un coéquipier ou un autre pilote de ta communauté à sa place."`,'link-button ux-summary-registration-other'):'';
  const actions=locked?'':`<span class="ux-summary-registration-actions">${main}${other}</span>`;
  const mine=own?`<span class="departure-mine-badge${waiting?' is-waiting':''}">${waiting?`Liste d’attente · ${waiting}${waiting===1?'er':'e'}`:'✓ Inscrit'}</span>`:'';
  return `<details class="departure-fold solo-departure${mine?' is-mine':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">01</span><span class="fold-date">${dateBlock(departure.startsAt,{compact:true})}<span class="fold-date-text"><strong class="ux-departure-title">Départ ${esc(timeLabel(departure.time))}</strong>${locked?'<span class="ux-departure-date">Départ passé</span>':''}${mine}</span></span><span class="fold-meta">${soloFill(event,departure)}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont fermées.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${renderSoloEntries(event,departure)}</section></div></details>`;
}

// Quick actions of a start in the planning, as small squares with an icon and a +: « Inscription » (me, me in
// another category, another pilot: one menu, or the only choice straight away) and « Créer un équipage ».
const QUICK_ICON=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
// A pilot (entry) or a group of three (crew), each with a small « + » drawn in the same line.
const ICON_REGISTER=QUICK_ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4M16 19h6M19 16v6');
const ICON_CREW=QUICK_ICON('M10 13a2 2 0 1 0 4 0a2 2 0 0 0-4 0M8 21v-1a2 2 0 0 1 2-2h3M15 5a2 2 0 1 0 4 0a2 2 0 0 0-4 0M17 10h2a2 2 0 0 1 2 2v1M5 5a2 2 0 1 0 4 0a2 2 0 0 0-4 0M3 13v-1a2 2 0 0 1 2-2h2M16 19h6M19 16v6');
function quickActions(event,departure){
  if(departure.startsAt<=Date.now()||!state.user)return '';
  const own=ownRegistration(departure),mine=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
  const assigned=(departure.crews||[]).some(crew=>(crew.registrationIds||[]).some(id=>mine.some(reg=>reg.id===id)));
  const items=[];
  if(own||can('endurance'))items.push({action:'my-registration',label:own?'Modifier mon inscription':'M’inscrire',extra:''});
  if(own&&!assigned&&event.categories.some(category=>!mine.some(reg=>reg.category===category)))items.push({action:'new-registration',label:'M’inscrire dans une autre catégorie',extra:`data-mode="category" data-registration="${own.id}"`});
  if(can('manage_registrations'))items.push({action:'new-registration',label:'Inscrire un autre pilote',extra:'data-mode="pilot"'});
  // Closed start: the icon alone (its name in the bubble); opened start: the icon and its name.
  const square=(icon,tip,attrs,label=tip)=>`<button type="button" class="planning-quick-button" ${attrs} data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="planning-quick-icon">${icon}</span><span class="planning-quick-label">${esc(label)}</span></button>`;
  const register=!items.length?'':items.length===1?square(ICON_REGISTER,items[0].label,`data-action="${items[0].action}" data-departure="${departure.id}" ${items[0].extra}`,'Inscription')
    :`<span class="planning-quick-menu-wrap">${square(ICON_REGISTER,'Inscription','data-action="quick-menu" aria-haspopup="menu" aria-expanded="false"')}<span class="planning-quick-menu" role="menu" hidden>${items.map(item=>`<button type="button" role="menuitem" class="planning-quick-item" data-action="${item.action}" data-departure="${departure.id}" ${item.extra}>${esc(item.label)}</button>`).join('')}</span></span>`;
  const crewLabel=can('manage_registrations')?'Créer un équipage':'Créer mon équipage';
  const crew=canCreateCrewOnDeparture(departure)?square(ICON_CREW,crewLabel,`data-crew-builder-open data-departure="${departure.id}"`):'';
  return register||crew?`<span class="planning-quick">${register}${crew}</span>`:'';
}

// Buttons of a start (enter, enter another pilot, create a crew) and what an opened start shows.
function departureActions(event,departure){
  if(departure.startsAt<=Date.now())return '';
  const own=ownRegistration(departure),canCreateCrew=canCreateCrewOnDeparture(departure);
  const createCrewAction=canCreateCrew?`<button type="button" class="link-button ux-summary-create-crew" data-crew-builder-open data-departure="${departure.id}" data-tip="Tu en deviens le responsable : tu choisis la voiture, tu gères les pilotes et tu le verrouilles quand il est complet.">${esc(can('manage_registrations')?'Créer un équipage':'Créer mon équipage')}</button>`:'';
  return `<span class="ux-summary-registration-actions${canCreateCrew?' is-three-actions':''}">${own||can('endurance')?button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle'):''}${can('manage_registrations')?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'link-button ux-summary-registration-other'):''}${createCrewAction}</span>`;
}
function departureFoldBody(event,departure){
  const locked=departure.startsAt<=Date.now(),editorOpen=state.registrationOpen.has(departure.id);
  const participation=renderPilots(event,departure);
  return `<div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les équipages restent consultables ci-dessous.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${participation}</section></div>`;
}

export function renderDeparturePanel(event,departure,index,open=false,{isPast=false}={}){
  if(isSolo(event))return renderSoloDeparture(event,departure,true);
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability);
  const mine=myDepartureBadge(departure);
  return `<details class="departure-fold${isPast?' is-past':''}${mine?' is-mine':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date">${dateBlock(departure.startsAt,{compact:true})}<span class="fold-date-text"><strong class="ux-departure-title">Départ ${esc(timeLabel(departure.time))}</strong>${locked?'<span class="ux-departure-date">Départ passé</span>':''}${mine}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span>${departureActions(event,departure)}</summary>${departureFoldBody(event,departure)}</details>`;
}

function renderPastDepartures(event,items){
  if(!items.length)return'';
  return `<details class="past-departures-fold"><summary><span>Départs passés</span><small>${items.length} départ${items.length>1?'s':''}</small></summary><div class="past-departures-list">${items.map(({departure,index})=>renderDeparturePanel(event,departure,index,false,{isPast:true})).join('')}</div></details>`;
}

export function renderEvent(message=''){
  state.page='event';state.eventSection='race';const event=state.events.find(item=>item.id===state.currentEventId);if(!event){renderHome('Cet événement n’est plus disponible.');return;}
  const now=Date.now();
  const ordered=(event.departures||[]).map((departure,index)=>({departure,index})).sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  const future=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)>now),past=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)<=now),undated=ordered.filter(item=>!Number.isFinite(Number(item.departure.startsAt)));
  const next=future[0]?.departure||null;
  // Race actions live in the header, same hierarchy as crews: sharing as a link, editing as a
  // secondary button, deletion as a discreet red link (it still asks for confirmation).
  const trash='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const eventActions=`<span class="race-header-actions">${button('share-event','Copier le lien de la course',`data-id="${event.id}"`,'link-button')}${canEditRace(event)?button('edit-event','Modifier l’événement',`data-id="${event.id}"`,'secondary-button'):''}${state.manager&&!event.official&&!isSolo(event)?button('make-official','Rendre officielle',`data-id="${event.id}" data-tip="Commune à toutes les communautés : chacune pourra s’y inscrire."`,'link-button'):''}${canEditRace(event)?button('delete-event',`${trash}<span>Supprimer l’événement</span>`,`data-id="${event.id}"`,'danger-link'):''}</span>`;
  const visible=[...future,...undated];
  const upcoming=visible.map(({departure,index})=>renderDeparturePanel(event,departure,index,departure.id===state.selectedDepartureId||state.registrationOpen.has(departure.id))).join('');
  // A race over several days shows its starts as a planning, one column per day.
  const days=planningDays(event);
  // The planning shows the crews and pilots of every start: no category summary above it, and the race
  // actions sit on its heading line.
  const starts=days.length?renderPlanning(event,days,departure=>departureFoldBody(event,departure),{actions:eventActions,quick:departure=>quickActions(event,departure)})
    :`<section class="departure-accordion" aria-label="Départs de la course">${upcoming}${renderPastDepartures(event,past)}</section>`;
  const myStart=days.length?days.flatMap(day=>day.items).map(item=>item.departure).find(departure=>Number(departure.startsAt)>now&&(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable')):null;
  const myStartLink=myStart?`<span class="race-my-start"><small>Ton départ</small>${button('goto-departure',`${esc(weekdayLong(myStart.startsAt))} ${esc(dayMonthShort(myStart.startsAt))} · Départ ${esc(timeLabel(myStart.time))}`,`data-departure="${myStart.id}"`,'secondary-button')}</span>`:'';
  const countdownCopy=next?`Prochain départ dans <strong data-tip="${esc(fullDateLabel(next.startsAt))} à ${esc(timeLabel(next.time))}" data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:undated.length?'Dates à confirmer':'Tous les départs ont eu lieu';
  app.eventViewData={eventId:event.id,events:state.events,message};
  app.innerHTML=`<div class="event-header event-header-compact race-header event-type-${event.eventType||'private'}${isSolo(event)?` is-solo-${event.access||'open'}`:''}" data-event-id="${event.id}"><div class="race-card-top">${raceDateBlock(event,!next&&!undated.length)}<div class="race-head"><h1 class="event-title event-name">${esc(event.name)}</h1><span class="race-meta">${isSolo(event)?soloRoundsLabel(event):`${esc(circuitLabel(event.circuit))} · ${durationLabel(eventMinutes(event))}`}</span><span class="race-badges">${officialBadge(event)}${isSolo(event)?accessBadge(event):eventTypeBadge(event.eventType)}${schedulePendingBadge(event)}</span><span class="event-header-countdown">${countdownCopy}</span></div>${myStartLink}${circuitVisual(event.circuit)}</div>${days.length?'':`${raceStarts(event,!next&&!undated.length)}<div class="race-header-footer">${isSolo(event)?soloCategoriesSummary(event):`<div class="event-header-stats event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div>`}${eventActions}</div>`}</div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${starts}`;
  if(days.length)syncPlanning(app);
  notifyRender();
}
