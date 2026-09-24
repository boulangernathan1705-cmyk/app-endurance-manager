import {app,state,api,load,showError,esc,notifyRender} from './core.mjs?v=13-tondeuz-tool';

const ui={discord:new Map(),members:new Map(),memberLoading:new Set(),memberErrors:new Map(),busy:false};
const communities=()=>[...(state.organizations?.communities||[]),...(state.organizations?.discoverableCommunities||[])];
const byId=id=>communities().find(item=>item.id===id)||null;
const canManage=community=>['admin','organizer'].includes(state.user?.role)||['owner','manager'].includes(community?.role);
const initials=name=>String(name||'EM').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
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
function tagRow(community){
  const discord=community.discord||{};
  return `<div class="community-tags">${(community.games||[]).map(game=>`<span>${esc(gameLabel(game))}</span>`).join('')}<span>${community.language==='en'?'English':'Français'}</span>${discord.linked?`<span>Discord · ${esc(discord.guildName||'lié')}</span>`:'<span>Discord non lié</span>'}${discord.requiredRoleName?`<span>Participation · ${esc(discord.requiredRoleName)}</span>`:''}</div>`;
}

async function loadCommunityMembers(id,{append=false}={}){
  const current=ui.members.get(id),offset=append?(current?.nextOffset??0):0;
  if(append&&current?.nextOffset==null)return;
  const result=await api('/api/organizations/'+id+'/members?limit=50&offset='+offset);
  ui.members.set(id,{members:append?[...(current?.members||[]),...(result.members||[])]:result.members||[],total:Number(result.total)||0,nextOffset:result.nextOffset==null?null:Number(result.nextOffset)});
  ui.memberErrors.delete(id);
}
async function ensureCommunityMembers(id,{refresh=false}={}){
  if(!id||ui.memberLoading.has(id)||(!refresh&&ui.members.has(id)))return;
  ui.memberLoading.add(id);ui.memberErrors.delete(id);
  try{await loadCommunityMembers(id);}
  catch(error){ui.memberErrors.set(id,error?.message||'Impossible de charger les membres.');}
  finally{
    ui.memberLoading.delete(id);
    if(state.page==='communities'&&state.currentOrganizationId===id)renderCommunities(id);
  }
}
function memberList(community){
  const manageable=canManage(community),paged=ui.members.get(community.id),members=paged?.members||[];
  const total=paged?.total??(Number(community.memberCount)||0),loading=ui.memberLoading.has(community.id)||(!paged&&!ui.memberErrors.has(community.id)),error=ui.memberErrors.get(community.id);
  return `<div class="community-members">${loading?'<div class="community-member-state" role="status"><span class="community-loader" aria-hidden="true"></span><p>Chargement des membres…</p></div>':error?`<div class="community-member-state is-error"><p>La liste n’a pas pu être chargée.</p><button type="button" class="secondary-button" data-community-action="refresh-members" data-id="${community.id}">Réessayer</button></div>`:members.length?members.map(member=>{const editable=manageable&&member.role!=='owner'&&member.id!==state.user?.id;const roleAction=community.role==='owner'&&editable?`<button type="button" class="community-member-role" data-community-action="member-role" data-id="${community.id}" data-user-id="${member.id}" data-role="${member.role==='manager'?'member':'manager'}">${member.role==='manager'?'Retirer organisateur':'Nommer organisateur'}</button>`:'';return `<div class="community-member"><span class="community-member-avatar">${esc(initials(member.name))}</span><span><strong>${esc(member.name)}</strong><small>${esc(roleLabel(member.role))}</small></span>${roleAction}${editable?`<button type="button" data-community-action="remove-member" data-id="${community.id}" data-user-id="${member.id}" data-user-name="${esc(member.name)}" aria-label="Retirer ${esc(member.name)}">×</button>`:''}</div>`;}).join(''):'<p class="community-muted">Aucun membre n’a encore rejoint cet espace.</p>'}${paged?.nextOffset!=null?`<button type="button" class="secondary-button community-more-members" data-community-action="more-members" data-id="${community.id}">Afficher plus · ${members.length}/${total}</button>`:''}</div>`;
}
function membersSection(community){
  const count=ui.members.get(community.id)?.total??(Number(community.memberCount)||0);
  return `<section class="community-detail-block community-members-block"><div class="community-block-heading"><div class="community-block-title"><small>MEMBRES</small><h2>${count} membre${count===1?'':'s'}</h2></div>${community.role?`<button type="button" class="community-icon-action" data-community-action="refresh-members" data-id="${community.id}" aria-label="Actualiser les membres">Actualiser</button>`:''}</div>${community.role?memberList(community):'<p class="community-muted">Cette liste est réservée aux responsables du site.</p>'}${community.discord?.linked?'<p class="community-members-help">Les membres Discord apparaissent ici après leur première connexion au site.</p>':''}</section>`;
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
    : `<ol class="community-setup-steps"><li><span class="community-step-index">1</span><div><strong>Ajouter le bot au serveur</strong><p>Choisis le serveur Discord des Tondeuz et accepte les autorisations proposées.</p>${invite?`<a class="secondary-button community-external" href="${esc(invite)}" target="_blank" rel="noopener">Ajouter le bot sur Discord</a>`:'<span class="community-unavailable-note">Le bot Discord n’est pas disponible pour le moment.</span>'}</div></li><li><span class="community-step-index">2</span><div><strong>Indiquer le serveur à connecter</strong><p>Dans Discord, active le mode développeur puis utilise « Copier l’identifiant » sur le serveur.</p><form data-community-form="discord-probe" data-id="${community.id}" class="community-discord-probe"><label><span>Identifiant du serveur</span><input name="guildId" inputmode="numeric" autocomplete="off" pattern="\\d{15,22}" placeholder="Ex. 123456789012345678" required><small>Réglages utilisateur → Avancé → Mode développeur.</small></label><button class="secondary-button" type="submit">Continuer</button></form></div></li></ol>`;
  const configured=probe?`<form data-community-form="discord-save" data-id="${community.id}" data-guild-id="${probe.id}" class="community-discord-save"><div class="community-discord-preview">${probe.iconUrl?`<img src="${esc(probe.iconUrl)}" alt="">`:''}<span><small>SERVEUR TROUVÉ</small><strong>${esc(probe.name)}</strong></span></div><div class="community-discord-role-grid"><label><span>Qui peut participer aux endurances ?</span><select name="roleId"><option value="">Tous les membres du serveur</option>${(probe.roles||[]).map(role=>`<option value="${role.id}" ${role.id===discord.requiredRoleId?'selected':''}>Rôle « ${esc(role.name)} » uniquement</option>`).join('')}</select><small>Les autres membres pourront consulter l’espace, mais pas s’inscrire aux courses.</small></label><label><span>Qui peut administrer le site ?</span><select name="managerRoleId"><option value="">Personne automatiquement</option>${(probe.roles||[]).map(role=>`<option value="${role.id}" ${role.id===discord.managerRoleId?'selected':''}>Les membres avec « ${esc(role.name)} »</option>`).join('')}</select><small>Ce rôle donne les droits d’organisateur sur Endurance Manager.</small></label></div><label class="community-discord-toggle"><input type="checkbox" name="syncEnabled" ${discord.syncEnabled?'checked':''}><span><strong>Synchroniser automatiquement les membres et organisateurs</strong><small>Les changements de rôles Discord seront répercutés sur le site.</small></span></label><details class="community-discord-publication" ${discord.weeklyConfigured?'open':''}><summary>Publication automatique dans Discord <small>Facultatif</small></summary><div><label><span>Webhook du salon récapitulatif</span><input name="weeklyWebhookUrl" type="url" maxlength="500" placeholder="${discord.weeklyConfigured?'Webhook déjà configuré · laisse vide pour le conserver':'https://discord.com/api/webhooks/…'}"><small>Le site publiera dans ce salon le récapitulatif des prochaines courses.</small></label>${discord.weeklyConfigured?'<label class="community-discord-toggle compact"><input type="checkbox" name="clearWeeklyWebhook"><span>Supprimer le webhook actuel</span></label>':''}<label><span>Simulateur du récapitulatif</span><select name="weeklyGame"><option value="lmu" ${discord.weeklyGame==='lmu'?'selected':''}>Le Mans Ultimate</option><option value="iracing" ${discord.weeklyGame==='iracing'?'selected':''}>iRacing</option></select></label></div></details><button class="primary-button" type="submit">${linked?'Enregistrer les réglages Discord':'Lier ce serveur'}</button></form>`:'';
  const linkedCard=linked?`<div class="community-discord-linked"><span class="community-connection-dot" aria-hidden="true"></span><span><strong>${esc(discord.guildName)}</strong><small>${discord.syncEnabled?'Synchronisation active':'Synchronisation désactivée'}${discord.managerRoleName?` · organisateurs : ${esc(discord.managerRoleName)}`:''}${discord.weeklyConfigured?` · récapitulatif ${discord.weeklyGame==='iracing'?'iRacing':'LMU'}`:''}</small></span><button class="community-danger-quiet" type="button" data-community-action="unlink-discord" data-id="${community.id}">Délier</button></div>`:'';
  return `<details class="community-config-section community-discord-settings" ${probe?'open':''}><summary><span><strong>Discord</strong><small>${linked?`Connecté à ${esc(discord.guildName)}`:'Connexion facultative'}</small></span><b class="community-summary-status ${linked?'is-connected':''}">${linked?'Connecté':'À configurer'}</b></summary><div class="community-config-body"><p class="community-section-help">Relier Discord permet de reprendre les visuels du serveur, gérer les accès avec les rôles et publier les prochaines courses.</p>${linkedCard}${connectionForm}${configured}</div></details>`;
}
function settings(community){
  if(!canManage(community))return'';
  const probe=ui.discord.get(community.id);
  return `<section class="community-settings" aria-labelledby="community-settings-title"><div class="community-settings-heading"><small>ADMINISTRATION</small><h2 id="community-settings-title">Paramètres du site</h2><p>Les courses se gèrent dans LMU ou iRacing. Ici, tu règles uniquement l’identité du site et Discord.</p></div><div class="community-settings-body"><form data-community-form="settings" data-id="${community.id}" class="community-form community-settings-form"><details class="community-config-section"><summary><span><strong>Identité du site</strong><small>Nom, présentation, simulateurs et langue</small></span></summary><div class="community-config-body"><label><span>Nom du site</span><input name="name" maxlength="60" value="${esc(community.name)}" required></label><label class="community-form-wide"><span>Présentation</span><textarea name="description" maxlength="600" rows="3" placeholder="Présente les Tondeuz en quelques lignes.">${esc(community.description||'')}</textarea></label><fieldset class="community-choice-group"><legend>Simulateurs utilisés</legend><label><input type="checkbox" name="games" value="lmu" ${(community.games||[]).includes('lmu')?'checked':''}><span>Le Mans Ultimate</span></label><label><input type="checkbox" name="games" value="iracing" ${(community.games||[]).includes('iracing')?'checked':''}><span>iRacing</span></label></fieldset><label><span>Langue principale</span><select name="language"><option value="fr" ${community.language==='fr'?'selected':''}>Français</option><option value="en" ${community.language==='en'?'selected':''}>English</option></select></label></div></details>${brandingSettings(community)}<div class="community-form-actions"><button class="primary-button" type="submit">Enregistrer</button></div></form>${discordSettings(community,probe)}</div></section>`;
}

function detail(community){
  const brand=community.branding||{};
  return `<section class="community-profile-hero"${brandingStyle(community)}>${brand.bannerUrl?`<img class="community-profile-banner" src="${esc(brand.bannerUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span class="community-profile-shade"></span>${mark(community,true)}<div class="community-profile-copy"><small>SITE DES TONDEUZ</small><h1>${esc(community.name)}</h1><p>${esc(community.description||'Organisation des endurances des Tondeuz à gazon.')}</p>${tagRow(community)}</div></section><div class="community-detail-grid"><aside>${membersSection(community)}</aside><div>${settings(community)}</div></div>`;
}

function siteCommunity(){
  const id=state.organizations?.siteCommunityId||state.activeCommunityId||state.organizations?.preferredCommunityId||null;
  return (id&&byId(id))||(state.organizations?.communities||[])[0]||null;
}

export function renderCommunities(){
  state.page='communities';state.currentEventId=null;
  const community=siteCommunity();
  state.currentOrganizationId=community?.id||null;
  app.innerHTML=`<div class="community-page">${community?detail(community):'<section class="community-management-head"><div><small>PARAMÈTRES</small><h1>Paramètres du site</h1><p>La configuration du site est momentanément indisponible.</p></div></section>'}</div>`;
  notifyRender();
  if(community?.role&&!ui.members.has(community.id)&&!ui.memberLoading.has(community.id)&&!ui.memberErrors.has(community.id))queueMicrotask(()=>void ensureCommunityMembers(community.id));
}
async function reload(){await load();renderCommunities();}
function formPayload(form){
  const current=form.dataset.id?byId(form.dataset.id):null;
  return {
    name:form.elements.name.value.trim(),
    description:form.elements.description?.value.trim()||'',
    language:form.elements.language?.value||current?.language||'fr',
    games:[...form.querySelectorAll('[name="games"]:checked')].map(input=>input.value),
    joinMode:form.elements.joinMode?.value||current?.joinMode||'invite',
    visibility:form.elements.visibility?.value||current?.visibility||'private',
    logoUrl:form.elements.logoUrl?.value.trim()||'',
    bannerUrl:form.elements.bannerUrl?.value.trim()||'',
    accentColor:form.elements.accentColor?.value.trim()||''
  };
}

async function action(target){
  const type=target.dataset.communityAction,id=target.dataset.id;
  if(type==='refresh-members'){await ensureCommunityMembers(id,{refresh:true});return;}
  if(type==='remove-member'){if(!confirm('Retirer '+(target.dataset.userName||'ce pilote')+' du site ?'))return;await api('/api/organizations/'+id+'/members/'+target.dataset.userId,'DELETE');await load();await loadCommunityMembers(id);renderCommunities();return;}
  if(type==='member-role'){await api('/api/organizations/'+id+'/members/'+target.dataset.userId,'PATCH',{role:target.dataset.role});await load();await loadCommunityMembers(id);renderCommunities();return;}
  if(type==='more-members'){await loadCommunityMembers(id,{append:true});renderCommunities();return;}
  if(type==='unlink-discord'){if(!confirm('Délier le serveur Discord du site ?'))return;await api('/api/organizations/'+id+'/discord','PATCH',{guildId:''});ui.discord.delete(id);await reload();return;}
}
document.addEventListener('click',async event=>{const target=event.target.closest?.('[data-community-action]');if(!target||target.disabled)return;event.preventDefault();if(ui.busy)return;ui.busy=true;target.disabled=true;try{await action(target);}catch(error){showError(error);}finally{ui.busy=false;if(target.isConnected)target.disabled=false;}});document.addEventListener('submit',async event=>{const form=event.target;if(!form.matches?.('[data-community-form]'))return;event.preventDefault();if(ui.busy)return;ui.busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{
  if(form.dataset.communityForm==='settings'){await api('/api/organizations/'+form.dataset.id,'PATCH',formPayload(form));await reload();}
  if(form.dataset.communityForm==='discord-probe'){const guildId=form.elements.guildId.value.trim();ui.discord.set(form.dataset.id,await api('/api/organizations/'+form.dataset.id+'/discord?guildId='+encodeURIComponent(guildId)));renderCommunities();}
  if(form.dataset.communityForm==='discord-save'){const payload={guildId:form.dataset.guildId,roleId:form.elements.roleId.value,managerRoleId:form.elements.managerRoleId.value,syncEnabled:form.elements.syncEnabled.checked,weeklyGame:form.elements.weeklyGame.value};const webhook=form.elements.weeklyWebhookUrl.value.trim();if(webhook||form.elements.clearWeeklyWebhook?.checked)payload.weeklyWebhookUrl=webhook;await api('/api/organizations/'+form.dataset.id+'/discord','PATCH',payload);ui.discord.delete(form.dataset.id);await reload();}
}catch(error){showError(error);}finally{ui.busy=false;if(submit?.isConnected)submit.disabled=false;}});
