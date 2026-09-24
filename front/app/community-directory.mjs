import {app,state,api,load,showError,esc,dateLabel,notifyRender,activeGame} from './core.mjs?v=10-community-only';
import {renderEvent} from './event-view.mjs?v=21-community-only';
import {renderEventForm} from './event-form.mjs?v=5-community-only';

const ui={search:'',game:'all',creating:false,discord:new Map(),eligibility:new Map(),members:new Map(),busy:false};
const communities=()=>[...(state.organizations?.communities||[]),...(state.organizations?.discoverableCommunities||[])];
const byId=id=>communities().find(item=>item.id===id)||null;
const canManage=community=>['owner','manager'].includes(community?.role);
const initials=name=>String(name||'EM').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const accessLabel=mode=>({open:'Ouverte à tous',request:'Sur demande',invite:'Sur invitation',discord:'Membres Discord'}[mode]||'Ouverte à tous');
const roleLabel=role=>({owner:'Responsable',manager:'Manager',member:'Membre'}[role]||'Membre');
const gameLabel=game=>game==='lmu'?'Le Mans Ultimate':'iRacing';

function mark(community,large=false){
  const logo=community?.branding?.logoUrl;
  return logo
    ? `<span class="community-mark ${large?'large':''} has-image"><img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
    : `<span class="community-mark ${large?'large':''}" aria-hidden="true">${esc(initials(community?.name))}</span>`;
}
function brandingStyle(community){
  const accent=community?.branding?.accentColor;
  return accent?` style="--community-accent:${esc(accent)}"`:'';
}
function upcomingEvents(community){
  const ids=new Set(community?.eventIds||[]),now=Date.now();
  return state.events.filter(event=>ids.has(event.id)).map(event=>({event,next:(event.departures||[]).filter(d=>Number(d.startsAt)>now).sort((a,b)=>a.startsAt-b.startsAt)[0]})).filter(item=>item.next).sort((a,b)=>a.next.startsAt-b.next.startsAt);
}
function tagRow(community){
  const discord=community.discord||{};
  return `<div class="community-tags">${(community.games||[]).map(game=>`<span>${esc(gameLabel(game))}</span>`).join('')}<span>${community.language==='en'?'English':'Français'}</span><span>${esc(accessLabel(community.joinMode))}</span>${discord.linked?`<span>Discord · ${esc(discord.guildName||'lié')}</span>`:'<span>Endurance Manager</span>'}${discord.requiredRoleName?`<span>Rôle ${esc(discord.requiredRoleName)}</span>`:''}</div>`;
}
function communityCard(community){
  const joined=Boolean(community.role),preferred=community.id===state.organizations?.preferredCommunityId;
  return `<article class="community-card ${joined?'is-joined':''}"${brandingStyle(community)}><button type="button" class="community-card-main" data-community-action="open" data-id="${community.id}">${mark(community)}<span class="community-card-copy"><small>${preferred?'PAR DÉFAUT':joined?'MES COMMUNAUTÉS':'À DÉCOUVRIR'}</small><strong>${esc(community.name)}</strong><em>${Number(community.memberCount)||0} membre${Number(community.memberCount)===1?'':'s'}</em><p>${esc(community.description||'Communauté simracing endurance sur Endurance Manager.')}</p>${tagRow(community)}</span><b aria-hidden="true">›</b></button></article>`;
}
function filteredDiscoverable(){
  const source=state.organizations?.discoverableCommunities||[];
  const q=ui.search.trim().toLocaleLowerCase('fr-FR');
  return source.filter(item=>(!q||`${item.name} ${item.description||''}`.toLocaleLowerCase('fr-FR').includes(q))&&(ui.game==='all'||(item.games||[]).includes(ui.game)));
}
async function loadCommunityMembers(id,{append=false}={}){
  const current=ui.members.get(id),offset=append?(current?.nextOffset??0):0;
  if(append&&current?.nextOffset==null)return;
  const result=await api('/api/organizations/'+id+'/members?limit=50&offset='+offset);
  ui.members.set(id,{members:append?[...(current?.members||[]),...(result.members||[])]:result.members||[],total:Number(result.total)||0,nextOffset:result.nextOffset==null?null:Number(result.nextOffset)});
}
async function openCommunity(id){
  renderCommunities(id);
  const community=byId(id);
  if(!community?.role)return;
  await loadCommunityMembers(id);
  if(state.page==='communities'&&state.currentOrganizationId===id)renderCommunities(id);
}
function createPanel(){
  if(!ui.creating)return '<button type="button" class="secondary-button community-create-trigger" data-community-action="toggle-create">+ Créer une communauté</button>';
  return `<section class="community-create-panel"><div class="community-section-heading"><div><small>NOUVEL ESPACE</small><h2>Créer une communauté</h2><p>Discord reste facultatif et se connecte après la création.</p></div><button type="button" class="community-close" data-community-action="toggle-create" aria-label="Fermer">×</button></div><form data-community-form="create" class="community-form"><label><span>Nom</span><input name="name" maxlength="60" required></label><label class="community-form-wide"><span>Présentation</span><textarea name="description" maxlength="600" rows="3"></textarea></label><fieldset><legend>Simulateurs</legend><label><input type="checkbox" name="games" value="lmu" checked> Le Mans Ultimate</label><label><input type="checkbox" name="games" value="iracing"> iRacing</label></fieldset><label><span>Langue</span><select name="language"><option value="fr">Français</option><option value="en">English</option></select></label><label><span>Accès</span><select name="joinMode"><option value="open">Ouverte</option><option value="request">Sur demande</option><option value="invite">Sur invitation</option></select></label><label><span>Visibilité</span><select name="visibility"><option value="public">Visible dans l’annuaire</option><option value="private">Privée</option></select></label><div class="community-form-actions"><button class="primary-button" type="submit">Créer</button><button class="secondary-button" type="button" data-community-action="toggle-create">Annuler</button></div></form></section>`;
}
function directory(){
  const joined=state.organizations?.communities||[],found=filteredDiscoverable();
  return `<section class="community-management-head"><div><small>PARAMÈTRES</small><h1>Communautés</h1><p>Ton espace actif se choisit depuis la barre principale. Ici, tu gères seulement tes communautés ou tu en rejoins une autre.</p></div>${state.user?createPanel():'<span class="community-login-note">Connecte-toi avec Discord pour rejoindre une communauté.</span>'}</section>
    ${joined.length?`<section class="community-directory-section"><div class="community-section-heading"><div><small>MES COMMUNAUTÉS</small><h2>Espaces disponibles</h2></div><span>${joined.length}</span></div><div class="community-grid">${joined.map(communityCard).join('')}</div></section>`:'<section class="community-directory-section"><div class="community-empty compact">Tu n’as encore rejoint aucune communauté.</div></section>'}
    <details class="community-secondary-panel community-discover-secondary"><summary>Découvrir d’autres communautés <small>${found.length}</small></summary><div class="community-secondary-body"><div class="community-discovery-tools"><label><span>Rechercher</span><input type="search" value="${esc(ui.search)}" data-community-filter="search" placeholder="Nom ou description"></label><label><span>Simulateur</span><select data-community-filter="game"><option value="all" ${ui.game==='all'?'selected':''}>Tous</option><option value="lmu" ${ui.game==='lmu'?'selected':''}>Le Mans Ultimate</option><option value="iracing" ${ui.game==='iracing'?'selected':''}>iRacing</option></select></label></div>${found.length?`<div class="community-grid">${found.map(communityCard).join('')}</div>`:'<div class="community-empty compact">Aucune communauté ne correspond à ces critères.</div>'}</div></details>`;
}
function memberList(community){
  const manageable=canManage(community),paged=ui.members.get(community.id),members=paged?.members||[];
  const total=paged?.total??(Number(community.memberCount)||0),loading=!paged&&Number(community.memberCount)>0;
  return `<div class="community-members">${loading?'<p class="community-muted">Chargement des membres…</p>':members.length?members.map(member=>{const editable=manageable&&member.role!=='owner'&&member.id!==state.user?.id;const roleAction=community.role==='owner'&&editable?`<button type="button" class="community-member-role" data-community-action="member-role" data-id="${community.id}" data-user-id="${member.id}" data-role="${member.role==='manager'?'member':'manager'}">${member.role==='manager'?'Retirer organisateur':'Nommer organisateur'}</button>`:'';return `<div class="community-member"><span class="community-member-avatar">${esc(initials(member.name))}</span><span><strong>${esc(member.name)}</strong><small>${esc(roleLabel(member.role))}</small></span>${roleAction}${editable?`<button type="button" data-community-action="remove-member" data-id="${community.id}" data-user-id="${member.id}" data-user-name="${esc(member.name)}" aria-label="Retirer ${esc(member.name)}">×</button>`:''}</div>`;}).join(''):'<p>Aucun membre.</p>'}${paged?.nextOffset!=null?`<button type="button" class="secondary-button community-more-members" data-community-action="more-members" data-id="${community.id}">Afficher plus · ${members.length}/${total}</button>`:''}</div>`;
}
function requestList(community){
  if(!canManage(community)||!(community.joinRequests||[]).length)return'';
  return `<section class="community-detail-block"><div class="community-block-title"><small>DEMANDES</small><h2>Adhésions en attente</h2></div><div class="community-request-list">${community.joinRequests.map(item=>`<div><span><strong>${esc(item.name)}</strong><small>Souhaite rejoindre la communauté</small></span><button class="secondary-button" data-community-action="request" data-decision="approve" data-id="${community.id}" data-user-id="${item.id}">Accepter</button><button class="community-danger-quiet" data-community-action="request" data-decision="deny" data-id="${community.id}" data-user-id="${item.id}">Refuser</button></div>`).join('')}</div></section>`;
}
function eventList(community){
  const events=upcomingEvents(community);
  return `<section class="community-detail-block"><div class="community-block-title"><small>ENDURANCES · ${activeGame==='iracing'?'IRACING':'LMU'}</small><h2>À venir</h2></div>${events.length?`<div class="community-event-list">${events.map(({event,next})=>`<button type="button" data-community-action="event" data-id="${community.id}" data-event-id="${event.id}" data-departure-id="${next.id}"><span><strong>${esc(event.name)}</strong><small>${esc(dateLabel(next))} · ${(event.categories||[]).map(esc).join(' · ')}</small></span><b>›</b></button>`).join('')}</div>`:'<div class="community-empty compact">Aucune endurance à venir sur ce simulateur.</div>'}</section>`;
}
function joinAction(community){
  if(community.role)return `<div class="community-profile-actions-row">${community.id!==state.organizations?.preferredCommunityId?`<button class="primary-button" data-community-action="set-default" data-id="${community.id}">Utiliser cet espace par défaut</button>`:'<span class="community-status-pill">Espace par défaut</span>'}${community.role==='owner'?'<span class="community-status-pill">Responsable</span>':`<button class="secondary-button" data-community-action="leave" data-id="${community.id}">Quitter</button>`}</div>`;
  if(community.joinPending)return'<span class="community-status-pill">Demande envoyée</span>';
  if(!state.user)return'<span class="community-status-pill">Connecte-toi avec Discord pour rejoindre cet espace</span>';
  if(community.joinMode==='invite')return'<span class="community-status-pill">Sur invitation</span>';
  return `<button class="primary-button" data-community-action="join" data-id="${community.id}">${community.joinMode==='request'?'Demander à rejoindre':'Rejoindre la communauté'}</button>`;
}
function eligibilityBlock(community){
  if(!community.role||!community.discord?.linked)return'';
  const status=ui.eligibility.get(community.id),role=community.discord.requiredRoleName;
  if(!status)return `<div class="community-eligibility"><span>Discord lié${role?` · rôle ${esc(role)} requis pour courir`:''}</span><button class="secondary-button" data-community-action="eligibility" data-id="${community.id}">Vérifier mon statut</button></div>`;
  const ok=status.available&&status.member&&(!status.roleRequired||status.eligible);
  return `<div class="community-eligibility ${ok?'is-ok':'is-blocked'}"><strong>${ok?'✓ Éligible aux endurances':'Accès course non validé'}</strong><span>${!status.available?'Vérification Discord indisponible.':!status.member?'Tu ne fais pas partie du serveur Discord.':status.roleRequired&&!status.eligible?`Le rôle ${esc(status.requiredRoleName||role||'requis')} manque sur Discord.`:'Ton statut Discord est à jour.'}</span><button class="secondary-button" data-community-action="eligibility" data-id="${community.id}">Actualiser</button></div>`;
}
function brandingSettings(community){
  const brand=community.branding||{};
  const customized=Boolean(brand.customLogoUrl||brand.customBannerUrl||brand.customAccentColor);
  return `<details class="community-config-section community-branding-settings" ${customized?'open':''}><summary><span><strong>Apparence</strong><small>${customized?'Personnalisation active':'Visuels Discord utilisés automatiquement'}</small></span></summary><div class="community-config-body"><p class="community-section-help">Le logo et la bannière de Discord sont repris automatiquement. Ouvre cette partie uniquement si tu veux utiliser d’autres visuels sur le site.</p><div class="community-branding-preview"${brandingStyle(community)}>${brand.bannerUrl?`<img src="${esc(brand.bannerUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span></span>${mark(community,true)}<strong>${esc(community.name)}</strong></div><div class="community-branding-fields"><label><span>Logo personnalisé</span><input name="logoUrl" type="url" maxlength="500" value="${esc(brand.customLogoUrl||'')}" placeholder="https://…"><small>Adresse HTTPS de l’image. Laisse vide pour garder le logo Discord.</small></label><label><span>Bannière personnalisée</span><input name="bannerUrl" type="url" maxlength="500" value="${esc(brand.customBannerUrl||'')}" placeholder="https://…"><small>Adresse HTTPS de l’image. Laisse vide pour garder la bannière Discord.</small></label><label><span>Couleur principale</span><input name="accentColor" maxlength="7" pattern="#[0-9A-Fa-f]{6}" value="${esc(brand.customAccentColor||'')}" placeholder="#59D3D8"><small>Code couleur à six caractères, par exemple #59D3D8.</small></label></div></div></details>`;
}
function discordSettings(community,probe){
  const discord=community.discord||{},linked=Boolean(discord.linked),invite=state.organizations?.discordBotInviteUrl;
  const connectionForm=linked
    ? `<form data-community-form="discord-probe" data-id="${community.id}" class="community-discord-probe is-linked"><input type="hidden" name="guildId" value="${esc(discord.guildId||'')}"><button class="secondary-button" type="submit">Modifier les rôles et publications</button></form>`
    : `<ol class="community-setup-steps"><li><span class="community-step-index">1</span><div><strong>Ajouter le bot au serveur</strong><p>Choisis le serveur Discord de la communauté et accepte les autorisations proposées.</p>${invite?`<a class="secondary-button community-external" href="${esc(invite)}" target="_blank" rel="noopener">Ajouter le bot sur Discord</a>`:'<span class="community-unavailable-note">Le bot Discord n’est pas disponible pour le moment.</span>'}</div></li><li><span class="community-step-index">2</span><div><strong>Indiquer le serveur à connecter</strong><p>Dans Discord, active le mode développeur puis utilise « Copier l’identifiant » sur le serveur.</p><form data-community-form="discord-probe" data-id="${community.id}" class="community-discord-probe"><label><span>Identifiant du serveur</span><input name="guildId" inputmode="numeric" autocomplete="off" pattern="\\d{15,22}" placeholder="Ex. 123456789012345678" required><small>Réglages utilisateur → Avancé → Mode développeur.</small></label><button class="secondary-button" type="submit">Continuer</button></form></div></li></ol>`;
  const configured=probe?`<form data-community-form="discord-save" data-id="${community.id}" data-guild-id="${probe.id}" class="community-discord-save"><div class="community-discord-preview">${probe.iconUrl?`<img src="${esc(probe.iconUrl)}" alt="">`:''}<span><small>SERVEUR TROUVÉ</small><strong>${esc(probe.name)}</strong></span></div><div class="community-discord-role-grid"><label><span>Qui peut participer aux endurances ?</span><select name="roleId"><option value="">Tous les membres du serveur</option>${(probe.roles||[]).map(role=>`<option value="${role.id}" ${role.id===discord.requiredRoleId?'selected':''}>Rôle « ${esc(role.name)} » uniquement</option>`).join('')}</select><small>Les autres membres pourront consulter l’espace, mais pas s’inscrire aux courses.</small></label><label><span>Qui peut administrer le site ?</span><select name="managerRoleId"><option value="">Personne automatiquement</option>${(probe.roles||[]).map(role=>`<option value="${role.id}" ${role.id===discord.managerRoleId?'selected':''}>Les membres avec « ${esc(role.name)} »</option>`).join('')}</select><small>Ce rôle donne les droits d’organisateur sur Endurance Manager.</small></label></div><label class="community-discord-toggle"><input type="checkbox" name="syncEnabled" ${discord.syncEnabled?'checked':''}><span><strong>Synchroniser automatiquement les membres et organisateurs</strong><small>Les changements de rôles Discord seront répercutés sur le site.</small></span></label><details class="community-discord-publication" ${discord.weeklyConfigured?'open':''}><summary>Publication automatique dans Discord <small>Facultatif</small></summary><div><label><span>Webhook du salon récapitulatif</span><input name="weeklyWebhookUrl" type="url" maxlength="500" placeholder="${discord.weeklyConfigured?'Webhook déjà configuré · laisse vide pour le conserver':'https://discord.com/api/webhooks/…'}"><small>Le site publiera dans ce salon le récapitulatif des prochaines courses.</small></label>${discord.weeklyConfigured?'<label class="community-discord-toggle compact"><input type="checkbox" name="clearWeeklyWebhook"><span>Supprimer le webhook actuel</span></label>':''}<label><span>Simulateur du récapitulatif</span><select name="weeklyGame"><option value="lmu" ${discord.weeklyGame==='lmu'?'selected':''}>Le Mans Ultimate</option><option value="iracing" ${discord.weeklyGame==='iracing'?'selected':''}>iRacing</option></select></label></div></details><button class="primary-button" type="submit">${linked?'Enregistrer les réglages Discord':'Lier ce serveur'}</button></form>`:'';
  const linkedCard=linked?`<div class="community-discord-linked"><span class="community-connection-dot" aria-hidden="true"></span><span><strong>${esc(discord.guildName)}</strong><small>${discord.syncEnabled?'Synchronisation active':'Synchronisation désactivée'}${discord.managerRoleName?` · organisateurs : ${esc(discord.managerRoleName)}`:''}${discord.weeklyConfigured?` · récapitulatif ${discord.weeklyGame==='iracing'?'iRacing':'LMU'}`:''}</small></span><button class="community-danger-quiet" type="button" data-community-action="unlink-discord" data-id="${community.id}">Délier</button></div>`:'';
  return `<details class="community-config-section community-discord-settings" ${!linked||probe?'open':''}><summary><span><strong>Discord</strong><small>${linked?`Connecté à ${esc(discord.guildName)}`:'Connexion facultative'}</small></span><b class="community-summary-status ${linked?'is-connected':''}">${linked?'Connecté':'À configurer'}</b></summary><div class="community-config-body"><p class="community-section-help">Relier Discord permet de reprendre les visuels du serveur, gérer les accès avec les rôles et publier les prochaines courses.</p>${linkedCard}${connectionForm}${configured}</div></details>`;
}
function settings(community){
  if(!canManage(community))return'';
  const probe=ui.discord.get(community.id),discord=community.discord||{},joinOptions=['open','request','invite',...(discord.linked?['discord']:[])];
  return `<section class="community-settings" aria-labelledby="community-settings-title"><div class="community-settings-heading"><small>ADMINISTRATION</small><h2 id="community-settings-title">Réglages de la communauté</h2><p>Chaque partie peut être ouverte séparément. Les paramètres Discord s’enregistrent indépendamment.</p></div><div class="community-settings-body"><form data-community-form="settings" data-id="${community.id}" class="community-form community-settings-form"><details class="community-config-section" open><summary><span><strong>Informations générales</strong><small>Nom, présentation, simulateurs et accès</small></span></summary><div class="community-config-body"><label><span>Nom de la communauté</span><input name="name" maxlength="60" value="${esc(community.name)}" required></label><label class="community-form-wide"><span>Présentation</span><textarea name="description" maxlength="600" rows="3" placeholder="Présente la communauté en quelques lignes.">${esc(community.description||'')}</textarea></label><fieldset class="community-choice-group"><legend>Simulateurs utilisés</legend><label><input type="checkbox" name="games" value="lmu" ${(community.games||[]).includes('lmu')?'checked':''}><span>Le Mans Ultimate</span></label><label><input type="checkbox" name="games" value="iracing" ${(community.games||[]).includes('iracing')?'checked':''}><span>iRacing</span></label></fieldset><div class="community-settings-grid"><label><span>Langue principale</span><select name="language"><option value="fr" ${community.language==='fr'?'selected':''}>Français</option><option value="en" ${community.language==='en'?'selected':''}>English</option></select><small>Langue utilisée par la communauté.</small></label><label><span>Comment rejoindre ?</span><select name="joinMode">${joinOptions.map(mode=>`<option value="${mode}" ${community.joinMode===mode?'selected':''}>${esc(accessLabel(mode))}</option>`).join('')}</select><small>Détermine qui peut devenir membre de cet espace.</small></label><label><span>Qui peut la découvrir ?</span><select name="visibility"><option value="public" ${community.visibility==='public'?'selected':''}>Tout le monde dans l’annuaire</option><option value="private" ${community.visibility==='private'?'selected':''}>Uniquement avec un lien ou une invitation</option></select><small>Une communauté privée n’apparaît pas dans la recherche.</small></label></div></div></details>${brandingSettings(community)}<div class="community-form-actions"><button class="primary-button" type="submit">Enregistrer les modifications</button></div></form>${discordSettings(community,probe)}</div></section>`;
}
function detail(community){
  const brand=community.branding||{};
  return `<button type="button" class="community-back" data-community-action="back">← Gestion des communautés</button><section class="community-profile-hero"${brandingStyle(community)}>${brand.bannerUrl?`<img class="community-profile-banner" src="${esc(brand.bannerUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span class="community-profile-shade"></span>${mark(community,true)}<div class="community-profile-copy"><small>COMMUNAUTÉ</small><h1>${esc(community.name)}</h1><p>${esc(community.description||'Cette communauté n’a pas encore ajouté de présentation.')}</p>${tagRow(community)}</div><div class="community-profile-actions">${canManage(community)?`<button class="secondary-button" type="button" data-community-action="copy-link" data-id="${community.id}">Copier le lien d’accès</button><button class="secondary-button" type="button" data-community-action="create-event" data-id="${community.id}">+ Créer une endurance</button>`:''}${joinAction(community)}</div></section>${eligibilityBlock(community)}<div class="community-detail-grid"><div>${eventList(community)}${requestList(community)}</div><aside><section class="community-detail-block"><div class="community-block-title"><small>MEMBRES</small><h2>${Number(community.memberCount)||0} membre${Number(community.memberCount)===1?'':'s'}</h2></div>${community.role?memberList(community):'<p class="community-muted">Les membres deviennent visibles après avoir rejoint la communauté.</p>'}</section>${settings(community)}</aside></div>`;
}

export function renderCommunities(id=state.currentOrganizationId){
  state.page='communities';state.currentEventId=null;state.currentOrganizationId=id||null;
  const community=id?byId(id):null;
  if(id&&!community)state.currentOrganizationId=null;
  app.innerHTML=`<div class="community-page">${community?detail(community):directory()}</div>`;
  notifyRender();
}
async function reload(id=state.currentOrganizationId){await load();renderCommunities(id);}
function formPayload(form){
  return {name:form.elements.name.value.trim(),description:form.elements.description?.value.trim()||'',language:form.elements.language?.value||'fr',games:[...form.querySelectorAll('[name="games"]:checked')].map(input=>input.value),joinMode:form.elements.joinMode?.value||'open',visibility:form.elements.visibility?.value||'public',logoUrl:form.elements.logoUrl?.value.trim()||'',bannerUrl:form.elements.bannerUrl?.value.trim()||'',accentColor:form.elements.accentColor?.value.trim()||''};
}
function goToCommunity(id){
  const url=new URL(location.href);url.searchParams.set('community',id);url.searchParams.delete('auth');location.assign(url.pathname+url.search);
}

async function action(target){
  const type=target.dataset.communityAction,id=target.dataset.id;
  if(type==='back'){renderCommunities(null);return;}
  if(type==='toggle-create'){ui.creating=!ui.creating;renderCommunities(null);return;}
  if(type==='open'){await openCommunity(id);return;}
  if(type==='join'){const result=await api('/api/organizations/'+id+'/join','POST');if(result.joined){if(state.user)await api('/api/organizations/preferred','PATCH',{organizationId:id});goToCommunity(id);return;}await reload(id);return;}
  if(type==='set-default'){await api('/api/organizations/preferred','PATCH',{organizationId:id});goToCommunity(id);return;}
  if(type==='copy-link'){
    const share=location.origin+'/?community='+encodeURIComponent(id);
    try{await navigator.clipboard.writeText(share);target.textContent='Lien copié';}
    catch{prompt('Copie ce lien pour inviter directement dans la communauté :',share);}
    return;
  }
  if(type==='leave'){if(!confirm('Quitter cette communauté ?'))return;await api('/api/organizations/'+id+'/members/me','DELETE');ui.eligibility.delete(id);ui.members.delete(id);await reload(null);return;}
  if(type==='eligibility'){ui.eligibility.set(id,await api('/api/organizations/'+id+'/eligibility'));renderCommunities(id);return;}
  if(type==='create-event'){state.eventCreationOrganizationId=id;renderEventForm(null,{organizationId:id});return;}
  if(type==='remove-member'){if(!confirm('Retirer '+(target.dataset.userName||'ce pilote')+' de la communauté ?'))return;await api('/api/organizations/'+id+'/members/'+target.dataset.userId,'DELETE');await load();await loadCommunityMembers(id);renderCommunities(id);return;}
  if(type==='member-role'){await api('/api/organizations/'+id+'/members/'+target.dataset.userId,'PATCH',{role:target.dataset.role});await load();await loadCommunityMembers(id);renderCommunities(id);return;}
  if(type==='request'){await api('/api/organizations/'+id+'/join-requests/'+target.dataset.userId,'POST',{action:target.dataset.decision});await load();await loadCommunityMembers(id);renderCommunities(id);return;}
  if(type==='more-members'){await loadCommunityMembers(id,{append:true});renderCommunities(id);return;}
  if(type==='unlink-discord'){if(!confirm('Délier le serveur Discord de cette communauté ?'))return;await api('/api/organizations/'+id+'/discord','PATCH',{guildId:''});ui.discord.delete(id);await reload(id);return;}
  if(type==='event'){state.activeCommunityId=id;state.activeOrganizationId=id;state.visibleAudienceIds=new Set([id]);state.currentEventId=target.dataset.eventId;state.selectedDepartureId=target.dataset.departureId||null;state.registrationOpen.clear();state.drafts={};renderEvent();}
}

document.addEventListener('click',async event=>{const target=event.target.closest?.('[data-community-action]');if(!target||target.disabled)return;event.preventDefault();if(ui.busy)return;ui.busy=true;target.disabled=true;try{await action(target);}catch(error){showError(error);}finally{ui.busy=false;if(target.isConnected)target.disabled=false;}});
document.addEventListener('input',event=>{if(event.target.matches?.('[data-community-filter="search"]')){ui.search=event.target.value;renderCommunities(null);document.querySelector('[data-community-filter="search"]')?.focus();}});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-community-filter="game"]')){ui.game=event.target.value;renderCommunities(null);}});
document.addEventListener('submit',async event=>{const form=event.target;if(!form.matches?.('[data-community-form]'))return;event.preventDefault();if(ui.busy)return;ui.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{
  if(form.dataset.communityForm==='create'){const result=await api('/api/organizations','POST',{type:'community',...formPayload(form)});ui.creating=false;await reload(result.id);}
  if(form.dataset.communityForm==='settings'){await api('/api/organizations/'+form.dataset.id,'PATCH',formPayload(form));await reload(form.dataset.id);}
  if(form.dataset.communityForm==='discord-probe'){const guildId=form.elements.guildId.value.trim();ui.discord.set(form.dataset.id,await api('/api/organizations/'+form.dataset.id+'/discord?guildId='+encodeURIComponent(guildId)));renderCommunities(form.dataset.id);}
  if(form.dataset.communityForm==='discord-save'){const payload={guildId:form.dataset.guildId,roleId:form.elements.roleId.value,managerRoleId:form.elements.managerRoleId.value,syncEnabled:form.elements.syncEnabled.checked,weeklyGame:form.elements.weeklyGame.value};const webhook=form.elements.weeklyWebhookUrl.value.trim();if(webhook||form.elements.clearWeeklyWebhook?.checked)payload.weeklyWebhookUrl=webhook;await api('/api/organizations/'+form.dataset.id+'/discord','PATCH',payload);ui.discord.delete(form.dataset.id);await reload(form.dataset.id);}
}catch(error){showError(error);}finally{ui.busy=false;if(submit?.isConnected)submit.disabled=false;}});
