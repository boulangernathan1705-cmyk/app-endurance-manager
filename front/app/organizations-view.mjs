import {app,state,api,esc,showError,load,notifyRender} from './core.mjs';
import {renderHome,renderNav} from './home-view.mjs?v=5-multi-filter';
import {renderEvent} from './event-view.mjs?v=11-multi-filter';
import {GENERAL_AUDIENCE,allAudienceIds,normalizeAudienceFilter} from './organization-context.mjs?v=2-multi-filter';

let busy=false;
let groupsView='overview';
let createType='';
let detailId='';

function roleLabel(role){return role==='owner'?'Créateur':role==='manager'?'Responsable':'Membre';}
function joinedGroups(){return [state.organizations.team,...(state.organizations.communities||[])].filter(Boolean);}
function groupById(id){return joinedGroups().find(item=>item.id===id)||null;}
function persistFilter(){try{localStorage.setItem('endurance_audience_filter',JSON.stringify([...state.visibleAudienceIds]));}catch{}}
function resetParticipationUi(){state.drafts={};state.registrationOpen.clear();state.crewManagementOpen.clear();state.pendingCrewJoin=null;}

function pageHeading(title,subtitle='',back=false){
  return `<div class="groups-page-heading">${back?'<button type="button" class="secondary-button groups-back" data-groups-back>← Retour</button>':''}<div><span class="creation-kicker">GROUPES</span><h1 class="page-title">${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>`;
}

function teamOverview(){
  const team=state.organizations.team;
  if(!team)return `<section class="groups-feature-card team"><div class="groups-feature-icon" aria-hidden="true">🔒</div><div class="groups-feature-copy"><span>MA TEAM</span><h2>Aucune Team</h2><p>Crée ton espace privé pour organiser tes pilotes et tes équipages. Un pilote ne peut appartenir qu’à une seule Team.</p></div><button type="button" class="primary-button" data-groups-create="team">Créer ma Team</button></section>`;
  return `<section class="groups-feature-card team"><div class="groups-feature-icon" aria-hidden="true">🔒</div><div class="groups-feature-copy"><span>MA TEAM</span><h2>${esc(team.name)}</h2><p>${team.memberCount} membre${team.memberCount===1?'':'s'} · ${esc(roleLabel(team.role))}</p></div><button type="button" class="secondary-button" data-group-detail="${team.id}">Gérer</button></section>`;
}

function communityOverviewCard(community){
  return `<article class="groups-community-card"><div class="groups-community-icon" aria-hidden="true">🌐</div><div><strong>${esc(community.name)}</strong><small>${community.memberCount} membre${community.memberCount===1?'':'s'} · ${esc(roleLabel(community.role))}</small></div><button type="button" class="secondary-button" data-group-detail="${community.id}">Ouvrir</button></article>`;
}

function renderOverview(message=''){
  const communities=state.organizations.communities||[];
  app.innerHTML=`<div class="groups-page">${pageHeading('MES GROUPES','Ta Team reste privée. Tu peux rejoindre autant de communautés que tu veux.')}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    ${teamOverview()}
    <section class="groups-section"><div class="groups-section-heading"><div><span>MES COMMUNAUTÉS</span><h2>Communautés rejointes</h2></div><strong>${communities.length}</strong></div>
      ${communities.length?`<div class="groups-community-grid">${communities.map(communityOverviewCard).join('')}</div>`:'<div class="groups-empty"><strong>Aucune communauté rejointe</strong><span>Découvre les communautés ouvertes pour organiser des endurances avec d’autres pilotes.</span></div>'}
    </section>
    <div class="groups-primary-actions"><button type="button" class="primary-button" data-groups-discover>Découvrir des communautés</button><button type="button" class="secondary-button" data-groups-create>+ Créer un groupe</button></div>
    <section class="groups-how-it-works"><strong>Comment ça fonctionne ?</strong><span>Les courses restent les événements officiels Endurance Manager. Les groupes servent à choisir avec qui partager tes disponibilités et former tes équipages.</span></section>
  </div>`;
}

function renderDiscovery(message=''){
  const open=state.organizations.discoverableCommunities||[];
  app.innerHTML=`<div class="groups-page">${pageHeading('DÉCOUVRIR','Rejoins librement une communauté. Elle apparaîtra ensuite dans tes filtres et dans tes inscriptions.',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="groups-section groups-discovery"><label class="groups-search"><span>Rechercher une communauté</span><input type="search" data-community-search placeholder="Nom de la communauté" autocomplete="off"></label>
      <div class="groups-discovery-list" data-community-list>${open.length?open.map(community=>`<article class="groups-discovery-card" data-community-card data-community-name="${esc(community.name.toLocaleLowerCase('fr-FR'))}"><div class="groups-community-icon" aria-hidden="true">🌐</div><div><strong>${esc(community.name)}</strong><small>${community.memberCount} membre${community.memberCount===1?'':'s'} · communauté ouverte</small></div><button type="button" class="primary-button" data-organization-join="${community.id}">Rejoindre</button></article>`).join(''):'<div class="groups-empty"><strong>Aucune communauté à découvrir</strong><span>Tu as peut-être déjà rejoint toutes les communautés disponibles.</span></div>'}</div>
    </section>
    <button type="button" class="secondary-button groups-create-from-discovery" data-groups-create="community">Créer une communauté</button>
  </div>`;
}

function renderCreate(message=''){
  const hasTeam=!!state.organizations.team;
  if(!createType){
    app.innerHTML=`<div class="groups-page">${pageHeading('CRÉER UN GROUPE','Choisis le type d’espace que tu veux créer.',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<div class="groups-type-grid">
      <button type="button" class="groups-type-card team" data-group-create-type="team" ${hasTeam?'disabled':''}><span class="groups-type-icon">🔒</span><strong>Team</strong><small>Espace privé, sur invitation. Une seule Team par pilote.</small>${hasTeam?'<em>Tu as déjà une Team</em>':''}</button>
      <button type="button" class="groups-type-card community" data-group-create-type="community"><span class="groups-type-icon">🌐</span><strong>Communauté</strong><small>Espace ouvert que tous les pilotes peuvent découvrir et rejoindre.</small></button>
    </div></div>`;
    return;
  }
  const team=createType==='team';
  app.innerHTML=`<div class="groups-page">${pageHeading(team?'CRÉER UNE TEAM':'CRÉER UNE COMMUNAUTÉ',team?'Ta Team sera privée et accessible uniquement aux pilotes que tu ajoutes.':'Ta communauté sera visible dans Découvrir et pourra être rejointe librement.',true)}${message?`<p class="creation-error" role="alert">${esc(message)}</p>`:''}
    <section class="groups-create-card"><div class="groups-type-icon" aria-hidden="true">${team?'🔒':'🌐'}</div><form data-organization-create="${createType}"><label><span>${team?'Nom de la Team':'Nom de la communauté'}</span><input name="organizationName" maxlength="60" required autofocus placeholder="${team?'Ex. FMT':'Ex. Endurance France'}"></label><button type="submit" class="primary-button">${team?'Créer ma Team':'Créer la communauté'}</button></form></section>
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
  app.innerHTML=`<div class="groups-page">${pageHeading(group.name,team?'Team privée':'Communauté ouverte',true)}${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}
    <section class="groups-detail-card"><div class="groups-detail-head"><div><span class="groups-detail-kind">${team?'🔒 TEAM PRIVÉE':'🌐 COMMUNAUTÉ'}</span><h2>${esc(group.name)}</h2><p>${group.memberCount} membre${group.memberCount===1?'':'s'} · ${esc(roleLabel(group.role))}</p></div></div>
      <div class="groups-detail-note">${team?'Les inscriptions et équipages partagés avec cette Team restent visibles uniquement par ses membres.':'Les membres peuvent partager leurs disponibilités avec cette communauté et former des équipages autour des mêmes événements officiels.'}</div>
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
  if(create){event.preventDefault();groupsView='create';createType=create.dataset.groupsCreate||'';renderOrganizations();return;}
  const type=event.target.closest?.('[data-group-create-type]');
  if(type){event.preventDefault();createType=type.dataset.groupCreateType;renderOrganizations();return;}
  const detail=event.target.closest?.('[data-group-detail]');
  if(detail){event.preventDefault();groupsView='detail';detailId=detail.dataset.groupDetail;renderOrganizations();return;}
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
