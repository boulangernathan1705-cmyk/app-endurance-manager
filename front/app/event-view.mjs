import {app,state,esc,button,canManage,isAdmin,eventTypeBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,dateLabel,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace} from './registration.mjs';
import {renderPilots} from './crews.mjs?v=8-one-page-compact';
import {renderHome,showRecoveryLink} from './home-view.mjs?v=4-organizations';
import {scopeEvent,organizationContextMarkup,organizationById} from './organization-context.mjs?v=1';

function managesCurrentOrganization(){
  const organization=organizationById(state.organizations,state.selectedOrganizationId);
  return !!organization&&['owner','manager'].includes(organization.role);
}
function canCreateCrewOnDeparture(departure){
  if(!state.user||departure.startsAt<=Date.now())return false;
  if(state.selectedOrganizationId){if(managesCurrentOrganization())return true;}
  else if(canManage())return true;
  const assigned=new Set((departure.crews||[]).flatMap(crew=>crew.registrationIds||[]));
  return (departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'&&!assigned.has(reg.id));
}

export function renderDeparturePanel(event,departure,index,open=false,{isPast=false}={}){
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability),own=ownRegistration(departure),editorOpen=state.registrationOpen.has(departure.id),canCreateCrew=canCreateCrewOnDeparture(departure),contextManager=!state.selectedOrganizationId?canManage():managesCurrentOrganization();
  const createCrewAction=canCreateCrew?`<button type="button" class="secondary-button ux-summary-create-crew" data-crew-builder-open data-departure="${departure.id}">${esc(contextManager?'Créer un équipage':'Créer mon équipage')}</button>`:'';
  const actions=locked?'':`<span class="ux-summary-registration-actions${canCreateCrew?' is-three-actions':''}">${button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')}${state.user?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'secondary-button ux-summary-registration-other'):''}${createCrewAction}</span>`;
  const participation=renderPilots(event,departure);
  return `<details class="departure-fold${isPast?' is-past':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong class="ux-departure-title">Départ ${esc(departure.time)}</strong><span class="ux-departure-date">${esc(dateLabel(departure))}${locked?' · Départ passé':''}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les équipages restent consultables ci-dessous.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${participation}</section></div></details>`;
}

function renderPastDepartures(event,items){
  if(!items.length)return'';
  return `<details class="past-departures-fold"><summary><span>Départs passés</span><small>${items.length} départ${items.length>1?'s':''}</small></summary><div class="past-departures-list">${items.map(({departure,index})=>renderDeparturePanel(event,departure,index,false,{isPast:true})).join('')}</div></details>`;
}

export function renderEvent(message=''){
  state.page='event';state.eventSection='race';const rawEvent=state.events.find(item=>item.id===state.currentEventId);if(!rawEvent){renderHome('Cet événement n’est plus disponible.');return;}const event=scopeEvent(rawEvent,state.selectedOrganizationId);
  const now=Date.now();
  const ordered=(event.departures||[]).map((departure,index)=>({departure,index})).sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  const future=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)>now),past=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)<=now),undated=ordered.filter(item=>!Number.isFinite(Number(item.departure.startsAt)));
  const next=future[0]?.departure||null,totalPilots=pilotCount(event.departures.flatMap(d=>d.availability)),totalCrews=event.departures.reduce((sum,d)=>sum+(d.crews||[]).length,0);
  const eventActions=`<span class="event-toolbar-main">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</span>`;
  const visible=[...future,...undated];
  const upcoming=visible.map(({departure,index})=>renderDeparturePanel(event,departure,index,departure.id===state.selectedDepartureId||state.registrationOpen.has(departure.id))).join('');
  const countdownCopy=next?`Prochain départ dans <strong data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:undated.length?'Dates à confirmer':'Tous les départs ont eu lieu';
  app.eventViewData={eventId:event.id,events:state.events,message};
  app.innerHTML=`<div class="event-header event-header-compact event-type-${event.eventType||'private'}" data-event-id="${event.id}" data-organization-id="${esc(state.selectedOrganizationId||'')}"><div class="event-heading-line"><div class="event-heading-copy"><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)}</p><span class="event-header-countdown">${countdownCopy}</span></div>${circuitVisual(event.circuit)}</div><div class="event-header-summary"><div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div><div class="event-header-stats"><span><strong>${event.durationHours||6} h</strong><small>durée</small></span><span><strong>${event.departures.length}</strong><small>départ${event.departures.length>1?'s':''}</small></span><span><strong>${totalPilots}</strong><small>pilote${totalPilots>1?'s':''}</small></span><span><strong>${totalCrews}</strong><small>équipage${totalCrews>1?'s':''}</small></span></div></div></div>${organizationContextMarkup(state)}<div class="toolbar event-actions-toolbar">${eventActions}</div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<section class="departure-accordion" aria-label="Départs de la course">${upcoming}${renderPastDepartures(event,past)}</section>`;
  showRecoveryLink();notifyRender();
}
