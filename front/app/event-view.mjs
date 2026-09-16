import {app,state,esc,button,canManage,isAdmin,eventTypeBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,dateLabel,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace} from './registration.mjs?v=4-audiences';
import {renderPilots} from './crews.mjs?v=9-audiences';
import {renderHome,showRecoveryLink} from './home-view.mjs?v=7-paddock-pulse';
import {scopeEvent,defaultCrewOrganizationId,joinedOrganizations,allAudienceIds} from './organization-context.mjs?v=4-paddock-network';

function managesAnyGroup(){return joinedOrganizations(state.organizations).some(organization=>['owner','manager'].includes(organization.role));}
function canCreateCrewOnDeparture(departure){
  if(!state.user||departure.startsAt<=Date.now())return false;
  if(canManage()||managesAnyGroup())return true;
  return (departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'&&!reg.engaged);
}

export function renderDeparturePanel(event,departure,index,open=false,{isPast=false,rawEvent=event,rawDeparture=departure}={}){
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability),own=ownRegistration(rawDeparture),editorOpen=state.registrationOpen.has(departure.id),canCreateCrew=canCreateCrewOnDeparture(rawDeparture);
  const createCrewAction=canCreateCrew?`<button type="button" class="secondary-button ux-summary-create-crew" data-crew-builder-open data-departure="${departure.id}">Créer un équipage</button>`:'';
  const actions=locked?'':`<span class="ux-summary-registration-actions${canCreateCrew?' is-three-actions':''}">${button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')}${state.user?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'secondary-button ux-summary-registration-other'):''}${createCrewAction}</span>`;
  const participation=renderPilots(event,departure);
  return `<details class="departure-fold${isPast?' is-past':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong class="ux-departure-title">Départ ${esc(departure.time)}</strong><span class="ux-departure-date">${esc(dateLabel(departure))}${locked?' · Départ passé':''}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les équipages restent consultables ci-dessous.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(rawEvent,rawDeparture)}</section>`}<section class="fold-section departure-participation-section">${participation}</section></div></details>`;
}

function renderPastDepartures(event,rawEvent,items){
  if(!items.length)return'';
  return `<details class="past-departures-fold"><summary><span>Départs passés</span><small>${items.length} départ${items.length>1?'s':''}</small></summary><div class="past-departures-list">${items.map(({departure,index,rawDeparture})=>renderDeparturePanel(event,departure,index,false,{isPast:true,rawEvent,rawDeparture})).join('')}</div></details>`;
}
function scopeCount(rawEvent,key){
  const event=key==='all'?scopeEvent(rawEvent,allAudienceIds(state.organizations||{})):scopeEvent(rawEvent,new Set([key]));
  return pilotCount((event.departures||[]).flatMap(departure=>departure.availability||[]));
}
function currentScopeKey(){
  const all=allAudienceIds(state.organizations||{});
  if(state.visibleAudienceIds?.size===all.size&&[...all].every(key=>state.visibleAudienceIds.has(key)))return'all';
  if(state.visibleAudienceIds?.size===1)return[...state.visibleAudienceIds][0];
  return'all';
}
function raceLensMarkup(rawEvent){
  const current=currentScopeKey();
  const groups=joinedOrganizations(state.organizations);
  const options=[{id:'all',label:'Tout le paddock'},{id:'general',label:'Général'},...groups.map(group=>({id:group.id,label:`${group.type==='team'?'◆':'○'} ${group.name}`}))];
  return `<section class="race-lens" aria-label="Choisir le paddock affiché"><div class="race-lens-head"><div><span>VOIR CETTE COURSE POUR</span><small>Même endurance, différents groupes de pilotes. Change de vue sans quitter la course.</small></div><button type="button" class="secondary-button race-lens-network" data-network-open>Mon réseau</button></div><div class="race-lens-options">${options.map(option=>`<button type="button" class="race-lens-button" data-paddock-scope="${option.id}" aria-pressed="${current===option.id}"><span>${esc(option.label)}</span><b>${scopeCount(rawEvent,option.id)}</b></button>`).join('')}</div></section>`;
}

export function renderEvent(message=''){
  state.page='event';state.eventSection='race';const rawEvent=state.events.find(item=>item.id===state.currentEventId);if(!rawEvent){renderHome('Cet événement n’est plus disponible.');return;}const event=scopeEvent(rawEvent,state.visibleAudienceIds);
  const rawById=new Map((rawEvent.departures||[]).map(departure=>[departure.id,departure]));
  const now=Date.now();
  const ordered=(event.departures||[]).map((departure,index)=>({departure,index,rawDeparture:rawById.get(departure.id)||departure})).sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  const future=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)>now),past=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)<=now),undated=ordered.filter(item=>!Number.isFinite(Number(item.departure.startsAt)));
  const next=future[0]?.departure||null,totalPilots=pilotCount(event.departures.flatMap(d=>d.availability)),totalCrews=event.departures.reduce((sum,d)=>sum+(d.crews||[]).length,0);
  const eventActions=`<span class="event-toolbar-main">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</span>`;
  const visible=[...future,...undated];
  const upcoming=visible.map(({departure,index,rawDeparture})=>renderDeparturePanel(event,departure,index,departure.id===state.selectedDepartureId||state.registrationOpen.has(departure.id),{rawEvent,rawDeparture})).join('');
  const countdownCopy=next?`Prochain départ dans <strong data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:undated.length?'Dates à confirmer':'Tous les départs ont eu lieu';
  const crewDefault=defaultCrewOrganizationId(state)||'';
  app.eventViewData={eventId:event.id,events:state.events,message};
  app.innerHTML=`${raceLensMarkup(rawEvent)}<div class="event-header event-header-compact event-type-${event.eventType||'private'}" data-event-id="${event.id}" data-crew-default-organization="${esc(crewDefault)}"><div class="event-heading-line"><div class="event-heading-copy"><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)}</p><span class="event-header-countdown">${countdownCopy}</span></div>${circuitVisual(event.circuit)}</div><div class="event-header-summary"><div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div><div class="event-header-stats"><span><strong>${event.durationHours||6} h</strong><small>durée</small></span><span><strong>${event.departures.length}</strong><small>départ${event.departures.length>1?'s':''}</small></span><span><strong>${totalPilots}</strong><small>pilote${totalPilots>1?'s':''}</small></span><span><strong>${totalCrews}</strong><small>équipage${totalCrews>1?'s':''}</small></span></div></div></div><div class="toolbar event-actions-toolbar">${eventActions}</div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<section class="departure-accordion" aria-label="Départs de la course">${upcoming}${renderPastDepartures(event,rawEvent,past)}</section>`;
  showRecoveryLink();notifyRender();
}
