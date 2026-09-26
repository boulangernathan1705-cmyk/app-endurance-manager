import {dateBlock,timeLabel} from '../dates.mjs';
import {app,state,esc,button,canManage,isAdmin,circuitLabel,eventTypeBadge,schedulePendingBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace} from './registration.mjs';
import {renderPilots} from './crews.mjs';
import {isSolo,accessBadge,soloRoundsLabel,soloFill,soloEntryBlock,myWaitlistPosition,renderSoloEntries,soloCategoriesSummary} from './solo.mjs';
import {renderHome,showRecoveryLink,raceDateBlock,raceStarts} from './home-view.mjs';

function canCreateCrewOnDeparture(departure){
  if(!state.user||departure.startsAt<=Date.now())return false;
  if(canManage())return true;
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
  const other=canManage()?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'link-button ux-summary-registration-other'):'';
  const actions=locked?'':`<span class="ux-summary-registration-actions">${main}${other}</span>`;
  const mine=own?`<span class="departure-mine-badge${waiting?' is-waiting':''}">${waiting?`Liste d’attente · ${waiting}${waiting===1?'er':'e'}`:'✓ Inscrit'}</span>`:'';
  return `<details class="departure-fold solo-departure${mine?' is-mine':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">01</span><span class="fold-date">${dateBlock(departure.startsAt,{compact:true})}<span class="fold-date-text"><strong class="ux-departure-title">Départ ${esc(timeLabel(departure.time))}</strong>${locked?'<span class="ux-departure-date">Départ passé</span>':''}${mine}</span></span><span class="fold-meta">${soloFill(event,departure)}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont fermées.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${renderSoloEntries(event,departure)}</section></div></details>`;
}

export function renderDeparturePanel(event,departure,index,open=false,{isPast=false}={}){
  if(isSolo(event))return renderSoloDeparture(event,departure,true);
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability),own=ownRegistration(departure),editorOpen=state.registrationOpen.has(departure.id),canCreateCrew=canCreateCrewOnDeparture(departure);
  const createCrewAction=canCreateCrew?`<button type="button" class="link-button ux-summary-create-crew" data-crew-builder-open data-departure="${departure.id}">${esc(canManage()?'Créer un équipage':'Créer mon équipage')}</button>`:'';
  const actions=locked?'':`<span class="ux-summary-registration-actions${canCreateCrew?' is-three-actions':''}">${button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')}${state.user?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'link-button ux-summary-registration-other'):''}${createCrewAction}</span>`;
  const participation=renderPilots(event,departure);
  const mine=myDepartureBadge(departure);
  return `<details class="departure-fold${isPast?' is-past':''}${mine?' is-mine':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date">${dateBlock(departure.startsAt,{compact:true})}<span class="fold-date-text"><strong class="ux-departure-title">Départ ${esc(timeLabel(departure.time))}</strong>${locked?'<span class="ux-departure-date">Départ passé</span>':''}${mine}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les équipages restent consultables ci-dessous.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${participation}</section></div></details>`;
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
  const eventActions=`<span class="race-header-actions">${button('share-event','Copier le lien de la course',`data-id="${event.id}"`,'link-button')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`,'secondary-button'):''}${isAdmin()?button('delete-event',`${trash}<span>Supprimer l’événement</span>`,`data-id="${event.id}"`,'danger-link'):''}</span>`;
  const visible=[...future,...undated];
  const upcoming=visible.map(({departure,index})=>renderDeparturePanel(event,departure,index,departure.id===state.selectedDepartureId||state.registrationOpen.has(departure.id))).join('');
  const countdownCopy=next?`Prochain départ dans <strong data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:undated.length?'Dates à confirmer':'Tous les départs ont eu lieu';
  app.eventViewData={eventId:event.id,events:state.events,message};
  app.innerHTML=`<div class="event-header event-header-compact race-header event-type-${event.eventType||'private'}${isSolo(event)?` is-solo-${event.access||'open'}`:''}" data-event-id="${event.id}"><div class="race-card-top">${raceDateBlock(event,!next&&!undated.length)}<div class="race-head"><h1 class="event-title event-name">${esc(event.name)}</h1><span class="race-meta">${isSolo(event)?soloRoundsLabel(event):`${esc(circuitLabel(event.circuit))} · ${event.durationHours||6} h`}</span><span class="race-badges">${isSolo(event)?accessBadge(event):eventTypeBadge(event.eventType)}${schedulePendingBadge(event)}</span><span class="event-header-countdown">${countdownCopy}</span></div>${circuitVisual(event.circuit)}</div>${raceStarts(event,!next&&!undated.length)}<div class="race-header-footer">${isSolo(event)?soloCategoriesSummary(event):`<div class="event-header-stats event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div>`}${eventActions}</div></div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<section class="departure-accordion" aria-label="Départs de la course">${upcoming}${renderPastDepartures(event,past)}</section>`;
  showRecoveryLink();notifyRender();
}
