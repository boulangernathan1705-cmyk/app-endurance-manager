import {nav,state,api,load,showError,esc} from './core.mjs';
import {renderHome} from './home-view.mjs?v=7-paddock-pulse';
import {renderEvent} from './event-view.mjs?v=13-paddock-lens';
import {allAudienceIds,organizationById} from './organization-context.mjs?v=4-paddock-network';

const ui={open:false,busy:false,expandedId:null};
const joined=()=>[state.organizations?.team,...(state.organizations?.communities||[])].filter(Boolean);
const canManage=organization=>['owner','manager'].includes(organization?.role);
const roleLabel=role=>({owner:'Responsable',manager:'Manager',member:'Membre'}[role]||'Membre');

function resetScope(){
  state.activeOrganizationId=null;
  state.visibleAudienceIds=allAudienceIds(state.organizations||{});
  try{localStorage.removeItem('endurance_audience_filter');}catch{}
}
function scopeTo(value){
  if(value==='all'){resetScope();return;}
  if(value==='general'||!value){state.activeOrganizationId=null;state.visibleAudienceIds=new Set(['general']);return;}
  const organization=organizationById(state.organizations,value);
  if(!organization){resetScope();return;}
  state.activeOrganizationId=organization.id;
  state.visibleAudienceIds=new Set([organization.id]);
}
function ensureScopeStillValid(){
  if(!state.activeOrganizationId)return;
  if(!organizationById(state.organizations,state.activeOrganizationId))resetScope();
}

function ensureNavButton(){
  if(!nav)return;
  let button=nav.querySelector('[data-network-open]');
  if(!button){
    button=document.createElement('button');
    button.type='button';button.className='secondary-button network-nav-button';button.dataset.networkOpen='true';
    button.innerHTML='<span aria-hidden="true">◎</span><span>Mon réseau</span>';
    const switcher=nav.querySelector('.nav-game-switcher');
    if(switcher)switcher.before(button);else nav.append(button);
  }
}

function memberRows(organization){
  const manageable=canManage(organization);
  const rows=(organization.members||[]).map(member=>`<div class="network-member"><span class="network-avatar" aria-hidden="true">${esc((member.name||'?').slice(0,1).toUpperCase())}</span><span><strong>${esc(member.name)}</strong><small>${roleLabel(member.role)}</small></span>${manageable&&member.role!=='owner'&&member.id!==state.user?.id?`<button type="button" class="network-icon-button" data-network-action="remove-member" data-organization-id="${organization.id}" data-user-id="${member.id}" data-user-name="${esc(member.name)}" aria-label="Retirer ${esc(member.name)}">×</button>`:''}</div>`).join('');
  if(organization.type!=='team'||!manageable)return rows;
  const memberIds=new Set((organization.members||[]).map(member=>member.id));
  const candidates=(state.participants||[]).filter(participant=>!memberIds.has(participant.id));
  return `${rows}<form class="network-add-pilot" data-network-form="add-member" data-organization-id="${organization.id}"><select name="userId" aria-label="Ajouter un pilote" required><option value="">Ajouter un pilote…</option>${candidates.map(candidate=>`<option value="${candidate.id}">${esc(candidate.name)}</option>`).join('')}</select><button class="secondary-button" type="submit" ${candidates.length?'':'disabled'}>Ajouter</button></form>`;
}

function groupCard(organization){
  const expanded=ui.expandedId===organization.id;
  const icon=organization.type==='team'?'◆':'○';
  const label=organization.type==='team'?'Team privée':'Communauté';
  const leave=organization.type==='community'&&organization.role!=='owner'?`<button type="button" class="network-text-danger" data-network-action="leave" data-organization-id="${organization.id}">Quitter</button>`:'';
  return `<article class="network-group-card ${organization.type} ${expanded?'is-expanded':''}"><button type="button" class="network-group-main" data-network-action="toggle-group" data-organization-id="${organization.id}" aria-expanded="${expanded}"><span class="network-group-icon" aria-hidden="true">${icon}</span><span><small>${label}</small><strong>${esc(organization.name)}</strong><em>${organization.memberCount||organization.members?.length||0} membre${(organization.memberCount||organization.members?.length||0)>1?'s':''}</em></span><b aria-hidden="true">${expanded?'−':'+'}</b></button>${expanded?`<div class="network-group-detail"><div class="network-members">${memberRows(organization)||'<p>Aucun membre.</p>'}</div>${leave}</div>`:''}</article>`;
}

function drawerBody(){
  if(!state.user)return `<div class="network-empty"><strong>Ton réseau se construit avec ton compte Discord</strong><p>Connecte-toi pour retrouver ta Team, rejoindre des communautés et partager tes disponibilités avec elles.</p></div>`;
  const team=state.organizations?.team;
  const communities=state.organizations?.communities||[];
  const discoverable=state.organizations?.discoverableCommunities||[];
  const teamBlock=team?groupCard(team):`<form class="network-create-inline" data-network-form="create" data-type="team"><span class="network-group-icon" aria-hidden="true">◆</span><div><small>TEAM PRIVÉE</small><strong>Créer ma Team</strong><p>Un seul groupe fixe pour tes coéquipiers habituels.</p><label><span>Nom</span><input name="name" maxlength="60" required placeholder="Ex. FMT"></label><button type="submit" class="primary-button">Créer</button></div></form>`;
  const communityRows=communities.length?communities.map(groupCard).join(''):`<div class="network-empty compact"><strong>Aucune communauté rejointe</strong><p>Les communautés servent à élargir ton vivier de pilotes sans changer de Team.</p></div>`;
  const discovery=discoverable.length?discoverable.map(community=>`<article class="network-discovery-card"><span class="network-group-icon" aria-hidden="true">○</span><span><strong>${esc(community.name)}</strong><small>${community.memberCount||0} membres</small></span><button type="button" class="secondary-button" data-network-action="join" data-organization-id="${community.id}">Rejoindre</button></article>`).join(''):`<div class="network-empty compact"><p>Aucune autre communauté ouverte pour le moment.</p></div>`;
  return `<section class="network-section"><div class="network-section-title"><span>ANCRAGE</span><strong>Ma Team</strong></div>${teamBlock}</section><section class="network-section"><div class="network-section-title"><span>RÉSEAU</span><strong>Mes communautés</strong></div>${communityRows}</section><section class="network-section network-discovery"><div class="network-section-title"><span>OUVERT</span><strong>Découvrir</strong></div>${discovery}<details class="network-create-community"><summary>Créer une communauté</summary><form data-network-form="create" data-type="community"><label><span>Nom de la communauté</span><input name="name" maxlength="60" required placeholder="Ex. Endurance France"></label><button type="submit" class="primary-button">Créer la communauté</button></form></details></section>`;
}

function renderDrawer(){
  document.querySelector('[data-network-drawer]')?.remove();
  document.body.classList.toggle('network-drawer-open',ui.open);
  if(!ui.open)return;
  const overlay=document.createElement('div');overlay.className='network-drawer-backdrop';overlay.dataset.networkDrawer='true';
  overlay.innerHTML=`<aside class="network-drawer" role="dialog" aria-modal="true" aria-labelledby="network-drawer-title"><header><div><span>MON RÉSEAU</span><h2 id="network-drawer-title">Les gens avec qui je peux courir</h2><p>Ta Team est ton noyau fixe. Les communautés agrandissent simplement le paddock disponible autour des mêmes endurances.</p></div><button type="button" class="network-close" data-network-action="close" aria-label="Fermer">×</button></header><div class="network-drawer-scroll">${drawerBody()}</div></aside>`;
  document.body.append(overlay);
}

async function reload(){
  await load();ensureScopeStillValid();ensureNavButton();renderDrawer();
  if(state.page==='event')renderEvent();else if(state.page==='home')renderHome();
}

async function act(target){
  const action=target.dataset.networkAction;
  if(action==='close'){ui.open=false;renderDrawer();return;}
  if(action==='toggle-group'){ui.expandedId=ui.expandedId===target.dataset.organizationId?null:target.dataset.organizationId;renderDrawer();return;}
  if(action==='join'){await api(`/api/organizations/${target.dataset.organizationId}/join`,'POST');await reload();return;}
  if(action==='leave'){if(!confirm('Quitter cette communauté ?'))return;await api(`/api/organizations/${target.dataset.organizationId}/members/me`,'DELETE');ui.expandedId=null;await reload();return;}
  if(action==='remove-member'){if(!confirm(`Retirer ${target.dataset.userName||'ce pilote'} de la Team ?`))return;await api(`/api/organizations/${target.dataset.organizationId}/members/${target.dataset.userId}`,'DELETE');await reload();}
}

document.addEventListener('endurance:nav',ensureNavButton);
document.addEventListener('endurance:render',ensureNavButton);
document.addEventListener('click',event=>{
  const core=event.target.closest?.('[data-action="home"],[data-action="my-entries"]');
  if(core)resetScope();
},true);
document.addEventListener('click',async event=>{
  const open=event.target.closest?.('[data-network-open]');
  if(open){event.preventDefault();ui.open=true;renderDrawer();return;}
  const scope=event.target.closest?.('[data-paddock-scope]');
  if(scope){event.preventDefault();scopeTo(scope.dataset.paddockScope);renderEvent();return;}
  const eventTarget=event.target.closest?.('[data-network-event]');
  if(eventTarget){event.preventDefault();scopeTo(eventTarget.dataset.organizationId||'all');state.currentEventId=eventTarget.dataset.eventId;state.selectedDepartureId=eventTarget.dataset.departureId||null;state.registrationOpen.clear();state.drafts={};renderEvent();return;}
  const target=event.target.closest?.('[data-network-action]');
  if(!target||target.disabled)return;event.preventDefault();if(ui.busy)return;ui.busy=true;target.disabled=true;
  try{await act(target);}catch(error){showError(error);}finally{ui.busy=false;if(target.isConnected)target.disabled=false;}
});
document.addEventListener('click',event=>{if(event.target.matches?.('[data-network-drawer]')){ui.open=false;renderDrawer();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&ui.open){ui.open=false;renderDrawer();}});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches?.('[data-network-form]'))return;event.preventDefault();if(ui.busy)return;ui.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  try{
    if(form.dataset.networkForm==='create'){const result=await api('/api/organizations','POST',{type:form.dataset.type,name:form.elements.name.value.trim()});await load();ui.expandedId=result.id;renderDrawer();if(state.page==='home')renderHome();}
    if(form.dataset.networkForm==='add-member'){await api(`/api/organizations/${form.dataset.organizationId}/members`,'POST',{userId:form.elements.userId.value});await reload();}
  }catch(error){showError(error);}finally{ui.busy=false;if(submit?.isConnected)submit.disabled=false;}
});
queueMicrotask(()=>{ensureNavButton();resetScope();});
