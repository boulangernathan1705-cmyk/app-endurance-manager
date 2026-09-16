import {app,nav,state,api,load,showError,esc,notifyRender,circuitLabel,dateLabel} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=12-teams-core';
import {allAudienceIds,organizationById,registrationAudienceIds} from './organization-context.mjs?v=3-teams-core';

const view={organizationId:null,tab:'overview',mode:'index',busy:false};
const now=()=>Date.now();
const canManage=organization=>['owner','manager'].includes(organization?.role);
const kindLabel=organization=>organization?.type==='team'?'Team privée':'Communauté ouverte';
const roleLabel=role=>({owner:'Responsable',manager:'Manager',member:'Membre'}[role]||'Membre');

function resetGlobalContext(){
  state.activeOrganizationId=null;
  state.visibleAudienceIds=allAudienceIds(state.organizations||{});
  try{localStorage.removeItem('endurance_audience_filter');}catch{}
}
function allJoined(){const values=[];if(state.organizations?.team)values.push(state.organizations.team);values.push(...(state.organizations?.communities||[]));return values;}
function currentOrganization(){return organizationById(state.organizations,view.organizationId);}
function registrationIn(registration,organizationId){return registrationAudienceIds(registration).includes(organizationId);}

function activityFor(event,organizationId){
  const departures=(event.departures||[]).map(departure=>{
    const availability=(departure.availability||[]).filter(reg=>registrationIn(reg,organizationId));
    const crews=(departure.crews||[]).filter(crew=>crew.organizationId===organizationId);
    const assigned=new Set(crews.flatMap(crew=>crew.registrationIds||[]));
    const unassigned=availability.filter(reg=>reg.status!=='unavailable'&&!assigned.has(reg.id)&&!reg.engaged);
    return {...departure,availability,crews,unassigned};
  }).filter(departure=>departure.availability.length||departure.crews.length);
  return {...event,departures};
}
function organizationEvents(organizationId){return state.events.map(event=>activityFor(event,organizationId)).filter(event=>event.departures.length);}
function firstStart(event,{future=true}={}){const values=(event.departures||[]).map(departure=>Number(departure.startsAt)).filter(Number.isFinite).filter(value=>future?value>now():value<=now()).sort((a,b)=>future?a-b:b-a);return values[0]||0;}
function upcomingEvents(organizationId){return organizationEvents(organizationId).filter(event=>firstStart(event)>0).sort((a,b)=>firstStart(a)-firstStart(b));}
function recentEvents(organizationId){return organizationEvents(organizationId).filter(event=>!firstStart(event)&&firstStart(event,{future:false})>0).sort((a,b)=>firstStart(b,{future:false})-firstStart(a,{future:false}));}

function futureCrews(organizationId){
  const rows=[];
  for(const event of organizationEvents(organizationId))for(const departure of event.departures||[]){
    if(Number(departure.startsAt)<=now())continue;
    for(const crew of departure.crews||[]){const registrations=(crew.registrationIds||[]).map(id=>departure.availability.find(reg=>reg.id===id)).filter(Boolean);rows.push({event,departure,crew,registrations});}
  }
  return rows.sort((a,b)=>Number(a.departure.startsAt)-Number(b.departure.startsAt));
}
function uniquePilotCount(registrations){return new Set(registrations.filter(reg=>reg.status!=='unavailable').map(reg=>reg.participantId||reg.id)).size;}
function dashboardStats(organization){
  const events=upcomingEvents(organization.id),crews=futureCrews(organization.id);
  const futureDepartures=events.flatMap(event=>event.departures.filter(dep=>Number(dep.startsAt)>now()));
  const registrations=futureDepartures.flatMap(dep=>dep.availability||[]),unassigned=futureDepartures.flatMap(dep=>dep.unassigned||[]);
  return {events,crews,pilots:uniquePilotCount(registrations),unassigned:uniquePilotCount(unassigned)};
}
function memberNames(row){return row.registrations.length?row.registrations.map(reg=>reg.name).join(' · '):'Aucun pilote affecté';}
function departureLabel(departure){return `${dateLabel(departure)} · ${departure.time||''}`.trim();}

function eventCard(event,organization){
  const future=(event.departures||[]).filter(dep=>Number(dep.startsAt)>now()).sort((a,b)=>Number(a.startsAt)-Number(b.startsAt)),departure=future[0]||event.departures[0];
  const pilots=uniquePilotCount(event.departures.flatMap(dep=>dep.availability||[])),crews=event.departures.reduce((sum,dep)=>sum+(dep.crews||[]).length,0);
  return `<button type="button" class="tc-event-card" data-teams-action="open-event" data-event-id="${event.id}" data-organization-id="${organization.id}"><span><strong>${esc(event.name)}</strong><small>${esc(circuitLabel(event.circuit))}${departure?` · ${esc(departureLabel(departure))}`:''}</small></span><span class="tc-event-counts"><b>${pilots}</b> pilotes · <b>${crews}</b> équipage${crews>1?'s':''}</span><span class="tc-arrow" aria-hidden="true">›</span></button>`;
}
function crewCard(row){return `<article class="tc-crew-card ${row.crew.locked?'is-complete':'is-open'}"><div class="tc-crew-head"><span class="tc-kind-icon" aria-hidden="true">🏎️</span><div><strong>${esc(row.crew.name)}</strong><small>${esc(row.event.name)} · ${esc(departureLabel(row.departure))}</small></div><span class="tc-status ${row.crew.locked?'complete':'open'}">${row.crew.locked?'Complet':'Ouvert'}</span></div><div class="tc-crew-meta"><span>${esc(row.crew.category)}</span><span>${esc(row.crew.car||'Voiture à choisir')}</span></div><p>${esc(memberNames(row))}</p></article>`;}

function personalSummary(organization){
  const rows=[];
  for(const event of organizationEvents(organization.id))for(const departure of event.departures||[]){
    if(Number(departure.startsAt)<=now())continue;
    for(const registration of departure.availability||[]){if(!registration.mine)continue;const crew=(departure.crews||[]).find(item=>(item.registrationIds||[]).includes(registration.id));rows.push({event,departure,registration,crew});}
  }
  if(!rows.length)return `<div class="tc-empty compact"><strong>Rien à signaler pour toi</strong><span>Quand tu partageras une inscription avec ${esc(organization.name)}, elle apparaîtra ici.</span></div>`;
  return `<div class="tc-personal-list">${rows.slice(0,4).map(row=>`<div><span><strong>${esc(row.event.name)}</strong><small>${esc(departureLabel(row.departure))} · ${esc(row.registration.category||'')}</small></span><b>${row.crew?`Équipage : ${esc(row.crew.name)}`:'Sans équipage'}</b></div>`).join('')}</div>`;
}

function overview(organization){
  const stats=dashboardStats(organization),next=stats.events[0],crews=stats.crews.slice(0,4);
  const fourth=organization.type==='community'?`<span><strong>${stats.unassigned}</strong><small>pilote${stats.unassigned>1?'s':''} sans équipage</small></span>`:`<span><strong>${stats.pilots}</strong><small>pilote${stats.pilots>1?'s':''} actif${stats.pilots>1?'s':''}</small></span>`;
  return `<div class="tc-overview-grid"><section class="tc-panel tc-next"><div class="tc-panel-title"><span>PROCHAINE ENDURANCE</span><strong>${next?esc(next.name):'Aucune endurance préparée'}</strong></div>${next?eventCard(next,organization):`<div class="tc-empty compact"><span>Les courses apparaîtront ici dès qu’un membre partagera sa disponibilité avec ${esc(organization.name)}.</span></div>`}</section><section class="tc-panel"><div class="tc-panel-title"><span>MON RÉCAP</span><strong>Ma situation dans ${esc(organization.name)}</strong></div>${personalSummary(organization)}</section></div><section class="tc-stat-strip"><span><strong>${organization.memberCount||organization.members?.length||0}</strong><small>membres</small></span><span><strong>${stats.events.length}</strong><small>endurance${stats.events.length>1?'s':''} à venir</small></span><span><strong>${stats.crews.length}</strong><small>équipage${stats.crews.length>1?'s':''} actif${stats.crews.length>1?'s':''}</small></span>${fourth}</section><section class="tc-panel"><div class="tc-panel-title row"><div><span>${organization.type==='team'?'ÉQUIPAGES ACTIFS':'ÉQUIPAGES EN FORMATION'}</span><strong>${crews.length?'Ce qui se prépare':'Aucun équipage pour le moment'}</strong></div>${stats.crews.length?`<button type="button" class="secondary-button" data-teams-action="tab" data-tab="crews">Tout voir</button>`:''}</div>${crews.length?`<div class="tc-crew-grid">${crews.map(crewCard).join('')}</div>`:`<div class="tc-empty"><span>Les équipages créés pour ${esc(organization.name)} apparaîtront ici.</span></div>`}</section>`;
}
function eventsTab(organization){const upcoming=upcomingEvents(organization.id),past=recentEvents(organization.id).slice(0,8);return `<section class="tc-panel"><div class="tc-panel-title"><span>À VENIR</span><strong>${upcoming.length} endurance${upcoming.length>1?'s':''}</strong></div>${upcoming.length?`<div class="tc-event-list">${upcoming.map(event=>eventCard(event,organization)).join('')}</div>`:'<div class="tc-empty"><span>Aucune endurance à venir pour ce groupe.</span></div>'}</section><section class="tc-panel"><div class="tc-panel-title"><span>ACTIVITÉ RÉCENTE</span><strong>${past.length?'Dernières participations':'Aucun historique'}</strong></div>${past.length?`<div class="tc-event-list is-past">${past.map(event=>eventCard(event,organization)).join('')}</div>`:'<div class="tc-empty"><span>L’historique se remplira avec les participations du groupe.</span></div>'}</section>`;}
function crewsTab(organization){const crews=futureCrews(organization.id);return `<section class="tc-panel"><div class="tc-panel-title"><span>ÉQUIPAGES</span><strong>${crews.length} équipage${crews.length>1?'s':''} actif${crews.length>1?'s':''}</strong></div>${crews.length?`<div class="tc-crew-grid">${crews.map(crewCard).join('')}</div>`:'<div class="tc-empty"><span>Aucun équipage actif pour ce groupe.</span></div>'}</section>`;}

function membersTab(organization){
  const manageable=canManage(organization),memberIds=new Set((organization.members||[]).map(member=>member.id)),candidates=(state.participants||[]).filter(participant=>!memberIds.has(participant.id));
  const add=organization.type==='team'&&manageable?`<form class="tc-add-member" data-teams-form="add-member" data-organization-id="${organization.id}"><label><span>Ajouter un pilote à la Team</span><select name="userId" required><option value="">Choisir un pilote Discord</option>${candidates.map(candidate=>`<option value="${candidate.id}">${esc(candidate.name)}</option>`).join('')}</select></label><button type="submit" class="primary-button" ${candidates.length?'':'disabled'}>Ajouter</button></form>`:'';
  return `<section class="tc-panel"><div class="tc-panel-title"><span>MEMBRES</span><strong>${organization.members?.length||0} membre${(organization.members?.length||0)>1?'s':''}</strong></div>${add}<div class="tc-member-list">${(organization.members||[]).map(member=>`<div class="tc-member"><span class="tc-member-avatar" aria-hidden="true">${esc((member.name||'?').slice(0,1).toUpperCase())}</span><span><strong>${esc(member.name)}</strong><small>${roleLabel(member.role)}</small></span>${manageable&&member.role!=='owner'&&member.id!==state.user?.id?`<button type="button" class="secondary-button" data-teams-action="remove-member" data-organization-id="${organization.id}" data-user-id="${member.id}" data-user-name="${esc(member.name)}">Retirer</button>`:''}</div>`).join('')}</div>${organization.type==='community'&&organization.role!=='owner'?`<button type="button" class="danger-button tc-leave" data-teams-action="leave" data-organization-id="${organization.id}">Quitter la communauté</button>`:''}</section>`;
}
function detailBody(organization){if(view.tab==='events')return eventsTab(organization);if(view.tab==='crews')return crewsTab(organization);if(view.tab==='members')return membersTab(organization);return overview(organization);}
function updateNavState(){const button=nav?.querySelector('[data-teams-nav]');if(button)button.setAttribute('aria-current',state.page==='organizations'?'page':'false');}
function ensureNavButton(){if(!nav||nav.querySelector('[data-teams-nav]')){updateNavState();return;}const button=document.createElement('button');button.type='button';button.className='secondary-button teams-nav-button';button.dataset.teamsNav='true';button.textContent='Teams & communautés';const switcher=nav.querySelector('.nav-game-switcher');if(switcher)switcher.before(button);else nav.append(button);updateNavState();}

function renderIndex(){
  resetGlobalContext();view.mode='index';view.organizationId=null;view.tab='overview';state.page='organizations';
  const team=state.organizations?.team,communities=state.organizations?.communities||[],discoverable=state.organizations?.discoverableCommunities||[];
  if(!state.user){app.innerHTML=`<div class="tc-page"><header class="tc-page-head"><span class="tc-kicker">ORGANISATION</span><h1>Teams & communautés</h1><p>Connecte-toi avec Discord pour rejoindre une communauté ou gérer ta Team.</p></header><div class="tc-empty"><strong>Connexion requise</strong><span>La connexion Discord se fait depuis le menu du compte en haut de la page.</span></div></div>`;updateNavState();notifyRender();return;}
  const teamContent=team?`<article class="tc-primary-card team"><span class="tc-kind-icon">🔒</span><div><small>MA TEAM</small><h2>${esc(team.name)}</h2><p>${team.memberCount||team.members?.length||0} membres · Team privée</p></div><button type="button" class="primary-button" data-teams-action="open-detail" data-organization-id="${team.id}">Ouvrir</button></article>`:`<article class="tc-primary-card team empty"><span class="tc-kind-icon">🔒</span><div><small>MA TEAM</small><h2>Aucune Team</h2><p>Crée ta Team privée pour organiser tes équipages réguliers.</p></div><button type="button" class="primary-button" data-teams-action="create" data-type="team">Créer ma Team</button></article>`;
  const communityCards=communities.length?communities.map(community=>`<article class="tc-community-card"><span class="tc-kind-icon">🌐</span><div><strong>${esc(community.name)}</strong><small>${community.memberCount||community.members?.length||0} membres · Communauté ouverte</small></div><button type="button" class="secondary-button" data-teams-action="open-detail" data-organization-id="${community.id}">Ouvrir</button></article>`).join(''):`<div class="tc-empty compact"><strong>Aucune communauté rejointe</strong><span>Rejoins une communauté pour organiser des équipages avec d’autres pilotes.</span></div>`;
  const discover=discoverable.length?`<section class="tc-panel tc-discover"><div class="tc-panel-title"><span>DÉCOUVRIR</span><strong>Communautés ouvertes</strong></div><div class="tc-community-list">${discoverable.map(community=>`<article class="tc-community-card discover"><span class="tc-kind-icon">🌐</span><div><strong>${esc(community.name)}</strong><small>${community.memberCount||0} membres</small></div><button type="button" class="primary-button" data-teams-action="join" data-organization-id="${community.id}">Rejoindre</button></article>`).join('')}</div></section>`:'';
  app.innerHTML=`<div class="tc-page"><header class="tc-page-head"><span class="tc-kicker">ORGANISATION</span><h1>Teams & communautés</h1><p>Ta Team pour ton groupe privé. Tes communautés pour rouler avec un groupe plus large. Les endurances restent communes à tout Endurance Manager.</p></header>${teamContent}<section class="tc-panel"><div class="tc-panel-title row"><div><span>MES COMMUNAUTÉS</span><strong>${communities.length} communauté${communities.length>1?'s':''}</strong></div><button type="button" class="secondary-button" data-teams-action="create" data-type="community">Créer une communauté</button></div><div class="tc-community-list">${communityCards}</div></section>${discover}</div>`;
  updateNavState();notifyRender();
}
function renderCreate(type){view.mode='create';state.page='organizations';const team=type==='team';app.innerHTML=`<div class="tc-page tc-create-page"><button type="button" class="secondary-button tc-back" data-teams-action="index">← Retour</button><section class="tc-panel tc-create-card"><span class="tc-kind-icon">${team?'🔒':'🌐'}</span><div class="tc-panel-title"><span>${team?'TEAM PRIVÉE':'COMMUNAUTÉ OUVERTE'}</span><strong>${team?'Créer ma Team':'Créer une communauté'}</strong></div><p>${team?'Les membres sont ajoutés par les responsables. Un pilote ne peut appartenir qu’à une seule Team.':'Les pilotes peuvent découvrir et rejoindre librement une communauté.'}</p><form data-teams-form="create" data-type="${type}"><label><span>Nom</span><input name="name" maxlength="60" required placeholder="${team?'Ex. FMT':'Ex. Endurance France'}"></label><button type="submit" class="primary-button">Créer</button></form></section></div>`;updateNavState();notifyRender();app.querySelector('input')?.focus();}
function renderDetail(organizationId=view.organizationId){view.mode='detail';view.organizationId=organizationId;state.page='organizations';const organization=currentOrganization();if(!organization){renderIndex();return;}const tabs=[['overview','Vue d’ensemble'],['events','Endurances'],['crews','Équipages'],['members','Membres']];app.innerHTML=`<div class="tc-page tc-detail"><button type="button" class="secondary-button tc-back" data-teams-action="index">← Teams & communautés</button><header class="tc-organization-head ${organization.type}"><span class="tc-kind-icon">${organization.type==='team'?'🔒':'🌐'}</span><div><small>${kindLabel(organization)}</small><h1>${esc(organization.name)}</h1><p>${organization.memberCount||organization.members?.length||0} membres · ${roleLabel(organization.role)}</p></div></header><nav class="tc-tabs" aria-label="Navigation ${esc(organization.name)}">${tabs.map(([key,label])=>`<button type="button" data-teams-action="tab" data-tab="${key}" aria-pressed="${view.tab===key}">${label}</button>`).join('')}</nav><div class="tc-tab-body">${detailBody(organization)}</div></div>`;updateNavState();notifyRender();}
async function reloadAndRender(organizationId=null){await load();resetGlobalContext();if(organizationId&&organizationById(state.organizations,organizationId)){view.organizationId=organizationId;renderDetail(organizationId);}else renderIndex();}

async function act(target){
  const action=target.dataset.teamsAction;
  if(action==='index'){renderIndex();return;}if(action==='create'){renderCreate(target.dataset.type);return;}if(action==='open-detail'){view.tab='overview';renderDetail(target.dataset.organizationId);return;}if(action==='tab'){view.tab=target.dataset.tab||'overview';renderDetail();return;}if(action==='back-detail'){view.tab='overview';renderDetail(target.dataset.organizationId);return;}
  if(action==='open-event'){const organizationId=target.dataset.organizationId;state.activeOrganizationId=organizationId;state.visibleAudienceIds=new Set([organizationId]);state.currentEventId=target.dataset.eventId;state.selectedDepartureId=null;state.eventSection='race';state.drafts={};state.pendingCrewJoin=null;state.registrationOpen.clear();renderEvent();return;}
  if(action==='join'){await api(`/api/organizations/${target.dataset.organizationId}/join`,'POST');await reloadAndRender(target.dataset.organizationId);return;}
  if(action==='leave'){if(!confirm('Quitter cette communauté ?'))return;await api(`/api/organizations/${target.dataset.organizationId}/members/me`,'DELETE');await reloadAndRender();return;}
  if(action==='remove-member'){if(!confirm(`Retirer ${target.dataset.userName||'ce pilote'} de ce groupe ?`))return;await api(`/api/organizations/${target.dataset.organizationId}/members/${target.dataset.userId}`,'DELETE');await reloadAndRender(target.dataset.organizationId);}
}

document.addEventListener('endurance:nav',ensureNavButton);
document.addEventListener('endurance:render',()=>{ensureNavButton();if(state.page==='home'||state.page==='my-entries')resetGlobalContext();updateNavState();});
document.addEventListener('click',event=>{const core=event.target.closest?.('[data-action="home"],[data-action="my-entries"]');if(core)resetGlobalContext();},true);
document.addEventListener('click',async event=>{const navTarget=event.target.closest?.('[data-teams-nav]');if(navTarget){event.preventDefault();renderIndex();return;}const target=event.target.closest?.('[data-teams-action]');if(!target||target.disabled)return;event.preventDefault();if(view.busy)return;view.busy=true;target.disabled=true;try{await act(target);}catch(error){showError(error);}finally{view.busy=false;if(target.isConnected)target.disabled=false;}});
document.addEventListener('submit',async event=>{const form=event.target;if(!form.matches?.('[data-teams-form]'))return;event.preventDefault();if(view.busy)return;view.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{if(form.dataset.teamsForm==='create'){const result=await api('/api/organizations','POST',{type:form.dataset.type,name:form.elements.name.value.trim()});await load();resetGlobalContext();view.tab='overview';renderDetail(result.id);}else if(form.dataset.teamsForm==='add-member'){await api(`/api/organizations/${form.dataset.organizationId}/members`,'POST',{userId:form.elements.userId.value});await reloadAndRender(form.dataset.organizationId);}}catch(error){showError(error);}finally{view.busy=false;if(submit?.isConnected)submit.disabled=false;}});
queueMicrotask(()=>{ensureNavButton();if(state.page==='home')resetGlobalContext();});
