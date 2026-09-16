import {app,state,api,esc,showError,load,notifyRender} from './core.mjs';
import {renderHome,renderNav} from './home-view.mjs?v=6-spaces-hub';
import {renderEvent} from './event-view.mjs?v=11-multi-filter';
import {GENERAL_AUDIENCE,allAudienceIds,normalizeAudienceFilter,registrationAudienceIds} from './organization-context.mjs?v=2-multi-filter';

let busy=false;
let groupsView='overview';
let discoveryKind='community';
let createType='';
let detailId='';

function roleLabel(role){return role==='owner'?'Créateur':role==='manager'?'Responsable':'Membre';}
function joinedGroups(){return [state.organizations.team,...(state.organizations.communities||[])].filter(Boolean);}
function groupById(id){return joinedGroups().find(item=>item.id===id)||null;}
function persistFilter(){try{localStorage.setItem('endurance_audience_filter',JSON.stringify([...state.visibleAudienceIds]));}catch{}}
function resetParticipationUi(){state.drafts={};state.registrationOpen.clear();state.crewManagementOpen.clear();state.pendingCrewJoin=null;}

function groupActivity(spaceId){
  const eventIds=new Set();
  const pilotIds=new Set();
  let crews=0;
  for(const event of state.events||[]){
    let active=false;
    for(const departure of event.departures||[]){
      for(const registration of departure.availability||[]){
        if(registration.status==='unavailable'||!registrationAudienceIds(registration).includes(spaceId))continue;
        pilotIds.add(registration.participantId||registration.id);
        active=true;
      }
      const matching=(departure.crews||[]).filter(crew=>(crew.organizationId||GENERAL_AUDIENCE)===spaceId);
      crews+=matching.length;
      if(matching.length)active=true;
    }
    if(active)eventIds.add(event.id);
  }
  return {events:eventIds.size,pilots:pilotIds.size,crews};
}

function pageHeading(title,subtitle='',back=false){
  return `<div class="groups-page-heading">${back?'<button type="button" class="secondary-button groups-back" data-groups-back>← Retour</button>':''}<div><span class="creation-kicker">ESPACES</span><h1 class="page-title">${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>`;
}

function spaceTreeNode(group){
  const team=group.type==='team';
  const activity=groupActivity(group.id);
  return `<article class="space-tree-node ${team?'team':'community'}">
    <span class="space-tree-branch" aria-hidden="true"></span>
    <div class="groups-community-icon" aria-hidden="true">${team?'🔒':'🌍'}</div>
    <div class="space-tree-copy"><span>${team?'TEAM PRIVÉE':'COMMUNAUTÉ OUVERTE'}</span><strong>${esc(group.name)}</strong><small>${group.memberCount} membre${group.memberCount===1?'':'s'} · ${activity.events} endurance${activity.events===1?'':'s'} · ${activity.crews} équipage${activity.crews===1?'':'s'}</small></div>
    <button type="button" class="secondary-button" data-group-detail="${group.id}">Ouvrir</button>
  </article>`;
}

function emptyTeamNode(){
  return `<article class="space-tree-node team empty"><span class="space-tree-branch" aria-hidden="true"></span><div class="groups-community-icon" aria-hidden="true">🔒</div><div class="space-tree-copy"><span>TEAM PRIVÉE</span><strong>Aucune Team</strong><small>Crée ton espace fermé ou attends qu’un responsable t’ajoute.</small></div><button type="button" class="primary-button" data-groups-create="team">Créer</button></article>`;
}

function emptyCommunityNode(){
  return `<article class="space-tree-node community empty"><span class="space-tree-branch" aria-hidden="true"></span><div class="groups-community-icon" aria-hidden="true">🌍</div><div class="space-tree-copy"><span>COMMUNAUTÉS</span><strong>Aucune communauté rejointe</strong><small>Découvre les espaces ouverts de la communauté Endurance Manager.</small></div><button type="button" class="primary-button" data-groups-discover>Découvrir</button></article>`;
}

function renderOverview(message=''){
  const team=state.organizations.team;
  const communities=state.organizations.communities||[];
  app.innerHTML=`<div class="groups-page spaces-hub">${pageHeading('MES ESPACES','Ta Team est fermée. Les communautés sont ouvertes et tu peux en rejoindre plusieurs.')}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="space-tree" aria-label="Arborescence de mes espaces">
      <div class="space-tree-root"><div class="space-root-icon" aria-hidden="true">🏁</div><div><span>RACINE</span><strong>Endurance Manager</strong><small>Tes endurances, disponibilités et équipages au même endroit.</small></div></div>
      <div class="space-tree-children">
        ${team?spaceTreeNode(team):emptyTeamNode()}
        ${communities.length?communities.map(spaceTreeNode).join(''):emptyCommunityNode()}
      </div>
    </section>
    <section class="groups-section spaces-summary"><div class="groups-section-heading"><div><span>ORGANISATION</span><h2>Team + communautés</h2></div><strong>${(team?1:0)+communities.length}</strong></div>
      <div class="spaces-summary-grid"><div><strong>${team?'1':'0'}</strong><span>Team privée</span></div><div><strong>${communities.length}</strong><span>Communauté${communities.length===1?'':'s'} rejointe${communities.length===1?'':'s'}</span></div><div><strong>${joinedGroups().reduce((sum,group)=>sum+groupActivity(group.id).crews,0)}</strong><span>Équipages dans tes espaces</span></div></div>
    </section>
    <div class="groups-primary-actions"><button type="button" class="primary-button" data-groups-discover>Découvrir des espaces</button><button type="button" class="secondary-button" data-groups-create>+ Créer un espace</button></div>
    <section class="groups-how-it-works"><strong>Une seule endurance, plusieurs espaces</strong><span>Les événements restent uniques. Tu choisis simplement si ta disponibilité est partagée avec le Général, ta Team ou une communauté. Les équipages restent rattachés à un seul espace.</span></section>
  </div>`;
}

function renderCommunityDiscovery(){
  const open=state.organizations.discoverableCommunities||[];
  return `<section class="groups-section groups-discovery"><label class="groups-search"><span>Rechercher une communauté</span><input type="search" data-community-search placeholder="Nom de la communauté" autocomplete="off"></label>
    <div class="groups-discovery-list" data-community-list>${open.length?open.map(community=>`<article class="groups-discovery-card" data-community-card data-community-name="${esc(community.name.toLocaleLowerCase('fr-FR'))}"><div class="groups-community-icon" aria-hidden="true">🌍</div><div><strong>${esc(community.name)}</strong><small>${community.memberCount} membre${community.memberCount===1?'':'s'} · accès ouvert</small></div><button type="button" class="primary-button" data-organization-join="${community.id}">Rejoindre</button></article>`).join(''):'<div class="groups-empty"><strong>Aucune autre communauté à découvrir</strong><span>Tu as peut-être déjà rejoint toutes les communautés disponibles.</span></div>'}</div>
    <button type="button" class="secondary-button groups-create-from-discovery" data-groups-create="community">Créer une communauté</button>
  </section>`;
}

function renderTeamDiscovery(){
  const team=state.organizations.team;
  return `<section class="groups-section groups-discovery teams-discovery">
    <div class="team-discovery-lock"><span class="groups-type-icon" aria-hidden="true">🔒</span><div><strong>Les Teams sont fermées</strong><p>Contrairement aux communautés, une Team ne se rejoint pas librement. Un responsable doit ajouter le pilote à la Team.</p></div></div>
    ${team?`<article class="groups-discovery-card own-team"><div class="groups-community-icon" aria-hidden="true">🔒</div><div><strong>${esc(team.name)}</strong><small>Ta Team · ${team.memberCount} membre${team.memberCount===1?'':'s'}</small></div><button type="button" class="secondary-button" data-group-detail="${team.id}">Ouvrir</button></article>`:`<div class="groups-empty"><strong>Tu n’as pas encore de Team</strong><span>Crée ta Team privée ou demande à un responsable d’une Team existante de t’ajouter.</span></div><button type="button" class="primary-button groups-create-from-discovery" data-groups-create="team">Créer ma Team</button>`}
  </section>`;
}

function renderDiscovery(message=''){
  app.innerHTML=`<div class="groups-page">${pageHeading('DÉCOUVRIR','Communautés ouvertes et Teams privées utilisent le même moteur d’endurance, avec des règles d’accès différentes.',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <div class="space-discovery-tabs" role="tablist" aria-label="Type d’espace à découvrir"><button type="button" class="${discoveryKind==='community'?'active':''}" data-discovery-kind="community" role="tab" aria-selected="${discoveryKind==='community'}">🌍 Communautés</button><button type="button" class="${discoveryKind==='team'?'active':''}" data-discovery-kind="team" role="tab" aria-selected="${discoveryKind==='team'}">🔒 Teams</button></div>
    ${discoveryKind==='community'?renderCommunityDiscovery():renderTeamDiscovery()}
  </div>`;
}

function renderCreate(message=''){
  const hasTeam=!!state.organizations.team;
  if(!createType){
    app.innerHTML=`<div class="groups-page">${pageHeading('CRÉER UN ESPACE','Choisis le type d’espace que tu veux créer.',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<div class="groups-type-grid">
      <button type="button" class="groups-type-card team" data-group-create-type="team" ${hasTeam?'disabled':''}><span class="groups-type-icon">🔒</span><strong>Team</strong><small>Espace privé et fermé. Les responsables choisissent les membres.</small>${hasTeam?'<em>Tu as déjà une Team</em>':''}</button>
      <button type="button" class="groups-type-card community" data-group-create-type="community"><span class="groups-type-icon">🌍</span><strong>Communauté</strong><small>Espace ouvert que tous les pilotes connectés peuvent découvrir et rejoindre.</small></button>
    </div></div>`;
    return;
  }
  const team=createType==='team';
  app.innerHTML=`<div class="groups-page">${pageHeading(team?'CRÉER UNE TEAM':'CRÉER UNE COMMUNAUTÉ',team?'Ta Team sera privée et accessible uniquement aux pilotes ajoutés par ses responsables.':'Ta communauté sera visible dans Découvrir et pourra être rejointe librement.',true)}${message?`<p class="creation-error" role="alert">${esc(message)}</p>`:''}
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
  if(!group){groupsView='overview';renderOverview('Cet espace n’est plus disponible.');return;}
  const team=group.type==='team';
  const canManage=['owner','manager'].includes(group.role);
  const existing=new Set((group.members||[]).map(member=>member.id));
  const choices=(state.participants||[]).filter(participant=>!existing.has(participant.id));
  const activity=groupActivity(group.id);
  app.innerHTML=`<div class="groups-page">${pageHeading(group.name,team?'Team privée':'Communauté ouverte',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="groups-detail-card"><div class="groups-detail-head"><div><span class="groups-detail-kind">${team?'🔒 TEAM PRIVÉE':'🌍 COMMUNAUTÉ OUVERTE'}</span><h2>${esc(group.name)}</h2><p>${group.memberCount} membre${group.memberCount===1?'':'s'} · ${esc(roleLabel(group.role))}</p></div><button type="button" class="primary-button groups-open-events" data-space-events="${group.id}">Voir les endurances</button></div>
      <div class="space-detail-stats"><div><strong>${activity.events}</strong><span>Endurance${activity.events===1?'':'s'}</span></div><div><strong>${activity.pilots}</strong><span>Pilote${activity.pilots===1?'':'s'} actif${activity.pilots===1?'':'s'}</span></div><div><strong>${activity.crews}</strong><span>Équipage${activity.crews===1?'':'s'}</span></div></div>
      <div class="groups-detail-note">${team?'Les disponibilités et équipages partagés avec cette Team restent visibles uniquement par ses membres.':'Les membres peuvent partager leurs disponibilités avec cette communauté et former des équipages autour des mêmes événements officiels.'}</div>
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
  if(discover){event.preventDefault();groupsView='discover';discoveryKind='community';renderOrganizations();return;}
  const discoveryTab=event.target.closest?.('[data-discovery-kind]');
  if(discoveryTab){event.preventDefault();discoveryKind=discoveryTab.dataset.discoveryKind==='team'?'team':'community';renderOrganizations();return;}
  const create=event.target.closest?.('[data-groups-create]');
  if(create){event.preventDefault();groupsView='create';createType=create.dataset.groupsCreate||'';renderOrganizations();return;}
  const type=event.target.closest?.('[data-group-create-type]');
  if(type){event.preventDefault();createType=type.dataset.groupCreateType;renderOrganizations();return;}
  const detail=event.target.closest?.('[data-group-detail]');
  if(detail){event.preventDefault();groupsView='detail';detailId=detail.dataset.groupDetail;renderOrganizations();return;}
  const spaceEvents=event.target.closest?.('[data-space-events]');
  if(spaceEvents){event.preventDefault();state.visibleAudienceIds=normalizeAudienceFilter(state.organizations,[spaceEvents.dataset.spaceEvents]);persistFilter();resetParticipationUi();renderHome();return;}
  const preset=event.target.closest?.('[data-audience-preset]');
  if(preset){event.preventDefault();applyAudienceFilter(presetIds(preset.dataset.audiencePreset));return;}
  const join=event.target.closest?.('[data-organization-join]');
  if(join){event.preventDefault();void run(async()=>{const id=join.dataset.organizationJoin;await api(`/api/organizations/${id}/join`,'POST',{});await load();state.visibleAudienceIds.add(id);persistFilter();groupsView='overview';renderNav();renderOrganizations('Communauté rejointe.');});return;}
  const leave=event.target.closest?.('[data-organization-leave]');
  if(leave){event.preventDefault();if(!confirm('Quitter cet espace ? Tes anciennes participations restent enregistrées.'))return;void run(async()=>{const id=leave.dataset.organizationLeave;await api(`/api/organizations/${id}/members/me`,'DELETE',{});state.visibleAudienceIds.delete(id);persistFilter();groupsView='overview';detailId='';await reloadGroups('Espace quitté.');});return;}
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
