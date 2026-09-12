import {app,state,esc,button,canManage,isAdmin,eventTypeBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,dateLabel,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace} from './registration.mjs';
import {renderCrews} from './crews.mjs?v=7-tabs-compact';
import {renderHome,showRecoveryLink} from './home-view.mjs';

function canCreateCrewOnDeparture(departure){
  if(!state.user||departure.startsAt<=Date.now())return false;
  if(canManage())return true;
  const assigned=new Set((departure.crews||[]).flatMap(crew=>crew.registrationIds||[]));
  return (departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'&&!assigned.has(reg.id));
}

export function renderDeparturePanel(event,departure,index,open=false){
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability),own=ownRegistration(departure),editorOpen=state.registrationOpen.has(departure.id);
  const actions=locked?'':`<span class="ux-summary-registration-actions">${button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')}${state.user?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'secondary-button ux-summary-registration-other'):''}</span>`;
  return `<details class="departure-fold" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong class="ux-departure-title">Départ ${esc(departure.time)}</strong><span class="ux-departure-date">${esc(dateLabel(departure))}${locked?' · Départ passé':''}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les pilotes et équipages restent consultables dans l’onglet Équipages.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}</div></details>`;
}

function renderCrewPage(event,nextDeparture){
  return `<section class="departure-accordion crew-page-accordion" aria-label="Équipages de la course">${event.departures.map((departure,index)=>{
    const locked=departure.startsAt<=Date.now();
    const create=canCreateCrewOnDeparture(departure)?`<button type="button" class="primary-button crew-builder-open crew-page-create" data-crew-builder-open data-departure="${departure.id}">${canManage()?'Créer un équipage':'Créer mon équipage'}</button>`:'';
    return `<details class="departure-fold" id="crew-departure-${departure.id}" ${departure.id===nextDeparture?.id||departure.id===state.selectedDepartureId?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong class="ux-departure-title">Départ ${esc(departure.time)}</strong><span class="ux-departure-date">${esc(dateLabel(departure))}${locked?' · Départ passé':''}</span></span><span class="fold-meta">${pilotCount(departure.availability||[])} pilote${pilotCount(departure.availability||[])>1?'s':''} · ${(departure.crews||[]).length} équipage${(departure.crews||[]).length>1?'s':''}</span></summary><div class="departure-fold-body"><section class="fold-section crew-only-section">${create?`<div class="crew-page-actions">${create}</div>`:''}${renderCrews(event,departure)}</section></div></details>`;
  }).join('')}</section>`;
}

export function renderEvent(message=''){
  state.page='event';const event=state.events.find(item=>item.id===state.currentEventId);if(!event){renderHome('Cet événement n’est plus disponible.');return;}
  if(!['race','crews'].includes(state.eventSection))state.eventSection='race';
  const next=event.departures.find(d=>d.startsAt>Date.now())||event.departures[0],totalPilots=pilotCount(event.departures.flatMap(d=>d.availability)),totalCrews=event.departures.reduce((sum,d)=>sum+(d.crews||[]).length,0);
  const eventActions=`<span class="event-toolbar-main">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</span>`;
  app.eventViewData={eventId:event.id,events:state.events,message};
  const tabs=`<nav class="event-section-tabs" aria-label="Sections de l’événement">${button('event-section','Course',`data-section="race" aria-pressed="${state.eventSection==='race'}"`,'event-section-tab')}${button('event-section','Équipages',`data-section="crews" aria-pressed="${state.eventSection==='crews'}"`,'event-section-tab')}</nav>`;
  const content=state.eventSection==='crews'?renderCrewPage(event,next):`<section class="departure-accordion" aria-label="Départs de la course">${event.departures.map((departure,index)=>renderDeparturePanel(event,departure,index,departure.id===next?.id||departure.id===state.selectedDepartureId)).join('')}</section>`;
  app.innerHTML=`<div class="event-header event-header-compact event-type-${event.eventType||'private'}" data-event-id="${event.id}"><div class="event-heading-line"><div class="event-heading-copy"><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)}</p><span class="event-header-countdown">${next?.startsAt>Date.now()?`Prochain départ dans <strong data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:'Tous les départs ont eu lieu'}</span></div>${circuitVisual(event.circuit)}</div><div class="event-header-summary"><div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div><div class="event-header-stats"><span><strong>${event.durationHours||6} h</strong><small>durée</small></span><span><strong>${event.departures.length}</strong><small>départ${event.departures.length>1?'s':''}</small></span><span><strong>${totalPilots}</strong><small>pilote${totalPilots>1?'s':''}</small></span><span><strong>${totalCrews}</strong><small>équipage${totalCrews>1?'s':''}</small></span></div></div></div><div class="toolbar event-actions-toolbar">${eventActions}</div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${tabs}${content}`;
  showRecoveryLink();notifyRender();
}
