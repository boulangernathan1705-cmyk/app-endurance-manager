import {app,state,api,esc,showError,load,notifyRender} from './core.mjs';
import {renderHome,renderNav} from './home-view.mjs?v=4-organizations';
import {renderEvent} from './event-view.mjs?v=10-organizations';
import {defaultOrganizationId,hasOrganization,organizationShortLabel} from './organization-context.mjs?v=1';

let busy=false;

function roleLabel(role){return role==='owner'?'Créateur':role==='manager'?'Responsable':'Membre';}
function persistContext(){try{localStorage.setItem('endurance_organization_context',state.selectedOrganizationId||'general');}catch{}}
function ensureSelectedContext(){
  if(hasOrganization(state.organizations,state.selectedOrganizationId))return;
  state.selectedOrganizationId=defaultOrganizationId(state.organizations);
  persistContext();
}

function memberList(organization){
  const members=organization?.members||[];
  if(!members.length)return'<p class="organization-empty">Aucun membre.</p>';
  const canManage=['owner','manager'].includes(organization.role);
  return `<div class="organization-member-list">${members.map(member=>`<div class="organization-member"><span><strong>${esc(member.name)}</strong><small>${esc(roleLabel(member.role))}</small></span>${canManage&&member.role!=='owner'&&member.id!==state.user?.id?`<button type="button" class="secondary-button" data-organization-remove-member data-organization="${organization.id}" data-user="${member.id}">Retirer</button>`:''}</div>`).join('')}</div>`;
}

function teamCard(){
  const team=state.organizations.team;
  if(!team)return `<section class="organization-card organization-card-team"><div class="organization-card-head"><div><span class="organization-kind">TEAM PRIVÉE</span><h2>Créer ma Team</h2></div><span class="organization-private-badge">🔒 privée</span></div><p>Une Team est fermée et invisible pour les pilotes extérieurs. Un pilote ne peut appartenir qu’à une seule Team.</p><form class="organization-inline-form" data-organization-create="team"><label><span>Nom de la Team</span><input name="organizationName" maxlength="60" required placeholder="Ex. FMT"></label><button type="submit" class="primary-button">Créer la Team</button></form></section>`;
  const canManage=['owner','manager'].includes(team.role);
  const existing=new Set((team.members||[]).map(member=>member.id));
  const choices=(state.participants||[]).filter(participant=>!existing.has(participant.id));
  return `<section class="organization-card organization-card-team"><div class="organization-card-head"><div><span class="organization-kind">MA TEAM</span><h2>🔒 ${esc(team.name)}</h2><small>${team.memberCount} membre${team.memberCount===1?'':'s'} · ${esc(roleLabel(team.role))}</small></div><span class="organization-private-badge">Privée</span></div><p>Les inscriptions et équipages de cette Team ne sont visibles que par ses membres.</p>${memberList(team)}${canManage?`<form class="organization-inline-form organization-member-form" data-organization-add-member="${team.id}"><label><span>Ajouter un pilote</span><select name="userId" required><option value="" selected disabled>Choisir un pilote Discord</option>${choices.map(participant=>`<option value="${participant.id}">${esc(participant.name)}</option>`).join('')}</select></label><button type="submit" class="secondary-button" ${choices.length?'':'disabled'}>Ajouter à la Team</button></form>`:''}${team.role!=='owner'?`<button type="button" class="danger-button organization-leave" data-organization-leave="${team.id}">Quitter la Team</button>`:''}</section>`;
}

function joinedCommunityCard(community){
  return `<article class="organization-community"><div><span class="organization-kind">COMMUNAUTÉ</span><h3>🌐 ${esc(community.name)}</h3><small>${community.memberCount} membre${community.memberCount===1?'':'s'} · ${esc(roleLabel(community.role))}</small></div>${community.role!=='owner'?`<button type="button" class="secondary-button" data-organization-leave="${community.id}">Quitter</button>`:'<span class="organization-owner-badge">Créateur</span>'}</article>`;
}

function discoverableCommunityCard(community){
  return `<article class="organization-community is-open"><div><span class="organization-kind">OUVERTE</span><h3>🌐 ${esc(community.name)}</h3><small>${community.memberCount} membre${community.memberCount===1?'':'s'}</small></div><button type="button" class="primary-button" data-organization-join="${community.id}">Rejoindre</button></article>`;
}

export function renderOrganizations(message=''){
  state.page='organizations';state.currentEventId=null;state.editingEvent=null;state.drafts={};state.registrationOpen.clear();state.crewManagementOpen.clear();
  const joined=state.organizations.communities||[],open=state.organizations.discoverableCommunities||[];
  app.innerHTML=`<div class="organizations-page"><div class="organizations-heading"><div><span class="creation-kicker">ORGANISATION</span><h1 class="page-title">TEAM & COMMUNAUTÉS</h1></div><span class="organization-current-context">Contexte actuel : <strong>${esc(organizationShortLabel(state.organizations,state.selectedOrganizationId))}</strong></span></div>${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}<section class="organization-explainer"><div><strong>🔒 Team</strong><p>Une seule par pilote. Espace privé pour organiser les équipages sans les montrer aux personnes extérieures.</p></div><div><strong>🌐 Communautés</strong><p>Tu peux en rejoindre plusieurs. Elles sont ouvertes et permettent d’organiser une endurance avec d’autres pilotes.</p></div><div><strong>🏁 Événements officiels</strong><p>Les événements restent créés par Endurance Manager. Team et communautés utilisent les mêmes courses et horaires officiels.</p></div></section>${teamCard()}<section class="organization-card"><div class="organization-card-head"><div><span class="organization-kind">MES COMMUNAUTÉS</span><h2>Communautés rejointes</h2></div><span>${joined.length}</span></div>${joined.length?`<div class="organization-community-list">${joined.map(joinedCommunityCard).join('')}</div>`:'<p class="organization-empty">Tu n’as encore rejoint aucune communauté.</p>'}</section><section class="organization-card"><div class="organization-card-head"><div><span class="organization-kind">COMMUNAUTÉS OUVERTES</span><h2>Découvrir</h2></div></div>${open.length?`<div class="organization-community-list">${open.map(discoverableCommunityCard).join('')}</div>`:'<p class="organization-empty">Aucune autre communauté ouverte pour le moment.</p>'}<form class="organization-inline-form" data-organization-create="community"><label><span>Créer une communauté</span><input name="organizationName" maxlength="60" required placeholder="Ex. Endurance France"></label><button type="submit" class="secondary-button">Créer</button></form></section></div>`;
  notifyRender();
}

async function refreshOrganizations(message=''){
  await load();
  ensureSelectedContext();
  renderNav();
  renderOrganizations(message);
}

function resetParticipationUi(){
  state.drafts={};state.registrationOpen.clear();state.crewManagementOpen.clear();state.pendingCrewJoin=null;
}

async function run(action){
  if(busy)return;busy=true;
  try{await action();}
  catch(error){showError(error);}
  finally{busy=false;}
}

document.addEventListener('click',event=>{
  const open=event.target.closest?.('[data-organizations-open]');
  if(open){event.preventDefault();renderOrganizations();return;}
  const join=event.target.closest?.('[data-organization-join]');
  if(join){event.preventDefault();void run(async()=>{await api(`/api/organizations/${join.dataset.organizationJoin}/join`,'POST',{});state.selectedOrganizationId=join.dataset.organizationJoin;persistContext();await refreshOrganizations('Communauté rejointe.');});return;}
  const leave=event.target.closest?.('[data-organization-leave]');
  if(leave){event.preventDefault();if(!confirm('Quitter cette organisation ? Tes anciennes participations restent rattachées à cet espace.'))return;void run(async()=>{await api(`/api/organizations/${leave.dataset.organizationLeave}/members/me`,'DELETE',{});if(state.selectedOrganizationId===leave.dataset.organizationLeave){state.selectedOrganizationId=null;persistContext();}await refreshOrganizations('Organisation quittée.');});return;}
  const remove=event.target.closest?.('[data-organization-remove-member]');
  if(remove){event.preventDefault();if(!confirm('Retirer ce pilote de la Team ?'))return;void run(async()=>{await api(`/api/organizations/${remove.dataset.organization}/members/${remove.dataset.user}`,'DELETE',{});await refreshOrganizations('Pilote retiré de la Team.');});}
});

document.addEventListener('submit',event=>{
  const create=event.target.closest?.('[data-organization-create]');
  if(create){event.preventDefault();void run(async()=>{const result=await api('/api/organizations','POST',{type:create.dataset.organizationCreate,name:create.elements.organizationName.value.trim()});state.selectedOrganizationId=result.id;persistContext();await refreshOrganizations(create.dataset.organizationCreate==='team'?'Team créée.':'Communauté créée.');});return;}
  const add=event.target.closest?.('[data-organization-add-member]');
  if(add){event.preventDefault();void run(async()=>{await api(`/api/organizations/${add.dataset.organizationAddMember}/members`,'POST',{userId:add.elements.userId.value});await refreshOrganizations('Pilote ajouté à la Team.');});}
});

document.addEventListener('change',event=>{
  const select=event.target;
  if(select?.name!=='organizationContext')return;
  state.selectedOrganizationId=select.value||null;persistContext();resetParticipationUi();
  if(state.page==='event')renderEvent();else if(state.page==='home')renderHome();
});
