import {simForEvent} from '../../shared/catalog.mjs';
import {dateBlock,timeLabel,weekdayLong,dayMonthShort,fullDateLabel} from '../dates.mjs';
import {durationLabel,eventMinutes} from '../../shared/duration.mjs';
import {app,state,esc,button,canManage,isAdmin,can,canEditRace,officialBadge,communityTag,circuitLabel,eventTypeBadge,schedulePendingBadge,eventBadge,eventCategoryCount,circuitVisual,pilotCount,countdown,notifyRender} from './core.mjs';
import {ownRegistration,renderRegistrationWorkspace,soloRounds} from './registration.mjs';
import {renderPilots} from './crews.mjs';
import {isSolo,accessBadge,soloCardMeta,soloCardInfo,soloEventDetails,roundTiles,roundPilots,soloEntryList,eventCircuitName,soloFill,soloEntryBlock,safeGuideLink,myWaitlistPosition,renderSoloEntries} from './solo.mjs';
import {renderHome,raceDateBlock,raceStarts} from './home-view.mjs';
import {planningDays,renderPlanning,syncPlanning,CHEVRON} from './planning.mjs';

function canCreateCrewOnDeparture(departure,event=null){
  if(!state.user||departure.startsAt<=Date.now())return false;
  // Creating crews is the « Équipages » permission (server/access.mjs); a pilot without it joins one.
  if(can('crews'))return true;
  // Official race: a crew may be created for any community where the player manages the crews.
  return Boolean(event?.official&&(state.communities||[]).some(item=>item.manageCrews));
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
  // Nothing to choose (no category): no form to edit, the pilot just withdraws.
  const main=own&&!soloRounds(event).length?button('delete-registration','Me désinscrire',`data-departure="${departure.id}" data-id="${own.id}"`,'secondary-button ux-summary-registration-toggle')
    :own?button('my-registration','Modifier mon inscription',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle')
    :blocked?`<span class="solo-blocked">${esc(blocked)}</span>`
    :button('my-registration','Je participe',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle');
  const other=can('manage_registrations')?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot" data-tip="Inscris un coéquipier ou un autre pilote de ta communauté à sa place."`,'link-button ux-summary-registration-other'):'';
  const actions=locked?'':`<span class="ux-summary-registration-actions">${main}${other}</span>`;
  const mine=own?`<span class="departure-mine-badge${waiting?' is-waiting':''}">${waiting?`Liste d’attente · ${waiting}${waiting===1?'er':'e'}`:'✓ Inscrit'}</span>`:'';
  return `<details class="departure-fold solo-departure${mine?' is-mine':''}" id="departure-${departure.id}" ${open?'open':''}><summary><span class="fold-index">01</span><span class="fold-date">${dateBlock(departure.startsAt,{compact:true})}<span class="fold-date-text"><strong class="ux-departure-title">Départ ${esc(timeLabel(departure.time))}</strong>${locked?'<span class="ux-departure-date">Départ passé</span>':''}${mine}</span></span><span class="fold-meta">${soloFill(event,departure)}</span>${actions}</summary><div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont fermées.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${renderSoloEntries(event,departure)}</section></div></details>`;
}

// What an opened solo start shows: the registration panel, then the participants.
function soloFoldBody(event,departure){
  const locked=departure.startsAt<=Date.now(),editorOpen=state.registrationOpen.has(departure.id);
  return `<div class="departure-fold-body">${locked?'<p class="finished-history">Les inscriptions sont fermées.</p>':`<section class="fold-section fold-registration" ${editorOpen?'':'hidden'}>${renderRegistrationWorkspace(event,departure)}</section>`}<section class="fold-section departure-participation-section">${renderSoloEntries(event,departure)}</section></div>`;
}

// Quick actions of a start in the planning, as small squares with an icon and a +: « Inscription » (me, me in
// another category, another pilot: one menu, or the only choice straight away) and « Créer un équipage ».
const QUICK_ICON=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
// A pilot (entry) or a group of three (crew), each with a small « + » drawn in the same line.
const ICON_REGISTER=QUICK_ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4M16 19h6M19 16v6');
const ICON_CREW=QUICK_ICON('M10 13a2 2 0 1 0 4 0a2 2 0 0 0-4 0M8 21v-1a2 2 0 0 1 2-2h3M15 5a2 2 0 1 0 4 0a2 2 0 0 0-4 0M17 10h2a2 2 0 0 1 2 2v1M5 5a2 2 0 1 0 4 0a2 2 0 0 0-4 0M3 13v-1a2 2 0 0 1 2-2h2M16 19h6M19 16v6');
const ICON_MORE=QUICK_ICON('M5 12h.01M12 12h.01M19 12h.01');
// A pilot with a small cross: « Je serai absent ».
const ICON_ABSENT=QUICK_ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h3M17 16l4 4M21 16l-4 4');
// A pilot with a small minus: « Me désinscrire ».
const ICON_UNREGISTER=QUICK_ICON('M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4M16 19h6');
// « Je serai absent » next to « M'inscrire » (the absence is for the whole event); once said, a click withdraws it.
function absenceButton(event){
  if(!state.user)return '';
  const absent=(event.absences||[]).some(item=>item.mine);
  const entered=(event.departures||[]).some(departure=>(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable'));
  if(entered&&!absent)return '';
  const label='Absent',tip=absent?'Tu es noté absent : clique pour retirer ton absence':'Je serai absent';
  return `<button type="button" class="planning-quick-button is-labelled is-absence${absent?' is-active':''}" data-action="${absent?'event-absence-cancel':'event-absence'}" data-id="${event.id}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="planning-quick-icon">${ICON_ABSENT}</span><span class="planning-quick-label">${esc(label)}</span></button>`;
}
// The pilot's own entry, always unfolded: one click enters him (or opens his entry). The other choices
// (another category, another pilot) sit in a small « … » menu, the crew in its own square.
function quickActions(event,departure){
  if(departure.startsAt<=Date.now()||!state.user)return '';
  const solo=isSolo(event),own=ownRegistration(departure),mine=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
  let main=null;const more=[];
  if(solo){
    const blocked=soloEntryBlock(event);
    if(own&&!soloRounds(event).length)main={action:'delete-registration',label:'Me désinscrire',extra:`data-id="${own.id}"`,leave:true};
    else if(own)main={action:'my-registration',label:'Mon inscription',extra:''};
    else if(!blocked)main={action:'my-registration',label:'M’inscrire',extra:''};
    if(!main&&blocked&&!can('manage_registrations'))return `<span class="planning-quick">${safeGuideLink(event)||`<span class="solo-blocked">${esc(blocked)}</span>`}</span>`;
  }else{
    const assigned=(departure.crews||[]).some(crew=>(crew.registrationIds||[]).some(id=>mine.some(reg=>reg.id===id)));
    // Entered: « Me désinscrire » in red, as on the events; the entry is changed from the « … » menu.
    // Entered in several categories: « Mon inscription » (each one is withdrawn there).
    if(mine.length===1){main={action:'delete-registration',label:'Me désinscrire',extra:`data-id="${mine[0].id}"`,leave:true};more.push({action:'my-registration',label:'Modifier mon inscription',extra:''});}
    else if(mine.length||can('endurance'))main={action:'my-registration',label:mine.length?'Mon inscription':'M’inscrire',extra:''};
    if(own&&!assigned&&event.categories.some(category=>!mine.some(reg=>reg.category===category)))more.push({action:'new-registration',label:'M’inscrire dans une autre catégorie',extra:`data-mode="category" data-registration="${own.id}"`});
  }
  if(can('manage_registrations'))more.push({action:'new-registration',label:'Inscrire un autre pilote',extra:'data-mode="pilot"'});
  const square=(icon,tip,attrs,label='',extra='')=>`<button type="button" class="planning-quick-button${label?' is-labelled':''}${extra}" ${attrs} data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="planning-quick-icon">${icon}</span>${label?`<span class="planning-quick-label">${esc(label)}</span>`:''}</button>`;
  const register=main?square(main.leave?ICON_UNREGISTER:ICON_REGISTER,main.label,`data-action="${main.action}" data-departure="${departure.id}" ${main.extra}`,main.label,main.leave?' is-leave':''):'';
  const menu=!more.length?'':more.length===1&&!main?square(ICON_REGISTER,more[0].label,`data-action="${more[0].action}" data-departure="${departure.id}" ${more[0].extra}`,'Inscrire')
    :`<span class="planning-quick-menu-wrap">${square(ICON_MORE,'Autres inscriptions','data-action="quick-menu" aria-haspopup="menu" aria-expanded="false"')}<span class="planning-quick-menu" role="menu" hidden>${more.map(item=>`<button type="button" role="menuitem" class="planning-quick-item" data-action="${item.action}" data-departure="${departure.id}" ${item.extra}>${esc(item.label)}</button>`).join('')}</span></span>`;
  const crewLabel='Créer un équipage';
  const crew=!solo&&canCreateCrewOnDeparture(departure,event)?square(ICON_CREW,crewLabel,`data-crew-builder-open data-departure="${departure.id}"`):'';
  const absence=absenceButton(event);
  return register||absence||menu||crew?`<span class="planning-quick">${register}${absence}${menu}${crew}</span>`:'';
}

// An event in several rounds: each round is shown like a start, « Manche 1 », « Manche 2 », with its own
// « M'inscrire » and « Absent »; open by default on its details and its pilots.
function roundQuick(event,departure,index){
  if(departure.startsAt<=Date.now()||!state.user)return '';
  const own=ownRegistration(departure),inRound=own&&own.status!=='unavailable'&&!own.roundChoices?.[index]?.skip,blocked=soloEntryBlock(event);
  const square=(icon,tip,attrs,label,extra='')=>`<button type="button" class="planning-quick-button is-labelled${extra}" ${attrs} data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="planning-quick-icon">${icon}</span><span class="planning-quick-label">${esc(label)}</span></button>`;
  const attrs=action=>`data-action="${action}" data-departure="${departure.id}" data-round="${index}"`;
  // Entered on this round: « Me désinscrire » (from this round only), as on every event; the category can be
  // changed from the « … » menu.
  const register=inRound?square(ICON_UNREGISTER,`Me désinscrire de la manche ${index+1}`,attrs('round-skip'),'Me désinscrire',' is-leave')
    :blocked?safeGuideLink(event):square(ICON_REGISTER,`M’inscrire à la manche ${index+1}`,attrs('round-enter'),'M’inscrire');
  const absence=inRound||own?'':absenceButton(event);
  const items=[
    inRound&&soloRounds(event)[index]?.categories.length>1?`<button type="button" role="menuitem" class="planning-quick-item" ${attrs('round-edit')}>Changer de catégorie</button>`:'',
    can('manage_registrations')?`<button type="button" role="menuitem" class="planning-quick-item" data-action="new-registration" data-departure="${departure.id}" data-round="${index}" data-mode="pilot">Inscrire un autre pilote</button>`:'',
  ].filter(Boolean);
  const more=items.length?`<span class="planning-quick-menu-wrap"><button type="button" class="planning-quick-button" data-action="quick-menu" aria-haspopup="menu" aria-expanded="false" data-tip="Autres choix" aria-label="Autres choix"><span class="planning-quick-icon">${ICON_MORE}</span></button><span class="planning-quick-menu" role="menu" hidden>${items.join('')}</span></span>`:'';
  return register||absence||more?`<span class="planning-quick">${register}${absence}${more}</span>`:'';
}
function roundEntries(event,departure,index){
  const capacity=event.rounds[index]?.capacity||null;
  return soloEntryList(event,departure,(departure.availability||[]).filter(reg=>reg.status!=='unavailable'&&!reg.roundChoices?.[index]?.skip),{round:index,capacity,waitOf:capacity?reg=>reg.roundWaitlist?.[index]:reg=>reg.waitlistPosition});
}
function roundCards(event,departure){
  if(!isSolo(event))return '';
  // A single round: one frame, without « Manche 1 » nor the circuit (both in the header), with the event's usual buttons.
  const single=(event.rounds||[]).length<2,rounds=single?[event.rounds?.[0]||{circuit:event.circuit}]:event.rounds;
  if(single&&(event.departures||[]).length>1)return '';
  const locked=departure.startsAt<=Date.now(),editing=state.registrationOpen.has(departure.id),focus=Number(state.roundFocus?.[departure.id])||0;
  return `<div class="solo-round-starts" id="departure-${departure.id}">${rounds.map((round,index)=>{
    const pilots=roundPilots(event,index,departure),own=ownRegistration(departure),mine=own&&own.status!=='unavailable'&&!own.roundChoices?.[index]?.skip;
    const capacity=single?Number(event.capacity)||null:round.capacity;
    const open=(editing&&focus===index)||!state.closedRounds?.has(`${departure.id}:${index}`);
    const editor=!locked&&editing&&focus===index?`<section class="fold-section fold-registration">${renderRegistrationWorkspace(event,departure)}</section>`:'';
    // One round: a plain frame, always open (it doesn't fold); its details stay at the top of the page.
    if(single)return `<details class="planning-start solo-round-start is-single has-quick${mine?' is-mine':''}" open><summary><span class="planning-start-head solo-round-head"><span class="solo-subtitle">Pilotes <span class="count-pill">${pilots}${capacity?` / ${capacity}`:''}</span></span>${mine?'<span class="planning-tag is-mine">Inscrit</span>':''}</span>${quickActions(event,departure)}</summary><div class="departure-fold planning-body"><div class="departure-fold-body">${editor}${soloEntryList(event,departure,(departure.availability||[]).filter(reg=>reg.status!=='unavailable'),{capacity,waitOf:reg=>reg.waitlistPosition})}</div></div></details>`;
    return `<details class="planning-start solo-round-start has-quick${mine?' is-mine':''}" data-round-key="${departure.id}:${index}" ${open?'open':''}><summary><span class="planning-start-head solo-round-head"><span class="round-start-title"><small>Manche ${index+1}</small><strong>${esc(eventCircuitName(event,round.circuit))}</strong></span>${mine?'<span class="planning-tag is-mine">Inscrit</span>':''}</span><span class="planning-row"><span class="solo-round-pilots">${capacity?`<strong>${pilots} / ${capacity}</strong> places prises`:`${pilots} pilote${pilots>1?'s':''}`}</span></span>${roundQuick(event,departure,index)}${CHEVRON}</summary><div class="departure-fold planning-body"><div class="departure-fold-body">${editor}${roundTiles(round)}${roundEntries(event,departure,index)}</div></div></details>`;
  }).join('')}</div>`;
}

// Buttons of a start (enter, enter another pilot, create a crew) and what an opened start shows.
function departureActions(event,departure){
  if(departure.startsAt<=Date.now())return '';
  const own=ownRegistration(departure),canCreateCrew=canCreateCrewOnDeparture(departure,event);
  const createCrewAction=canCreateCrew?`<button type="button" class="link-button ux-summary-create-crew" data-crew-builder-open data-departure="${departure.id}" data-tip="Choisis la voiture, compose les pilotes et verrouille l’équipage quand il est complet.">Créer un équipage</button>`:'';
  const mine=(departure.availability||[]).filter(reg=>reg.mine&&reg.status!=='unavailable');
  const leave=mine.length===1?button('delete-registration','Me désinscrire',`data-departure="${departure.id}" data-id="${mine[0].id}"`,'secondary-button is-leave'):'';
  return `<span class="ux-summary-registration-actions${canCreateCrew?' is-three-actions':''}">${own||can('endurance')?button('my-registration',own?'Modifier mon inscription':'S’inscrire',`data-departure="${departure.id}"`,'primary-button ux-summary-registration-toggle'):''}${leave}${can('manage_registrations')?button('new-registration','Inscrire un autre pilote',`data-departure="${departure.id}" data-mode="pilot"`,'link-button ux-summary-registration-other'):''}${createCrewAction}</span>`;
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

// Official race: the player may show the pilots and crews of some of his communities only (chips above the
// starts, kept in the browser for every race). Nothing chosen, or none of them on this race: all of them.
const PLANNING_COMMUNITIES_KEY='em_planning_communities_v1';
function planningCommunities(){
  if(!Array.isArray(state.planningCommunities)){let saved=[];try{saved=JSON.parse(localStorage.getItem(PLANNING_COMMUNITIES_KEY)||'[]');}catch{}state.planningCommunities=Array.isArray(saved)?saved:[];}
  return state.planningCommunities;
}
export function togglePlanningCommunity(id){
  const list=planningCommunities();
  state.planningCommunities=!id?[]:list.includes(id)?list.filter(item=>item!==id):[...list,id];
  try{localStorage.setItem(PLANNING_COMMUNITIES_KEY,JSON.stringify(state.planningCommunities));}catch{}
}
// The communities entered on the race, with their number of pilots (each pilot once).
function raceCommunities(event){
  const found=new Map();
  for(const departure of event.departures||[])for(const item of [...(departure.availability||[]),...(departure.crews||[])]){
    if(!item.community?.id)continue;
    if(!found.has(item.community.id))found.set(item.community.id,{community:item.community,pilots:new Set()});
    if(item.status!==undefined&&item.status!=='unavailable')found.get(item.community.id).pilots.add(item.participantId||item.id);
  }
  return found;
}
function communityView(event){
  if(!event.official)return {shown:event,present:new Map(),chosen:[]};
  const present=raceCommunities(event),chosen=planningCommunities().filter(id=>present.has(id));
  if(!chosen.length)return {shown:event,present,chosen};
  const keep=item=>chosen.includes(item.community?.id);
  return {shown:{...event,departures:(event.departures||[]).map(departure=>({...departure,availability:(departure.availability||[]).filter(keep),crews:(departure.crews||[]).filter(keep)}))},present,chosen};
}
function communityFilter(present,chosen){
  if(present.size<2)return '';
  const chip=(id,label,active,tip)=>button('planning-community',label,`data-community="${esc(id)}" aria-pressed="${active}"${tip?` data-tip="${esc(tip)}"`:''}`,`race-filter-chip${active?' active':''}`);
  const items=[...present.values()].sort((a,b)=>String(a.community.name).localeCompare(String(b.community.name),'fr'));
  return `<div class="race-community-filter" role="group" aria-label="Communautés affichées"><span class="race-filter-title">Communautés</span><div class="race-filter-chips">${chip('','Toutes',!chosen.length,'Les pilotes et équipages de toutes tes communautés')}${items.map(({community,pilots})=>chip(community.id,`${community.logoUrl?`${communityTag({community})}<span>${esc(community.shortName||community.name)}</span>`:communityTag({community})}<small>${pilots.size}</small>`,chosen.includes(community.id),`${community.name} : ${pilots.size} pilote${pilots.size>1?'s':''}`)).join('')}</div></div>`;
}

// Pilots who said they will miss the event, at the bottom of its page. On an endurance the
// pilots entered as "Indisponible" on a start count too.
function absencesSection(event,open){
  const names=new Map();
  for(const item of event.absences||[])names.set(item.name.toLowerCase(),item);
  for(const departure of event.departures||[])for(const reg of departure.availability||[])if(reg.status==='unavailable'&&!names.has(String(reg.name).toLowerCase()))names.set(String(reg.name).toLowerCase(),{name:reg.name,mine:reg.mine});
  const list=[...names.values()];
  // « Je serai absent » sits next to « M'inscrire » on each start; here, only the list.
  if(!list.length)return '';
  return `<section class="event-absences" aria-label="Pilotes absents"><div class="event-absences-head"><h2>Absents <span>${list.length}</span></h2></div><ul>${list.map(item=>`<li class="${item.mine?'is-mine':''}">${esc(item.name)}</li>`).join('')}</ul></section>`;
}
// EVENT TDZ: the event type where an endurance shows its circuit (its logo will take this place).
// EVENT TDZ: the time of the event, large, under its name (« 21h »).
function soloHeaderTime(event,next){
  const departure=next||(event.departures||[]).at(-1);
  if(!departure)return '';
  return `<span class="race-header-time"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(timeLabel(departure.time))}</span>`;
}
function eventTypePanel(event){
  const type=event.details?.type;
  return type?`<span class="event-type-panel" data-type="${esc(type)}"><span>${esc(type)}</span></span>`:'';
}
export function renderEvent(message=''){
  state.page='event';state.eventSection='race';const full=state.events.find(item=>item.id===state.currentEventId);if(!full){renderHome('Cet événement n’est plus disponible.');return;}
  // The race as shown: on an official race, the pilots and crews of the chosen communities only.
  const {shown:event,present,chosen}=communityView(full);
  const now=Date.now();
  const ordered=(event.departures||[]).map((departure,index)=>({departure,index})).sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
  const future=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)>now),past=ordered.filter(item=>Number.isFinite(Number(item.departure.startsAt))&&Number(item.departure.startsAt)<=now),undated=ordered.filter(item=>!Number.isFinite(Number(item.departure.startsAt)));
  const next=future[0]?.departure||null;
  // Race actions live in the header, same hierarchy as crews: sharing as a link, editing as a
  // secondary button, deletion as a discreet red link (it still asks for confirmation).
  const trash='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const eventActions=`<span class="race-header-actions">${button('share-event','Copier le lien',`data-id="${event.id}"`,'link-button')}${canEditRace(event)?button('edit-event','Modifier l’événement',`data-id="${event.id}"`,'secondary-button'):''}${state.manager&&!event.official&&!isSolo(event)?button('make-official','Rendre officielle',`data-id="${event.id}" data-tip="Commune à toutes les communautés : chacune pourra s’y inscrire."`,'link-button'):''}${canEditRace(event)?button('delete-event',`${trash}<span>Supprimer l’événement</span>`,`data-id="${event.id}"`,'danger-link'):''}</span>`;
  const visible=[...future,...undated];
  const upcoming=visible.map(({departure,index})=>renderDeparturePanel(event,departure,index,departure.id===state.selectedDepartureId||state.registrationOpen.has(departure.id))).join('');
  // A race over several days shows its starts as a planning, one column per day.
  const days=planningDays(event);
  // The planning shows the crews and pilots of every start: no category summary above it, and the race
  // actions sit on its heading line.
  const starts=days.length?renderPlanning(event,days,departure=>isSolo(event)?soloFoldBody(event,departure):departureFoldBody(event,departure),{actions:eventActions,quick:departure=>quickActions(event,departure),cards:departure=>roundCards(event,departure)})
    :`<section class="departure-accordion" aria-label="Départs de la course">${upcoming}${renderPastDepartures(event,past)}</section>`;
  const myStart=days.length>1?days.flatMap(day=>day.items).map(item=>item.departure).find(departure=>Number(departure.startsAt)>now&&(departure.availability||[]).some(reg=>reg.mine&&reg.status!=='unavailable')):null;
  const myStartLink=myStart?`<span class="race-my-start"><small>Ton départ</small>${button('goto-departure',`${esc(weekdayLong(myStart.startsAt))} ${esc(dayMonthShort(myStart.startsAt))} · Départ ${esc(timeLabel(myStart.time))}`,`data-departure="${myStart.id}"`,'secondary-button')}</span>`:'';
  const countdownCopy=next?`Prochain départ dans <strong data-tip="${esc(fullDateLabel(next.startsAt))} à ${esc(timeLabel(next.time))}" data-countdown="${next.startsAt}">${countdown(next.startsAt)}</strong>`:undated.length?'Dates à confirmer':'Tous les départs ont eu lieu';
  app.eventViewData={eventId:event.id,events:state.events,message};
  app.innerHTML=`<div class="event-header event-header-compact race-header event-type-${event.eventType||'private'}${isSolo(event)?` is-solo-${event.access||'open'} sim-${simForEvent(event)}`:''}" data-event-id="${event.id}"><div class="race-card-top">${raceDateBlock(event,!next&&!undated.length)}<div class="race-head"><h1 class="event-title event-name">${esc(event.name)}</h1><span class="race-meta">${isSolo(event)?((event.rounds||[]).length>1?soloCardMeta(event):`<strong class="solo-header-circuit">${soloCardMeta(event)}</strong>`):`${esc(circuitLabel(event.circuit))} · ${durationLabel(eventMinutes(event))}`}</span><span class="race-badges">${officialBadge(event)}${isSolo(event)?accessBadge(event):eventTypeBadge(event.eventType)}${schedulePendingBadge(event)}</span>${isSolo(event)?soloHeaderTime(event,next):''}${isSolo(event)&&(event.departures||[]).length<2?'':`<span class="event-header-countdown">${countdownCopy}</span>`}</div>${myStartLink}${isSolo(event)?eventTypePanel(event):circuitVisual(event.circuit)}</div>${days.length?(isSolo(event)?(soloEventDetails(event)?`<div class="race-header-footer">${soloEventDetails(event)}</div>`:''):raceStarts(event,!next&&!undated.length)):`${isSolo(event)?'':raceStarts(event,!next&&!undated.length)}<div class="race-header-footer">${isSolo(event)?soloEventDetails(event):`<div class="event-header-stats event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div>`}${eventActions}</div>`}</div><div id="crew-builder-root"></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${communityFilter(present,chosen)}${starts}${absencesSection(full,!!(next||undated.length))}`;
  if(days.length)syncPlanning(app);
  notifyRender();
}

// The rounds are open by default; the ones the player closes stay closed when the page is drawn again.
if(typeof document!=='undefined')document.addEventListener('toggle',event=>{
  const key=event.target?.dataset?.roundKey;
  if(!key)return;
  state.closedRounds??=new Set();
  if(event.target.open)state.closedRounds.delete(key);else state.closedRounds.add(key);
},true);
// A single round's frame never folds.
if(typeof document!=='undefined')document.addEventListener('click',event=>{
  const summary=event.target.closest?.('.solo-round-start.is-single > summary');
  if(summary&&!event.target.closest('button,a,input,select'))event.preventDefault();
});
