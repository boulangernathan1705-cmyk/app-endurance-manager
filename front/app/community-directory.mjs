import {app,state,api,load,showError,esc,dateLabel,notifyRender} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=14-community-directory';

const ui={search:'',game:'all',creating:false,discord:new Map(),eligibility:new Map(),busy:false};
const communities=()=>[...(state.organizations?.communities||[]),...(state.organizations?.discoverableCommunities||[])];
const byId=id=>communities().find(item=>item.id===id)||null;
const canManage=community=>['owner','manager'].includes(community?.role);
const initials=name=>String(name||'EM').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const accessLabel=mode=>({open:'Ouverte',request:'Sur demande',invite:'Sur invitation',discord:'Discord vérifié'}[mode]||'Ouverte');
const roleLabel=role=>({owner:'Responsable',manager:'Manager',member:'Membre'}[role]||'Membre');
const gameLabel=game=>game==='lmu'?'Le Mans Ultimate':'iRacing';

function upcomingEvents(community){
  const ids=new Set(community?.eventIds||[]),now=Date.now();
  return state.events.filter(event=>ids.has(event.id)).map(event=>({event,next:(event.departures||[]).filter(d=>Number(d.startsAt)>now).sort((a,b)=>a.startsAt-b.startsAt)[0]})).filter(item=>item.next).sort((a,b)=>a.next.startsAt-b.next.startsAt);
}
function tagRow(community){
  const discord=community.discord||{};
  return `<div class="community-tags">${(community.games||[]).map(game=>`<span>${esc(gameLabel(game))}</span>`).join('')}<span>${community.language==='en'?'English':'Français'}</span><span>${esc(accessLabel(community.joinMode))}</span>${discord.linked?`<span>Discord · ${esc(discord.guildName||'lié')}</span>`:'<span>Endurance Manager</span>'}${discord.requiredRoleName?`<span>Rôle ${esc(discord.requiredRoleName)}</span>`:''}</div>`;
}
function communityCard(community){
  const joined=Boolean(community.role);
  return `<article class="community-card ${joined?'is-joined':''}"><button type="button" class="community-card-main" data-community-action="open" data-id="${community.id}"><span class="community-mark" aria-hidden="true">${esc(initials(community.name))}</span><span class="community-card-copy"><small>${joined?'MA COMMUNAUTÉ':'À DÉCOUVRIR'}</small><strong>${esc(community.name)}</strong><em>${Number(community.memberCount)||0} membre${Number(community.memberCount)===1?'':'s'}</em><p>${esc(community.description||'Communauté simracing endurance sur Endurance Manager.')}</p>${tagRow(community)}</span><b aria-hidden="true">›</b></button></article>`;
}
function filteredDiscoverable(){
  const source=state.organizations?.discoverableCommunities||[];
  const q=ui.search.trim().toLocaleLowerCase('fr-FR');
  return source.filter(item=>(!q||`${item.name} ${item.description||''}`.toLocaleLowerCase('fr-FR').includes(q))&&(ui.game==='all'||(item.games||[]).includes(ui.game)));
}
function createPanel(){
  if(!ui.creating)return '<button type="button" class="primary-button community-create-trigger" data-community-action="toggle-create">+ Créer une communauté</button>';
  return `<section class="community-create-panel"><div class="community-section-heading"><div><small>NOUVEL ESPACE</small><h2>Créer une communauté</h2><p>Discord est facultatif. Tu pourras le connecter ensuite si ta communauté en a besoin.</p></div><button type="button" class="community-close" data-community-action="toggle-create" aria-label="Fermer">×</button></div><form data-community-form="create" class="community-form"><label><span>Nom</span><input name="name" maxlength="60" required></label><label class="community-form-wide"><span>Présentation</span><textarea name="description" maxlength="600" rows="3" placeholder="Explique en quelques lignes qui vous êtes et le type d’endurances organisées."></textarea></label><fieldset><legend>Simulateurs</legend><label><input type="checkbox" name="games" value="lmu" checked> Le Mans Ultimate</label><label><input type="checkbox" name="games" value="iracing"> iRacing</label></fieldset><label><span>Langue</span><select name="language"><option value="fr">Français</option><option value="en">English</option></select></label><label><span>Accès</span><select name="joinMode"><option value="open">Ouverte</option><option value="request">Sur demande</option><option value="invite">Sur invitation</option></select></label><label><span>Visibilité</span><select name="visibility"><option value="public">Visible dans l’annuaire</option><option value="private">Privée</option></select></label><div class="community-form-actions"><button class="primary-button" type="submit">Créer la communauté</button><button class="secondary-button" type="button" data-community-action="toggle-create">Annuler</button></div></form></section>`;
}
function directory(){
  const joined=state.organizations?.communities||[],found=filteredDiscoverable();
  return `<section class="community-directory-hero"><div><small>COMMUNAUTÉS</small><h1>Trouve ton paddock</h1><p>Rejoins une communauté pour retrouver ses pilotes et ses endurances. Une communauté peut vivre entièrement sur Endurance Manager ou utiliser Discord pour vérifier ses membres et ses rôles.</p></div>${state.user?createPanel():'<div class="community-login-note">Connecte-toi avec Discord pour rejoindre ou créer une communauté.</div>'}</section>${joined.length?`<section class="community-directory-section"><div class="community-section-heading"><div><small>MES COMMUNAUTÉS</small><h2>Mes espaces</h2></div><span>${joined.length}</span></div><div class="community-grid">${joined.map(communityCard).join('')}</div></section>`:''}<section class="community-directory-section"><div class="community-section-heading"><div><small>DÉCOUVRIR</small><h2>Communautés disponibles</h2><p>Explore les communautés publiques sans obligation de passer par Discord.</p></div></div><div class="community-discovery-tools"><label><span>Rechercher</span><input type="search" value="${esc(ui.search)}" data-community-filter="search" placeholder="Nom ou description"></label><label><span>Simulateur</span><select data-community-filter="game"><option value="all" ${ui.game==='all'?'selected':''}>Tous</option><option value="lmu" ${ui.game==='lmu'?'selected':''}>Le Mans Ultimate</option><option value="iracing" ${ui.game==='iracing'?'selected':''}>iRacing</option></select></label></div>${found.length?`<div class="community-grid">${found.map(communityCard).join('')}</div>`:'<div class="community-empty">Aucune communauté ne correspond à ces critères.</div>'}</section>`;
}
function memberList(community){
  const manageable=canManage(community),members=community.members||[];
  return `<div class="community-members">${members.length?members.map(member=>`<div class="community-member"><span class="community-member-avatar">${esc(initials(member.name))}</span><span><strong>${esc(member.name)}</strong><small>${esc(roleLabel(member.role))}</small></span>${manageable&&member.role!=='owner'&&member.id!==state.user?.id?`<button type="button" data-community-action="remove-member" data-id="${community.id}" data-user-id="${member.id}" data-user-name="${esc(member.name)}" aria-label="Retirer ${esc(member.name)}">×</button>`:''}</div>`).join(''):'<p>Aucun membre.</p>'}</div>`;
}
function requestList(community){
  if(!canManage(community)||!(community.joinRequests||[]).length)return'';
  return `<section class="community-detail-block"><div class="community-block-title"><small>DEMANDES</small><h2>Adhésions en attente</h2></div><div class="community-request-list">${community.joinRequests.map(item=>`<div><span><strong>${esc(item.name)}</strong><small>Souhaite rejoindre la communauté</small></span><button class="secondary-button" data-community-action="request" data-decision="approve" data-id="${community.id}" data-user-id="${item.id}">Accepter</button><button class="community-danger-quiet" data-community-action="request" data-decision="deny" data-id="${community.id}" data-user-id="${item.id}">Refuser</button></div>`).join('')}</div></section>`;
}
function eventList(community){
  const events=upcomingEvents(community);
  return `<section class="community-detail-block"><div class="community-block-title"><small>ENDURANCES</small><h2>À venir</h2></div>${events.length?`<div class="community-event-list">${events.map(({event,next})=>`<button type="button" data-community-action="event" data-id="${community.id}" data-event-id="${event.id}" data-departure-id="${next.id}"><span><strong>${esc(event.name)}</strong><small>${esc(dateLabel(next))} · ${(event.categories||[]).map(esc).join(' · ')}</small></span><b>›</b></button>`).join('')}</div>`:'<div class="community-empty compact">Aucune endurance à venir n’est encore liée à cette communauté.</div>'}</section>`;
}
function joinAction(community){
  if(community.role)return community.role==='owner'?'<span class="community-status-pill">Responsable</span>':`<button class="secondary-button" data-community-action="leave" data-id="${community.id}">Quitter</button>`;
  if(community.joinPending)return'<span class="community-status-pill">Demande envoyée</span>';
  if(!state.user)return'<span class="community-status-pill">Connexion requise</span>';
  if(community.joinMode==='invite')return'<span class="community-status-pill">Sur invitation</span>';
  return `<button class="primary-button" data-community-action="join" data-id="${community.id}">${community.joinMode==='request'?'Demander à rejoindre':'Rejoindre la communauté'}</button>`;
}
function eligibilityBlock(community){
  if(!community.role||!community.discord?.linked)return'';
  const status=ui.eligibility.get(community.id);
  const role=community.discord.requiredRoleName;
  if(!status)return `<div class="community-eligibility"><span>Discord lié${role?` · rôle ${esc(role)} requis pour courir`:''}</span><button class="secondary-button" data-community-action="eligibility" data-id="${community.id}">Vérifier mon statut</button></div>`;
  const ok=status.available&&status.member&&(!status.roleRequired||status.eligible);
  return `<div class="community-eligibility ${ok?'is-ok':'is-blocked'}"><strong>${ok?'✓ Éligible aux endurances':'Accès course non validé'}</strong><span>${!status.available?'Vérification Discord indisponible.':!status.member?'Tu ne fais pas partie du serveur Discord.':status.roleRequired&&!status.eligible?`Le rôle ${esc(status.requiredRoleName||role||'requis')} manque sur Discord.`:'Ton statut Discord est à jour.'}</span><button class="secondary-button" data-community-action="eligibility" data-id="${community.id}">Actualiser</button></div>`;
}
function settings(community){
  if(!canManage(community))return'';
  const probe=ui.discord.get(community.id),discord=community.discord||{};
  const joinOptions=['open','request','invite',...(discord.linked?['discord']:[])];
  return `<details class="community-settings"><summary>Administration de la communauté</summary><div class="community-settings-body"><form data-community-form="settings" data-id="${community.id}" class="community-form"><label><span>Nom</span><input name="name" maxlength="60" value="${esc(community.name)}" required></label><label class="community-form-wide"><span>Présentation</span><textarea name="description" maxlength="600" rows="4">${esc(community.description||'')}</textarea></label><fieldset><legend>Simulateurs</legend><label><input type="checkbox" name="games" value="lmu" ${(community.games||[]).includes('lmu')?'checked':''}> Le Mans Ultimate</label><label><input type="checkbox" name="games" value="iracing" ${(community.games||[]).includes('iracing')?'checked':''}> iRacing</label></fieldset><label><span>Langue</span><select name="language"><option value="fr" ${community.language==='fr'?'selected':''}>Français</option><option value="en" ${community.language==='en'?'selected':''}>English</option></select></label><label><span>Accès</span><select name="joinMode">${joinOptions.map(mode=>`<option value="${mode}" ${community.joinMode===mode?'selected':''}>${esc(accessLabel(mode))}</option>`).join('')}</select></label><label><span>Visibilité</span><select name="visibility"><option value="public" ${community.visibility==='public'?'selected':''}>Visible dans l’annuaire</option><option value="private" ${community.visibility==='private'?'selected':''}>Privée</option></select></label><div class="community-form-actions"><button class="primary-button" type="submit">Enregistrer</button></div></form><div class="community-discord-settings"><div class="community-block-title"><small>DISCORD · FACULTATIF</small><h3>${discord.linked?'Serveur lié':'Connecter un serveur'}</h3><p>Le site ne synchronise pas tous les membres : il vérifie uniquement le compte du pilote lorsqu’une règle Discord doit être appliquée.</p></div>${state.organizations?.discordBotInviteUrl?`<a class="secondary-button community-external" href="${esc(state.organizations.discordBotInviteUrl)}" target="_blank" rel="noopener">Ajouter le bot au serveur</a>`:''}<form data-community-form="discord-probe" data-id="${community.id}" class="community-discord-probe"><label><span>ID du serveur Discord</span><input name="guildId" inputmode="numeric" pattern="\\d{15,22}" value="${esc(discord.guildId||'')}" placeholder="123456789012345678" required></label><button class="secondary-button" type="submit">Vérifier le serveur</button></form>${probe?`<form data-community-form="discord-save" data-id="${community.id}" data-guild-id="${probe.id}" class="community-discord-save"><strong>${esc(probe.name)}</strong><label><span>Rôle requis pour participer aux endurances</span><select name="roleId"><option value="">Aucun rôle requis</option>${(probe.roles||[]).map(role=>`<option value="${role.id}" ${role.id===discord.requiredRoleId?'selected':''}>${esc(role.name)}</option>`).join('')}</select></label><button class="primary-button" type="submit">Lier ce serveur</button></form>`:''}${discord.linked?`<div class="community-discord-linked"><span><strong>${esc(discord.guildName)}</strong><small>${discord.requiredRoleName?`Rôle course : ${esc(discord.requiredRoleName)}`:'Aucun rôle course requis'}</small></span><button class="community-danger-quiet" type="button" data-community-action="unlink-discord" data-id="${community.id}">Délier Discord</button></div>`:''}</div></div></details>`;
}
function detail(community){
  return `<button type="button" class="community-back" data-community-action="back">← Toutes les communautés</button><section class="community-profile-hero"><span class="community-mark large">${esc(initials(community.name))}</span><div><small>COMMUNAUTÉ</small><h1>${esc(community.name)}</h1><p>${esc(community.description||'Cette communauté n’a pas encore ajouté de présentation.')}</p>${tagRow(community)}</div><div class="community-profile-actions">${joinAction(community)}</div></section>${eligibilityBlock(community)}<div class="community-detail-grid"><div>${eventList(community)}${requestList(community)}</div><aside><section class="community-detail-block"><div class="community-block-title"><small>MEMBRES</small><h2>${Number(community.memberCount)||0} membre${Number(community.memberCount)===1?'':'s'}</h2></div>${community.role?memberList(community):'<p class="community-muted">Rejoins la communauté pour accéder à son espace membres.</p>'}</section>${settings(community)}</aside></div>`;
}

export function renderCommunities(id=state.currentOrganizationId){
  state.page='communities';state.currentEventId=null;state.currentOrganizationId=id||null;
  const community=id?byId(id):null;
  if(id&&!community)state.currentOrganizationId=null;
  app.innerHTML=`<div class="community-page">${community?detail(community):directory()}</div>`;
  notifyRender();
}
async function reload(id=state.currentOrganizationId){await load();renderCommunities(id);}
function formPayload(form){return {name:form.elements.name.value.trim(),description:form.elements.description?.value.trim()||'',language:form.elements.language?.value||'fr',games:[...form.querySelectorAll('[name="games"]:checked')].map(input=>input.value),joinMode:form.elements.joinMode?.value||'open',visibility:form.elements.visibility?.value||'public'};}

async function action(target){
  const type=target.dataset.communityAction,id=target.dataset.id;
  if(type==='back'){renderCommunities(null);return;}
  if(type==='toggle-create'){ui.creating=!ui.creating;renderCommunities(null);return;}
  if(type==='open'){renderCommunities(id);return;}
  if(type==='join'){await api('/api/organizations/'+id+'/join','POST');await reload(id);return;}
  if(type==='leave'){if(!confirm('Quitter cette communauté ?'))return;await api('/api/organizations/'+id+'/members/me','DELETE');ui.eligibility.delete(id);await reload(null);return;}
  if(type==='eligibility'){ui.eligibility.set(id,await api('/api/organizations/'+id+'/eligibility'));renderCommunities(id);return;}
  if(type==='remove-member'){if(!confirm('Retirer '+(target.dataset.userName||'ce pilote')+' de la communauté ?'))return;await api('/api/organizations/'+id+'/members/'+target.dataset.userId,'DELETE');await reload(id);return;}
  if(type==='request'){await api('/api/organizations/'+id+'/join-requests/'+target.dataset.userId,'POST',{action:target.dataset.decision});await reload(id);return;}
  if(type==='unlink-discord'){if(!confirm('Délier le serveur Discord de cette communauté ?'))return;await api('/api/organizations/'+id+'/discord','PATCH',{guildId:''});ui.discord.delete(id);await reload(id);return;}
  if(type==='event'){state.activeOrganizationId=id;state.visibleAudienceIds=new Set([id]);state.currentEventId=target.dataset.eventId;state.selectedDepartureId=target.dataset.departureId||null;state.registrationOpen.clear();state.drafts={};renderEvent();}
}

document.addEventListener('click',async event=>{const target=event.target.closest?.('[data-community-action]');if(!target||target.disabled)return;event.preventDefault();if(ui.busy)return;ui.busy=true;target.disabled=true;try{await action(target);}catch(error){showError(error);}finally{ui.busy=false;if(target.isConnected)target.disabled=false;}});
document.addEventListener('input',event=>{if(event.target.matches?.('[data-community-filter="search"]')){ui.search=event.target.value;renderCommunities(null);document.querySelector('[data-community-filter="search"]')?.focus();}});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-community-filter="game"]')){ui.game=event.target.value;renderCommunities(null);}});
document.addEventListener('submit',async event=>{const form=event.target;if(!form.matches?.('[data-community-form]'))return;event.preventDefault();if(ui.busy)return;ui.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{
  if(form.dataset.communityForm==='create'){const result=await api('/api/organizations','POST',{type:'community',...formPayload(form)});ui.creating=false;await reload(result.id);}
  if(form.dataset.communityForm==='settings'){await api('/api/organizations/'+form.dataset.id,'PATCH',formPayload(form));await reload(form.dataset.id);}
  if(form.dataset.communityForm==='discord-probe'){const guildId=form.elements.guildId.value.trim();ui.discord.set(form.dataset.id,await api('/api/organizations/'+form.dataset.id+'/discord?guildId='+encodeURIComponent(guildId)));renderCommunities(form.dataset.id);}
  if(form.dataset.communityForm==='discord-save'){await api('/api/organizations/'+form.dataset.id+'/discord','PATCH',{guildId:form.dataset.guildId,roleId:form.elements.roleId.value});ui.discord.delete(form.dataset.id);await reload(form.dataset.id);}
}catch(error){showError(error);}finally{ui.busy=false;if(submit?.isConnected)submit.disabled=false;}});
