import {app,state,api,esc,showError,load,notifyRender} from './core.mjs';
import {renderHome,renderNav} from './home-view.mjs?v=7-teams-communities-simple';
import {renderEvent} from './event-view.mjs?v=11-multi-filter';
import {GENERAL_AUDIENCE,allAudienceIds,normalizeAudienceFilter,registrationAudienceIds} from './organization-context.mjs?v=2-multi-filter';

let busy=false;
let groupsView='overview';
let createType='';
let detailId='';

function roleLabel(role){return role==='owner'?'Créateur':role==='manager'?'Responsable':'Membre';}
function joinedGroups(){return [state.organizations.team,...(state.organizations.communities||[])].filter(Boolean);}
function groupById(id){return joinedGroups().find(item=>item.id===id)||null;}
function persistFilter(){try{localStorage.setItem('endurance_audience_filter',JSON.stringify([...state.visibleAudienceIds]));}catch{}}
function resetParticipationUi(){state.drafts={};state.registrationOpen.clear();state.crewManagementOpen.clear();state.pendingCrewJoin=null;}

function groupActivity(groupId){
  const eventIds=new Set();
  const pilotIds=new Set();
  let crews=0;
  for(const event of state.events||[]){
    let active=false;
    for(const departure of event.departures||[]){
      for(const registration of departure.availability||[]){
        if(registration.status==='unavailable'||!registrationAudienceIds(registration).includes(groupId))continue;
        pilotIds.add(registration.participantId||registration.id);
        active=true;
      }
      const matching=(departure.crews||[]).filter(crew=>(crew.organizationId||GENERAL_AUDIENCE)===groupId);
      crews+=matching.length;
      if(matching.length)active=true;
    }
    if(active)eventIds.add(event.id);
  }
  return {events:eventIds.size,pilots:pilotIds.size,crews};
}

function pageHeading(title,subtitle='',back=false){
  return `<div class="groups-page-heading">${back?'<button type="button" class="secondary-button groups-back" data-groups-back>← Retour</button>':''}<div><span class="creation-kicker">TEAMS & COMMUNAUTÉS</span><h1 class="page-title">${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>`;
}

function activityText(group){
  const activity=groupActivity(group.id);
  return `${group.memberCount} membre${group.memberCount===1?'':'s'} · ${activity.events} endurance${activity.events===1?'':'s'} · ${activity.crews} équipage${activity.crews===1?'':'s'}`;
}

function teamCard(team){
  if(!team){
    return `<div class="tc-empty-card"><div class="groups-feature-icon" aria-hidden="true">🔒</div><div><strong>Aucune Team</strong><span>Une Team est privée. Seuls ses responsables ajoutent les pilotes.</span></div><button type="button" class="primary-button" data-groups-create="team">Créer ma Team</button></div>`;
  }
  return `<article class="groups-feature-card team tc-main-card"><div class="groups-feature-icon" aria-hidden="true">🔒</div><div class="groups-feature-copy"><span>TEAM PRIVÉE</span><h2>${esc(team.name)}</h2><p>${esc(activityText(team))}</p></div><button type="button" class="secondary-button" data-group-detail="${team.id}">Ouvrir</button></article>`;
}

function communityCard(community){
  return `<article class="groups-community-card tc-community-card"><div class="groups-community-icon" aria-hidden="true">🌍</div><div><strong>${esc(community.name)}</strong><small>${esc(activityText(community))}</small></div><button type="button" class="secondary-button" data-group-detail="${community.id}">Ouvrir</button></article>`;
}

function renderOverview(message=''){
  const team=state.organizations.team;
  const communities=state.organizations.communities||[];
  app.innerHTML=`<div class="groups-page teams-communities-page">${pageHeading('TEAMS & COMMUNAUTÉS','Ta Team est privée. Les communautés sont ouvertes et tu peux en rejoindre plusieurs.')}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="tc-section"><div class="groups-section-heading"><div><span>MA TEAM</span><h2>${team?'Team privée':'Aucune Team'}</h2></div>${team?'<strong>1</strong>':''}</div>${teamCard(team)}</section>
    <section class="groups-section tc-section"><div class="groups-section-heading"><div><span>MES COMMUNAUTÉS</span><h2>Communautés rejointes</h2></div><strong>${communities.length}</strong></div>
      <div class="groups-community-grid">${communities.length?communities.map(communityCard).join(''):'<div class="groups-empty"><strong>Aucune communauté rejointe</strong><span>Tu peux rejoindre une communauté ouverte pour retrouver ses pilotes et ses équipages sur les mêmes endurances.</span></div>'}</div>
      <div class="tc-community-actions"><button type="button" class="primary-button" data-groups-discover>Rejoindre une communauté</button><button type="button" class="secondary-button" data-groups-create="community">Créer une communauté</button></div>
    </section>
    <section class="groups-how-it-works tc-simple-help"><strong>Comment ça marche ?</strong><span>Une endurance reste unique. Quand tu t’inscris, tu choisis simplement si ta disponibilité est visible en Général, dans ta Team et/ou dans tes communautés.</span></section>
  </div>`;
}

function renderDiscovery(message=''){
  const open=state.organizations.discoverableCommunities||[];
  app.innerHTML=`<div class="groups-page">${pageHeading('REJOINDRE UNE COMMUNAUTÉ','Les communautés sont ouvertes : tu peux les rejoindre librement.',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="groups-section groups-discovery"><label class="groups-search"><span>Rechercher une communauté</span><input type="search" data-community-search placeholder="Nom de la communauté" autocomplete="off"></label>
      <div class="groups-discovery-list" data-community-list>${open.length?open.map(community=>`<article class="groups-discovery-card" data-community-card data-community-name="${esc(community.name.toLocaleLowerCase('fr-FR'))}"><div class="groups-community-icon" aria-hidden="true">🌍</div><div><strong>${esc(community.name)}</strong><small>${community.memberCount} membre${community.memberCount===1?'':'s'}</small></div><button type="button" class="primary-button" data-organization-join="${community.id}">Rejoindre</button></article>`).join(''):'<div class="groups-empty"><strong>Aucune autre communauté disponible</strong><span>Tu as peut-être déjà rejoint toutes les communautés existantes.</span></div>'}</div>
      <button type="button" class="secondary-button groups-create-from-discovery" data-groups-create="community">Créer une communauté</button>
    </section>
  </div>`;
}

function renderCreate(message=''){
  if(createType!=='team'&&createType!=='community'){groupsView='overview';renderOverview();return;}
  const team=createType==='team';
  const hasTeam=!!state.organizations.team;
  if(team&&hasTeam){groupsView='overview';renderOverview('Tu as déjà une Team.');return;}
  app.innerHTML=`<div class="groups-page">${pageHeading(team?'CRÉER MA TEAM':'CRÉER UNE COMMUNAUTÉ',team?'Ta Team sera privée. Ses responsables choisissent les membres.':'Ta communauté sera ouverte et pourra être rejointe librement.',true)}${message?`<p class="creation-error" role="alert">${esc(message)}</p>`:''}
    <section class="groups-create-card"><div class="groups-type-icon" aria-hidden="true">${team?'🔒':'🌍'}</div><form data-organization-create="${createType}"><label><span>${team?'Nom de la Team':'Nom de la communauté'}</span><input name="organizationName" maxlength="60" required autofocus placeholder="${team?'Ex. FMT':'Ex. Endurance Community'}"></label><button type="submit" class="primary-button">${team?'Créer ma Team':'Créer la communauté'}</button></form></section>
  </div>`;
}

function memberList(group){
  const members=group.members||[];
  if(!members.length)return'<p class="groups-empty-line">Aucun membre.</p>';
  const canManage=['owner','manager'].includes(group.role);
  return `<div class="groups-member-list">${members.map(member=>`<div class="groups-member"><span><strong>${esc(member.name)}</strong><small>${esc(roleLabel(member.role))}</small></span>${canManage&&group.type==='team'&&member.role!=='owner'&&member.id!==state.user?.id?`<button type="button" class="secondary-button" data-organization-remove-member data-organization="${group.id}" data-user="${member.id}">Retirer</button>`:''}</div>`).join('')}</div>`;
}

function renderDetail(message=''){
  const group=groupById(detailId);
  if(!group){groupsView='overview';renderOverview('Ce groupe n’est plus disponible.');return;}
  const team=group.type==='team';
  const canManage=['owner','manager'].includes(group.role);
  const existing=new Set((group.members||[]).map(member=>member.id));
  const choices=(state.participants||[]).filter(participant=>!existing.has(participant.id));
  const activity=groupActivity(group.id);
  app.innerHTML=`<div class="groups-page">${pageHeading(group.name,team?'Team privée':'Communauté ouverte',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="groups-detail-card"><div class="groups-detail-head"><div><span class="groups-detail-kind">${team?'🔒 TEAM PRIVÉE':'🌍 COMMUNAUTÉ'}</span><h2>${esc(group.name)}</h2><p>${group.memberCount} membre${group.memberCount===1?'':'s'} · ${esc(roleLabel(group.role))}</p></div><button type="button" class="primary-button groups-open-events" data-space-events="${group.id}">Voir les endurances</button></div>
      <div class="space-detail-stats"><div><strong>${activity.events}</strong><span>Endurance${activity.events===1?'':'s'}</span></div><div><strong>${activity.pilots}</strong><span>Pilote${activity.pilots===1?'':'s'} actif${activity.pilots===1?'':'s'}</span></div><div><strong>${activity.crews}</strong><span>Équipage${activity.crews===1?'':'s'}</span></div></div>
      <div class="groups-section-heading compact"><div><span>MEMBRES</span><h3>${group.memberCount} pilote${group.memberCount===1?'':'s'}</h3></div></div>${memberList(group)}
      ${team&&canManage?`<form class="groups-add-member" data-organization-add-member="${group.id}"><label><span>Ajouter un pilote à la Team</span><select name="userId" required><option value="" selected disabled>Choisir un pilote Discord</option>${choices.map(participant=>`<option value="${participant.id}">${esc(participant.name)}</option>`).join('')}</select></label><button type="submit" class="secondary-button" ${choices.length?'':'disabled'}>Ajouter</button></form>`:''}
      ${group.role!=='owner'?`<button type="button" class="danger-button groups-leave" data-organization-leave="${group.id}">Quitter ${team?'la Team':'la communauté'}</button>`:''}
    </section>
  </div>`;
}

export function renderOrganizations(message=''){
  state.page='organizations';state.currentEventId=null;state.editingEvent=null;resetParticipationUi();
  if(groupsView==='discover')renderDiscovery(message);
  else if(groupsView==='create')renderCreate(message);
  else if(groupsView==='detail')renderDetail(message);
  else renderOverview(message);
  notifyRender();
}

async function reloadGroups(message=''){
  await load();
  state.visibleAudienceIds=normalizeAudienceFilter(state.organizations,state.visibleAudienceIds);
  persistFilter();
  renderNav();
  renderOrganizations(message);
}

async function run(action){
  if(busy)return;busy=true;
  try{await action();}
  catch(error){showError(error);}
  finally{busy=false;}
}

function applyAudienceFilter(ids){
  state.visibleAudienceIds=normalizeAudienceFilter(state.organizations,ids);
  persistFilter();resetParticipationUi();
  if(state.page==='event')renderEvent();
  else if(state.page==='home')renderHome();
}

function presetIds(name){
  if(name==='all')return allAudienceIds(state.organizations);
  if(name==='general')return new Set([GENERAL_AUDIENCE]);
  if(name==='team')return new Set([state.organizations.team?.id||GENERAL_AUDIENCE]);
  if(name==='communities'){
    const ids=new Set((state.organizations.communities||[]).map(item=>item.id));
    return ids.size?ids:new Set([GENERAL_AUDIENCE]);
  }
  return state.visibleAudienceIds;
}

document.addEventListener('click',event=>{
  const open=event.target.closest?.('[data-organizations-open]');
  if(open){event.preventDefault();groupsView='overview';createType='';detailId='';renderOrganizations();return;}
  const back=event.target.closest?.('[data-groups-back]');
  if(back){event.preventDefault();groupsView='overview';createType='';detailId='';renderOrganizations();return;}
  const discover=event.target.closest?.('[data-groups-discover]');
  if(discover){event.preventDefault();groupsView='discover';renderOrganizations();return;}
  const create=event.target.closest?.('[data-groups-create]');
  if(create){event.preventDefault();groupsView='create';createType=create.dataset.groupsCreate||'community';renderOrganizations();return;}
  const detail=event.target.closest?.('[data-group-detail]');
  if(detail){event.preventDefault();groupsView='detail';detailId=detail.dataset.groupDetail;renderOrganizations();return;}
  const groupEvents=event.target.closest?.('[data-space-events]');
  if(groupEvents){event.preventDefault();state.visibleAudienceIds=normalizeAudienceFilter(state.organizations,[groupEvents.dataset.spaceEvents]);persistFilter();resetParticipationUi();renderHome();return;}
  const preset=event.target.closest?.('[data-audience-preset]');
  if(preset){event.preventDefault();applyAudienceFilter(presetIds(preset.dataset.audiencePreset));return;}
  const join=event.target.closest?.('[data-organization-join]');
  if(join){event.preventDefault();void run(async()=>{const id=join.dataset.organizationJoin;await api(`/api/organizations/${id}/join`,'POST',{});await load();state.visibleAudienceIds.add(id);persistFilter();groupsView='overview';renderNav();renderOrganizations('Communauté rejointe.');});return;}
  const leave=event.target.closest?.('[data-organization-leave]');
  if(leave){event.preventDefault();if(!confirm('Quitter ce groupe ? Tes anciennes participations restent enregistrées.'))return;void run(async()=>{const id=leave.dataset.organizationLeave;await api(`/api/organizations/${id}/members/me`,'DELETE',{});state.visibleAudienceIds.delete(id);persistFilter();groupsView='overview';detailId='';await reloadGroups('Groupe quitté.');});return;}
  const remove=event.target.closest?.('[data-organization-remove-member]');
  if(remove){event.preventDefault();if(!confirm('Retirer ce pilote de la Team ?'))return;void run(async()=>{await api(`/api/organizations/${remove.dataset.organization}/members/${remove.dataset.user}`,'DELETE',{});await reloadGroups('Pilote retiré de la Team.');});}
});

document.addEventListener('submit',event=>{
  const create=event.target.closest?.('[data-organization-create]');
  if(create){event.preventDefault();void run(async()=>{const type=create.dataset.organizationCreate;const result=await api('/api/organizations','POST',{type,name:create.elements.organizationName.value.trim()});await load();state.visibleAudienceIds.add(result.id);persistFilter();groupsView='overview';createType='';renderNav();renderOrganizations(type==='team'?'Team créée.':'Communauté créée.');});return;}
  const add=event.target.closest?.('[data-organization-add-member]');
  if(add){event.preventDefault();void run(async()=>{await api(`/api/organizations/${add.dataset.organizationAddMember}/members`,'POST',{userId:add.elements.userId.value});await reloadGroups('Pilote ajouté à la Team.');});}
});

document.addEventListener('change',event=>{
  const field=event.target;
  if(!field?.matches?.('[data-audience-filter]'))return;
  const menu=field.closest('[data-audience-filter-menu]');
  const checked=[...(menu?.querySelectorAll('[data-audience-filter]:checked')||[])].map(input=>input.value);
  applyAudienceFilter(checked.length?checked:[GENERAL_AUDIENCE]);
});

document.addEventListener('input',event=>{
  const search=event.target.closest?.('[data-community-search]');
  if(!search)return;
  const query=search.value.normalize('NFKC').toLocaleLowerCase('fr-FR').trim();
  search.closest('.groups-discovery')?.querySelectorAll('[data-community-card]').forEach(card=>{card.hidden=!!query&&!String(card.dataset.communityName||'').includes(query);});
});
