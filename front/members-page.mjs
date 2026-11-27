import {esc, row, tip} from './admin/markup.mjs';
import {MODE_NAMES, closeDiscordSheet, discordInput, discordPage, discordRefresh, discordTabMarkup, loadDiscordDestinations, openDiscordSheet, recapPreviewMarkup, rightsRow} from './admin/discord-settings.mjs';
import {diagWhen, installCommunityDiagnostics} from './admin/discord-diagnostics.mjs';
import {bannerImage, botImage, closeCropper, cropCanvas, openCropper, resetCropper, setZoom} from './admin/image-cropper.mjs';
import {SUPERVISION_PANEL,installDiscordSupervision} from './admin/discord-supervision.mjs';
import {IRACING_PANEL,installIracingSupervision} from './admin/iracing-supervision.mjs';
import {helpContext} from './context-help.mjs';
import {todoItems} from './admin-todo.mjs';
const app = document.getElementById('members-app');

async function api(path, method='GET', data) {
  const response = await fetch(path, {
    method,
    credentials:'same-origin',
    cache:'no-store',
    headers:method === 'GET' ? {} : {'Content-Type':'application/json'},
    body:method === 'GET' ? undefined : JSON.stringify(data || {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Cette action a échoué.');
  return result;
}

installCommunityDiagnostics(app, {api, esc});

function renderError(message) {
  app.innerHTML = `<section class="members-panel members-error"><h1>Accès impossible</h1><p>${esc(message)}</p><a class="secondary-button" href="/">Retour à l’accueil</a></section>`;
}

// What each permission means (server/access.mjs, PERMISSIONS).
const PERMISSION_LABELS = {access:'Accès Endurance Manager', endurance:'Endurances', solo_open:'Événements OPEN', solo_safe:'Événements SAFE', crews:'Équipages', combos:'Plugin SimHub', admin:'Administrer'};
const PERMISSION_HELP = {access:'Accéder au site de la communauté. Sans cette autorisation sur au moins un rôle, le membre ne peut pas consulter les courses ni utiliser le site.', endurance:'S’inscrire aux endurances (et rejoindre un équipage existant).',
  solo_open:'S’inscrire aux événements OPEN.', solo_safe:'S’inscrire aux événements SAFE (et OPEN).',
  crews:'Créer et gérer les équipages.',
  combos:'Voir l’onglet Plugin SimHub de l’équipe et y envoyer ses séances avec le plugin.',
  admin:'Administrer le site : réglages, rôles, créer et gérer les courses et les événements, inscrire n’importe quel pilote.'};

// Members of the community: found on its Discord server by the bot. Roles are managed on Discord; this page
// shows them with what they allow here (and in « Rôles », what each role allows).
const initials = name => esc(String(name || '?').trim().slice(0, 2).toLocaleUpperCase('fr-FR'));
function memberCard(member, allPermissions) {
  const search = esc(`${member.name} ${member.nickname} ${member.id} ${member.roles.map(role => role.name).join(' ')}`.toLocaleLowerCase('fr-FR'));
  const badge = member.manager ? '<span class="crews-chip is-ask">Gestionnaire</span>'
    : member.discordAdmin ? '<span class="crews-chip is-ask">Admin Discord</span>' : '';
  const roles = member.roles.length ? member.roles.map(role => `<span class="adm-role-pill">${esc(role.name)}</span>`).join('') : '<span class="adm-role-pill is-empty">Aucun rôle</span>';
  const allowed = allPermissions.filter(permission => member.permissions.includes(permission));
  const access = member.permissions.includes('access') || member.permissions.includes('admin');
  const rights = !access ? '<span class="adm-rights is-none">Pas d’accès au site</span>'
    : allowed.length === allPermissions.length && allowed.length ? '<span class="adm-rights">Tout</span>'
    : `<span class="adm-rights">${allowed.filter(permission => permission !== 'access').map(permission => esc(PERMISSION_LABELS[permission] || permission)).join(' · ') || 'Voir les courses'}</span>`;
  const group = !access ? 'none' : member.permissions.includes('admin') ? 'admin' : 'access';
  return `<article class="members-row adm-member" data-search="${search}" data-group="${group}">
    <span class="adm-avatar" aria-hidden="true">${initials(member.nickname || member.name)}</span>
    <div class="adm-member-name"><strong>${esc(member.nickname || member.name)}</strong>${member.nickname && member.nickname !== member.name ? `<small>${esc(member.name)}</small>` : ''}</div>
    <div class="adm-member-roles">${roles}</div>${rights}${badge}
  </article>`;
}

// The administration of a community, in four sections (rail on the left, chips on a phone):
// - « Vue d'ensemble »: how the community stands, the steps to set it up while some are left, what needs a look;
// - « Membres et rôles »: the members, and what each Discord role allows (a table);
// - « Modules »: everything that can be turned on or off, each with its own settings;
// - « Apparence »: name, colour, banner, with a preview of the site.
// Plus « Plateforme » for the managers of Endurance Manager. Every setting is in one place only.
const ICONS = {
  overview:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .6 3.2 2.4 3.6 5.4"/>',
  modules:'<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  look:'<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.6-1.3-2-1.3-3.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-3.9-4-7-9-7Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  platform:'<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  discord:'<path d="M4 5h16v10H9l-5 4V5Z"/><path d="M14 19h1l4 3v-3"/>',
  iracingImport:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  grindfest:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  soloRaces:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  categoryEntry:'<path d="M4 6h16M4 12h10M4 18h7"/><path d="m15 17 2 2 4-4"/>',
  combos:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
const copyButton = target => `<button type="button" class="secondary-button setup-copy" data-copy="${target}">Copier</button>`;

// What is on, for the overview and the modules.
function moduleStates(settings, setup) {
  return {discord:Boolean(setup.botRecap?.enabled),
    iracingImport:settings.modules.iracingImport === true, soloRaces:settings.modules.soloRaces === true, grindfest:settings.modules.grindfest === true, categoryEntry:settings.modules.categoryEntry === true, combos:settings.modules.combos === true};
}

// A ⓘ that explains in a bubble (front/tooltip.mjs).
// One line of a list: a coloured stripe for its state, a title, a short line, an action on the right.
const goTo = (tab, label, extra = '') => `<button type="button" class="secondary-button" data-go-tab="${tab}" ${extra}>${label}</button>`;

// « Vue d'ensemble »: what needs fixing (only that), then the server and how to bring the members, as the home page.
function overviewMarkup(setup, settings, members) {
  const guild = setup.guild || {}, crews = settings.crews || {}, recap = setup.botRecap;
  const voices = settings.modules.crewChannels === true;
  const problems = [];
  if (!guild.id) problems.push(row('bad', 'Aucun serveur Discord relié', 'Demande à un gestionnaire d’Endurance Manager de relier ton serveur.'));
  else if (!guild.botPresent) problems.push(row('bad', 'Le bot n’est pas sur ton serveur Discord', 'Personne ne peut entrer sur le site tant qu’il n’y est pas.',
    `<span class="adm-actions">${setup.botInviteUrl ? `<a class="primary-button" href="${esc(setup.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot</a>` : ''}<button type="button" class="secondary-button" data-setup-refresh>Vérifier</button></span>`));
  if (!setup.rolesConfigured) problems.push(row('warn', 'Aucun rôle n’ouvre le site', 'Choisis quels rôles Discord peuvent entrer sur le site.', goTo('roles', 'Ouvrir les rôles')));
  if (recap?.lastError) problems.push(row('bad', 'Discord : publication en erreur', esc(recap.lastError), goTo('discord', 'Voir')));
  if (recap?.missingRights?.length) problems.push(rightsRow(setup));
  else if (setup.recapSetupRequired) problems.push(row('warn', 'Discord attend son réglage', 'Choisis comment le bot affiche tes courses sur ton serveur.', goTo('discord', 'Régler Discord')));
  if (voices && crews.botReady !== true) problems.push(row('warn', 'Vocaux d’équipage : le bot n’a pas ses droits', 'Il ne peut pas créer les salons vocaux.', goTo('discord', 'Voir')));
  else if (voices && crews.lastError) problems.push(row('warn', 'Vocaux d’équipage en échec', esc(crews.lastError), goTo('discord', 'Voir')));
  const states = moduleStates(settings, setup);
  const on = MODULE_NAMES.filter(([key]) => states[key]).map(([, name]) => name);
  const message = `🏁 Nos courses d’endurance s’organisent maintenant sur Endurance Manager !\n👉 ${setup.siteUrl}/\n\nConnecte-toi avec ton compte Discord : tu y retrouves les courses LMU et iRacing, tu t’inscris avec tes disponibilités et tu crées ou rejoins un équipage.`;
  const server = `<aside class="home-next-box adm-server">
      <h3 class="home-next-label">Ton serveur Discord</h3>
      <p class="home-next-name">${esc(guild.name || 'Aucun serveur')}</p>
      <p class="home-next-when ${guild.botPresent ? 'is-ok' : 'is-bad'}">${!guild.id ? 'Pas encore relié' : guild.botPresent ? '✓ Bot présent' : 'Bot absent'}</p>
      <dl class="home-next-rows">
        <div><dt>Membres venus sur le site</dt><dd>${members.length}</dd></div>
        <div><dt>Discord</dt><dd>${recap?.enabled ? esc(MODE_NAMES[recap.mode] || 'Actif') : 'Éteint'}</dd></div>
        <div><dt>Modules</dt><dd>${on.length ? esc(on.join(', ')) : 'Aucun'}</dd></div>
      </dl>
      <button type="button" class="home-next-go" data-go-tab="discord">Régler Discord →</button>
    </aside>`;
  const invite = `<section class="home-crews-box adm-invite">
      <h3 class="home-next-label">Faire venir tes membres ${tip('Partage l’adresse du site sur ton Discord et épingle le message dans ton salon d’annonces. Le lien d’invitation est montré aux visiteurs qui ne sont pas encore sur ton serveur.')}</h3>
      <div class="setup-inline"><input readonly id="setup-site-url" value="${esc(setup.siteUrl)}/" aria-label="Adresse du site">${copyButton('setup-site-url')}</div>
      <textarea id="setup-announce" class="adm-hidden-copy" readonly aria-hidden="true" tabindex="-1">${esc(message)}</textarea>
      <form class="admin-inline-form" data-invite><input name="invite" type="url" placeholder="Invitation : https://discord.gg/…" aria-label="Lien d’invitation de ton serveur Discord" value="${esc(setup.discordInviteUrl || '')}"><button class="secondary-button" type="submit">${setup.discordInviteUrl ? 'Modifier' : 'Ajouter'}</button><span class="settings-status" aria-live="polite"></span></form>
      <button type="button" class="home-next-go" data-copy="setup-announce">Copier le message d’annonce</button>
    </section>`;
  const list = `<section class="adm-block" aria-labelledby="adm-todo-title">
      <h2 class="adm-label" id="adm-todo-title">À régler <span data-todo-count>${problems.length ? `· ${problems.length}` : ''}</span></h2>
      <ul class="adm-rows" data-admin-todo data-problems="${problems.length}">${problems.join('') || row('ok', 'Tout fonctionne', 'Rien à régler pour le moment.')}</ul>
      <p class="adm-foot"><a href="/diagnostics.html">Erreurs techniques du site</a> ${tip('Les erreurs remontées par les navigateurs des membres ces 14 derniers jours. Utile pour signaler un bug.')}</p>
    </section>`;
  return {todo:problems.length, html:`<p class="adm-intro">Ce qui demande ton attention. Quand tout va bien, il n’y a rien à faire ici.</p>
    <div class="adm-overview"><div class="adm-main-col">${list}</div><div class="adm-side">${server}${invite}</div></div>`};
}

// « Rôles »: one card per Discord role, what it allows on the site in chips (checkboxes saved at once).
function rolesMarkup(settings) {
  // The solo races permissions only matter with the solo races module, the fiches combo one with its module.
  const shown = settings.permissions.filter(permission => ((settings.modules.soloRaces && settings.modules.eventTdzAvailable) || !permission.startsWith('solo_'))
    && (permission !== 'combos' || settings.modules.combos));
  // The site only looks at the roles listed here: those with at least one permission, and @everyone. The others
  // (often dozens on a big server) wait in « Ajouter un rôle »; a role removed loses its permissions.
  const everyone = item => item.name === '@everyone';
  const admins = settings.roles.filter(item => item.administrator);
  const others = settings.roles.filter(item => !item.administrator);
  const followed = item => everyone(item) || item.permissions.length > 0;
  const card = item => `<article class="adm-role" data-role="${esc(item.id)}" data-role-name="${esc(item.name)}" data-kept="${esc(JSON.stringify(item.permissions.filter(permission => !shown.includes(permission))))}" ${followed(item) ? '' : 'hidden'}>
    <div class="adm-role-name"><strong>${esc(item.name)}</strong>${everyone(item) ? `<small>Tout le serveur ${tip('Ce que tout membre du serveur peut faire, même sans rôle.')}</small>` : ''}</div>
    <div class="adm-perms">${shown.map(permission => `<label class="adm-perm"><input type="checkbox" data-permission="${permission}" aria-label="${esc(item.name)} : ${esc(PERMISSION_LABELS[permission] || permission)}" ${item.permissions.includes(permission) ? 'checked' : ''}><span>${esc(PERMISSION_SHORT[permission] || PERMISSION_LABELS[permission] || permission)}</span></label>`).join('')}</div>
    <div class="adm-role-end"><span class="settings-status" aria-live="polite"></span>${everyone(item) ? '' : '<button type="button" class="adm-role-remove" data-role-remove>Retirer</button>'}</div>
  </article>`;
  const option = item => `<option value="${esc(item.id)}" ${followed(item) ? 'hidden disabled' : ''}>${esc(item.name)}</option>`;
  const legend = `<dl class="adm-legend">${shown.map(permission => `<div><dt>${esc(PERMISSION_SHORT[permission] || PERMISSION_LABELS[permission])}</dt><dd>${esc(PERMISSION_HELP[permission])}</dd></div>`).join('')}</dl>`;
  if (!settings.roles.length) return '<ul class="adm-rows">' + row('warn', 'Les rôles du serveur ne peuvent pas être lus', 'Vérifie que le bot est bien sur ton serveur Discord.') + '</ul>';
  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return `<p class="adm-intro">Le site ne regarde que les rôles listés ici. Coche ce que chacun permet : c’est enregistré tout de suite.</p>
    <details class="adm-help"><summary>Que permet chaque autorisation ?</summary>${legend}<p>Les autorisations de plusieurs rôles s’additionnent. Les rôles se donnent sur Discord.</p></details>
    <div class="adm-roles">${[...others.filter(everyone), ...sorted.filter(item => !everyone(item))].map(card).join('')}
    <div class="adm-role-add"><label for="adm-role-add">+ Ajouter un rôle ${tip('Les rôles de ton serveur Discord que le site ne regarde pas encore.')}</label>
      <select id="adm-role-add" data-role-add><option value="">Choisir un rôle du serveur…</option>${sorted.filter(item => !everyone(item)).map(option).join('')}</select>
      <small data-role-left>${sorted.filter(item => !followed(item)).length} autres rôles sur le serveur</small></div></div>
    ${admins.length ? `<p class="adm-admins">Ont déjà tout, car « Administrateur » sur Discord : <b>${admins.map(item => esc(item.name)).join(', ')}</b> ${tip('Le propriétaire du serveur et les rôles « Administrateur » sur Discord ont toutes les autorisations du site, sans rien cocher.')}</p>` : ''}`;
}

// « Membres »: the members of the server who came to the site, with what their roles allow.
function membersMarkup(result, settings) {
  const members = Array.isArray(result.members) ? result.members : [];
  const permissions = result.permissions || [];
  const count = group => members.filter(member => {
    const access = member.permissions.includes('access') || member.permissions.includes('admin');
    return group === 'none' ? !access : group === 'admin' ? member.permissions.includes('admin') : true;
  }).length;
  const chip = (group, label) => `<button type="button" class="event-filter-button crews-filter${group === 'all' ? ' is-on' : ''}" data-member-filter="${group}" aria-pressed="${group === 'all'}">${label} · ${count(group)}</button>`;
  return `<p class="adm-intro">Les membres de ton serveur venus sur le site. Leurs rôles se donnent sur Discord ; ce qu’ils permettent se règle dans « Rôles ».</p>
    <div class="adm-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote ou un rôle…" autocomplete="off"></label>
      <button type="button" class="secondary-button" data-members-refresh data-tip="Relit tout de suite sur Discord les rôles de chaque membre. Sinon, c’est fait chaque jour.">Relire sur Discord</button></div>
    <div class="event-filter crews-filters" role="group" aria-label="Filtrer les membres">${chip('all', 'Tous')}${chip('none', 'Sans accès')}${chip('admin', 'Admins')}</div>
    <div class="members-list adm-members">${members.map(member => memberCard(member, permissions.filter(permission => permission !== 'combos' || settings.modules.combos))).join('')}</div>
    <p class="members-empty adm-empty" hidden>Aucun membre ne correspond.</p>`;
}

// Short names of the permissions (the chips) and of the modules (overview).
const PERMISSION_SHORT = {access:'Accès au site', endurance:'Endurances', solo_open:'Events OPEN', solo_safe:'Events SAFE', crews:'Équipages', combos:'Plugin SimHub', admin:'Administrer'};
const MODULE_NAMES = [['iracingImport', 'iRacing officiel'], ['soloRaces', 'Events'], ['categoryEntry', 'Inscription par catégorie'], ['combos', 'Plugin SimHub'], ['grindfest', 'Gridfest']];

// « Modules »: one line each, its switch on the right (saved at once), its settings below when it has some.
function modulesMarkup(settings, setup) {
  const states = moduleStates(settings, setup);
  const toggle = (key, label, locked = false) => `<label class="admin-switch"><input type="checkbox" role="switch" data-module="${key}" aria-label="${label}" ${states[key] ? 'checked' : ''} ${locked ? 'disabled' : ''}><i aria-hidden="true"></i></label>`;
  const tdz = settings.modules.eventTdzAvailable === true;
  const items = [
    {key:'iracingImport', name:'Endurances iRacing officielles', sub:'Importées toutes seules dans ton calendrier.', tip:tdz ? 'Les séries en équipe et les événements spéciaux d’iRacing arrivent seuls, avec leurs horaires.' : 'Les séries en équipe et les événements spéciaux d’iRacing arrivent seuls, avec leurs horaires. Avec EVENT SOLO activé, les endurances solo apparaissent aussi dans son calendrier.'},
    tdz ? {key:'soloRaces', name:'EVENT TDZ', sub:'Un calendrier d’events : places limitées, liste d’attente, OPEN ou SAFE.', tip:'Les events de toutes les simus. L’accès OPEN ou SAFE se donne par rôle, dans « Rôles ».',
      settings:`<form class="settings-safe-guide" data-safe-guide><label>Salon Discord « Comment devenir SAFE » ${tip('Lien du salon où les pilotes apprennent à passer SAFE. Il s’affiche aux pilotes qui n’ont que l’accès OPEN.')}<input name="url" type="url" maxlength="200" placeholder="https://discord.com/channels/…" value="${esc(settings.modules.safeGuideUrl || '')}"></label>
        <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form>`}
      : {key:'soloRaces', name:'EVENT SOLO', sub:'Un calendrier d’events : inscription en un clic, liste d’attente.', tip:'Les events de toutes les simus, avec des places limitées si besoin et une liste d’attente.'},
    {key:'categoryEntry', name:'Inscription par catégorie', sub:'Le pilote choisit ses catégories, les responsables forment les équipages.', tip:'Sur une course à plusieurs départs, le pilote coche ses catégories et ses départs possibles. Seuls les responsables d’équipage (autorisation « Équipages ») forment les équipages.'},
    ...(settings.modules.grindfestAvailable ? [{key:'grindfest', name:'Gridfest', sub:'Inscription par streamer.', tip:'Le pilote choisit le streamer qu’il représente et donne son nom en jeu ; le mot de passe arrive par message privé Discord.'}] : [])];
  const line = item => `<article class="adm-module${states[item.key] ? ' is-on' : ''}" data-module-tile="${item.key}">
    <div class="adm-module-line"><span class="admin-module-icon">${icon(item.key)}</span>
      <span class="adm-module-text"><strong>${item.name} ${tip(item.tip)}</strong><small>${item.sub}</small></span>
      ${item.settings && states[item.key] ? `<button type="button" class="link-button" data-module-open="${item.key}" aria-expanded="false">Régler</button>` : ''}${toggle(item.key, item.name, item.locked)}</div>
    ${item.settings ? `<div class="admin-module-settings" hidden>${item.settings}</div>` : ''}</article>`;
  return `<p class="adm-intro">Allume ce que ta communauté utilise. Chaque interrupteur s’enregistre tout de suite. Discord a son propre onglet.</p>
    <div class="adm-modules">${items.map(line).join('')}</div>`;
}

// « Apparence »: the form on the left, the preview of the site on the right.
function lookMarkup(settings) {
  const look = settings.community;
  const accent = look.accent || '#52d3d8';
  return `<p class="adm-intro">Le nom, la couleur et la bannière que voient tes membres. L’aperçu à droite change pendant que tu écris ; rien n’est gardé avant « Enregistrer ».</p>
    <div class="admin-look">
      <div class="admin-stack">
        <section class="adm-card"><form class="settings-appearance" data-appearance>
          <label>Nom de la communauté ${tip('Affiché en haut du site et dans les messages du bot.')}<input name="name" maxlength="80" required value="${esc(look.name)}"></label>
          <label><span>Nom court ${tip('Quelques lettres, affichées dans l’onglet du navigateur.')}</span><input name="shortName" maxlength="12" required value="${esc(look.shortName)}"></label>
          <div class="settings-accent"><label><span>Couleur ${tip('Couleur des boutons, des traits et des repères sur le site de ta communauté.')}</span><input name="accent" type="color" value="${esc(accent)}"></label>
            <label class="role-pill"><input type="checkbox" name="defaultAccent" ${look.accent ? '' : 'checked'}><span>Couleur d’Endurance Manager</span></label></div>
          <p class="members-help">Le logo est l’icône du serveur Discord${look.discordServer ? ` « ${esc(look.discordServer)} »` : ''} : il se change sur Discord.${look.logoUrl ? '' : ' Le serveur n’a pas d’icône : le logo du site est utilisé.'}</p>
          <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form></section>
        <section class="adm-card settings-banner-card"><h3 class="adm-label">Bannière ${tip('Image en haut du site, 2048 × 512 conseillé (4 fois plus large que haute). Tu la cadres et la zoomes avant de l’enregistrer ; elle est allégée automatiquement.')}</h3><div class="settings-banner">
          <img class="settings-banner-preview" src="${esc(look.bannerUrl || '/images/endurance-manager-banner.webp')}" alt="Bannière actuelle">
          <div class="settings-actions"><label class="secondary-button settings-banner-pick">Choisir une image<input type="file" accept="image/png,image/jpeg,image/webp" data-banner-file hidden></label>
            ${look.bannerUrl ? '<button type="button" class="secondary-button" data-banner-remove>Remettre la bannière du site</button>' : ''}<span class="settings-status" aria-live="polite"></span></div></div></section>
      </div>
      <div class="admin-preview-wrap"><p class="adm-label">Aperçu</p>
        <div class="admin-preview" data-look-preview style="--preview-accent:${esc(accent)}">
          <div class="admin-preview-banner"><img src="${esc(look.bannerUrl || '/images/endurance-manager-banner.webp')}" alt=""></div>
          <div class="admin-preview-nav">${look.logoUrl ? `<img class="admin-preview-badge" src="${esc(look.logoUrl)}" alt="">` : `<b class="admin-preview-badge" data-preview-short>${esc(String(look.shortName || look.name).slice(0, 4))}</b>`}<span>Accueil</span><span class="is-active">ENDURANCE</span><span>Mes inscriptions</span></div>
          <div class="admin-preview-body">
            <div class="admin-preview-race"><span><b>6h de Spa</b><small>samedi 20:00 · LMU</small></span><span class="admin-preview-button">M’inscrire</span></div>
            <div class="admin-preview-race"><span><b>Daytona 24h</b><small>dimanche 14:00 · iRacing</small></span><span class="admin-preview-button">M’inscrire</span></div>
          </div></div></div>
    </div>`;
}

// Requests sent from the page « Demander un espace » (demande-communaute.html): the pending ones first.
const REQUEST_STATUS = {pending:['En attente', 'request-pending'], done:['Traitée', 'request-done'], rejected:['Refusée', 'request-rejected']};
let platformRequests = [];
function requestsMarkup(requests, baseDomain, testSite) {
  platformRequests = requests;
  const pending = requests.filter(item => item.status === 'pending').length;
  const date = seconds => new Date(seconds * 1000).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
  const cards = requests.map(item => {
    const [label, css] = REQUEST_STATUS[item.status] || REQUEST_STATUS.pending;
    const actions = item.status === 'pending'
      ? `${testSite ? '' : `<button type="button" class="primary-button" data-request-fill="${esc(item.id)}">Préremplir la création</button>`}<button type="button" class="secondary-button" data-request-status="done" data-request-id="${esc(item.id)}">Marquer comme traitée</button><button type="button" class="danger-link" data-request-status="rejected" data-request-id="${esc(item.id)}">Refuser</button>`
      : `<button type="button" class="secondary-button" data-request-status="pending" data-request-id="${esc(item.id)}">Remettre en attente</button>`;
    return `<article class="request-card"><header><strong>${esc(item.communityName)}</strong><span class="request-status ${css}">${label}</span><span>le ${esc(date(item.createdAt))}</span></header>
      <dl><dt>Demandée par</dt><dd>${esc(item.requester?.name || '')} <small>(Discord ${esc(item.requester?.id || '')})</small></dd>
        <dt>Adresse souhaitée</dt><dd>${esc(item.slug)}.${esc(baseDomain || 'endurance-manager.app')} · nom court ${esc(item.shortName)}</dd>
        <dt>Serveur Discord</dt><dd>${esc(item.guildId)}${item.inviteUrl ? ` · <a href="${esc(item.inviteUrl)}" target="_blank" rel="noopener">invitation</a>` : ''}</dd>
        <dt>Simulateurs</dt><dd>${esc(item.gamesLabel)} · ${esc(item.members)} membres</dd>
        ${item.contact ? `<dt>Autre contact</dt><dd>${esc(item.contact)}</dd>` : ''}</dl>
      ${item.message ? `<blockquote>${esc(item.message)}</blockquote>` : ''}
      <div class="settings-actions">${actions}</div></article>`;
  }).join('');
  return `<section class="settings-card"><h2>Demandes de communauté${pending ? ` (${pending} en attente)` : ''}</h2>
    ${requests.length ? `<div class="request-list">${cards}</div>` : '<p class="members-help">Aucune demande pour le moment. Les gérants de serveur Discord la font depuis la page <a href="/demande-communaute.html">Demander un espace</a>.</p>'}</section>`;
}

// « Retours des testeurs »: problems and session journals sent from the plugin to this community, kept 60 days.
let platformReports = [];
const REPORT_KINDS = {signal:'Problème signalé', journal:'Journal de séance'};
function reportsMarkup(reports) {
  const day = seconds => new Date(seconds * 1000).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  const rows = reports.map(item => `<article class="platform-row platform-report"><div><strong>${esc(item.pilot)} · ${esc(REPORT_KINDS[item.kind] || item.kind)}</strong>
    <span>${esc(day(item.at))}${item.version ? ` · plugin ${esc(item.version)}` : ''}</span>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>
    <button type="button" class="secondary-button" data-report="${esc(item.id)}">Télécharger</button></article>`).join('');
  return `<section class="settings-card"><h2>Retours des testeurs (${reports.length})</h2><p class="members-help">Envoyés depuis le plugin par les pilotes de cette communauté. Ils restent 60 jours.</p>
    ${reports.length ? `<div class="platform-list">${rows}</div>` : '<p class="members-help">Aucun retour pour l’instant.</p>'}</section>`;
}

installDiscordSupervision(app, {api, esc, diagWhen});
installIracingSupervision(app, api);

async function platformMarkup() {
  // The testers' reports sent from the plugin to this community (module Plugin SimHub open here), else nothing.
  const [{communities, baseDomain, showcase, testSite, official}, {requests}, reports] = await Promise.all([api('/api/platform/communities'), api('/api/platform/community-requests'),
    api('/api/combos/reports').then(result => result.reports, () => null)]);
  platformReports = reports || [];
  const rows = communities.map(item => `<article class="platform-row"><div><strong>${esc(item.name)}</strong><a href="${esc(item.url)}/" target="_blank" rel="noopener">${esc(item.url.replace(/^https:\/\//, ''))}</a></div>
    <span>${item.discordServer ? `Discord « ${esc(item.discordServer)} »` : item.guildId ? `Serveur ${esc(item.guildId)}` : 'Aucun serveur'}</span>
    <span class="${item.botPresent ? 'platform-ok' : 'platform-ko'}">${item.botPresent ? '✓ Bot présent' : item.botInviteUrl ? `<a href="${esc(item.botInviteUrl)}" target="_blank" rel="noopener">Bot absent : lien d’invitation</a>` : 'Bot absent'}</span><button type="button" class="danger-link platform-delete" data-delete-community="${esc(item.slug)}" data-name="${esc(item.name)}">Supprimer</button></article>`).join('');
  const plugin = communities.map(item => `<label class="platform-row platform-plugin"><strong>${esc(item.name)}</strong><span class="admin-switch"><input type="checkbox" role="switch" data-platform-plugin="${esc(item.slug)}" aria-label="Plugin SimHub pour ${esc(item.name)}" ${item.plugin ? 'checked' : ''}><i aria-hidden="true"></i></span></label>`).join('');
  return `${SUPERVISION_PANEL}${IRACING_PANEL}${requestsMarkup(requests, baseDomain, testSite)}<section class="settings-card"><h2>Communautés (${communities.length})</h2><div class="platform-list">${rows}</div></section>
    <section class="settings-card"><h2>Plugin SimHub</h2><p class="members-help">Ouvre l’onglet Plugin SimHub d’une communauté. Ses administrateurs donnent ensuite l’autorisation « Plugin SimHub » aux rôles.</p><div class="platform-list">${plugin}</div></section>
    ${reports ? reportsMarkup(reports) : ''}
    ${testSite ? `<section class="settings-card"><h2>Nouvelle communauté</h2><p class="members-help">Ce site est la version de test : une communauté créée ici n’est pas accessible à son adresse. Crée-la depuis <a href="https://endurance-manager.app/members.html">endurance-manager.app</a>.</p></section>` : `<section class="settings-card"><h2>Nouvelle communauté</h2>
      <p class="members-help">Les administrateurs du serveur Discord deviennent automatiquement administrateurs de la communauté. Ils terminent ensuite l’installation dans « Administration → Vue d’ensemble ».</p>
      <form class="settings-appearance" data-new-community>
        <label>Nom de la communauté<input name="name" maxlength="80" required placeholder="Ex. : Team Rookie Racing"></label>
        <label>Nom court <small>(onglet du navigateur)</small><input name="shortName" maxlength="12" required placeholder="Ex. : TRR"></label>
        <label>Adresse du site<span class="platform-slug"><input name="slug" maxlength="40" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" placeholder="team-rookie"><span>.${esc(baseDomain || 'endurance-manager.app')}</span></span></label>
        <label>ID du serveur Discord<input name="guildId" inputmode="numeric" required pattern="[0-9]{15,22}" placeholder="Ex. : 1269541162025353289"></label>
        <p class="members-help">Pour l’ID : sur Discord, active <strong>Paramètres utilisateur → Avancés → Mode développeur</strong>, puis fais un clic droit sur l’icône du serveur et choisis <strong>Copier l’identifiant du serveur</strong>.</p>
        <input type="hidden" name="requestId">
        <div class="settings-actions"><button class="primary-button" type="submit">Créer la communauté</button><span class="settings-status" aria-live="polite"></span></div>
      </form><div data-created></div></section>`}
    ${official ? `<section class="settings-card"><h2>Discord officiel${official.discordServer ? ` « ${esc(official.discordServer)} »` : ''}</h2>
      <p class="members-help">Le bot crée les catégories, salons, forums et rôles qui manquent. Il ne touche pas à ce qui existe déjà. Il lui faut le rôle Administrateur le temps de la mise en place.</p>
      ${official.botPresent ? '' : official.botInviteUrl ? `<p class="members-help"><a href="${esc(official.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot sur le serveur</a></p>` : ''}
      <div class="settings-actions"><button type="button" class="primary-button" data-official-setup>Mettre en place le serveur</button><span class="settings-status" aria-live="polite"></span></div></section>` : ''}
    ${showcase ? `<section class="settings-card"><h2>Site officiel</h2>
      <p class="members-help">L’adresse principale devient la communauté officielle d’Endurance Manager, reliée au Discord officiel. Les courses et pilotes fictifs de la vitrine sont supprimés.</p>
      <form class="settings-appearance" data-official>
        <label>ID du serveur Discord officiel<input name="guildId" inputmode="numeric" required pattern="[0-9]{15,22}" placeholder="Ex. : 1269541162025353289"></label>
        <label>Confirmation<input name="confirm" autocomplete="off" required placeholder="Tape OFFICIEL pour confirmer"></label>
        <div class="settings-actions"><button class="primary-button" type="submit">Devenir le site officiel</button><span class="settings-status" aria-live="polite"></span></div></form></section>` : ''}
    ${showcase ? `<section class="settings-card showcase-reset"><h2>Vitrine de l’adresse principale</h2>
      <p class="members-help">Remplace <strong>toutes</strong> les données de ce site (courses, inscriptions, équipages, pilotes, réglages) par des courses et des pilotes fictifs, datés à partir d’aujourd’hui, et le détache de tout serveur Discord. Le calendrier iRacing officiel est ensuite réimporté. Les données actuelles sont définitivement supprimées.</p>
      <form class="setup-form setup-inline" data-showcase><input name="confirm" autocomplete="off" placeholder="Tape VITRINE pour confirmer">
        <button class="primary-button showcase-danger" type="submit">Réinitialiser la vitrine</button><span class="settings-status" aria-live="polite"></span></form></section>` : ''}`;
}

let openTab = '', openView = '', openModule = '';
// The tabs, also in the address (#roles, #discord…) so a link or a reload opens the same one.
const SECTIONS = [['overview', 'Vue d’ensemble'], ['roles', 'Rôles'], ['members', 'Membres'], ['discord', 'Discord'], ['modules', 'Modules'], ['look', 'Apparence']];
const TAB_ALIASES = {people:'roles'};
async function load() {
  try {
    const session = await api('/api/session');
    // A visitor who is not signed in goes to the welcome screen (Discord sign-in).
    if (!session.user) { location.replace('/'); return; }
    if (!(session.permissions || []).includes('admin')) throw new Error('Accès réservé aux administrateurs de la communauté.');
    const [result, settings, setup, platform] = await Promise.all([api('/api/members'), api('/api/community/settings'), api('/api/community/setup'),
      session.manager ? platformMarkup() : Promise.resolve('')]);
    const members = Array.isArray(result.members) ? result.members : [];
    const overview = overviewMarkup(setup, settings, members);
    // The showcase (main address) has no Discord server and nobody real: only modules and appearance there.
    const sections = SECTIONS.filter(([key]) => !session.openSite || !['overview', 'roles', 'members', 'discord'].includes(key));
    if (platform) sections.push(['platform', 'Plateforme']);
    const panels = {overview:overview.html, roles:rolesMarkup(settings), members:membersMarkup(result, settings), discord:discordTabMarkup(setup, settings, settings.community),
      modules:modulesMarkup(settings, setup), look:lookMarkup(settings), platform:platform ? `<p class="adm-intro">Visible seulement des gestionnaires d’Endurance Manager : les demandes, les communautés et le Discord officiel.</p>${platform}` : ''};
    const wanted = TAB_ALIASES[openTab || location.hash.slice(1)] || openTab || location.hash.slice(1);
    const current = sections.some(([key]) => key === wanted) ? wanted : sections[0][0];
    app.innerHTML = `<div class="crews-head adm-head"><h1 class="page-title">ADMINISTRATION</h1><p class="crews-lead">${esc(settings.community?.name || '')} · les réglages du site et du bot Discord.</p></div>
      <div class="event-filter crews-filters adm-tabs" role="tablist" aria-label="Administration">
        ${sections.map(([key, label]) => `${key === 'platform' ? '<span class="crews-sep" aria-hidden="true"></span>' : ''}<button type="button" role="tab" id="adm-tab-${key}" aria-controls="adm-panel-${key}" class="event-filter-button crews-filter adm-tab${key === current ? ' is-on' : ''}" data-tab="${key}" aria-selected="${key === current}" tabindex="${key === current ? 0 : -1}">${label}${key === 'overview' && overview.todo ? ` <b class="nav-count" data-todo-badge>${overview.todo}</b>` : ''}</button>`).join('')}
      </div>
      ${sections.map(([key]) => `<section class="adm-panel${key === 'platform' ? ' community-settings' : ''}" id="adm-panel-${key}" data-panel="${key}" role="tabpanel" aria-labelledby="adm-tab-${key}" ${key === current ? '' : 'hidden'}>${helpContext('admin-'+key)}${panels[key]}</section>`).join('')}`;
    openTab = current;
    for (const form of app.querySelectorAll('[data-discord-form]')) discordRefresh(form);
    void fillTodo(session.community?.id);
    if (openModule === 'discord') openDiscordSheet(app, api, true);
    else if (openModule) openModuleSettings(openModule);
    openView = ''; openModule = '';
  } catch (error) {
    renderError(error.message || String(error));
  }
}
// The endurances of both simulators: pilots without a crew, empty crews and times to confirm, one line each
// in « À régler » (the details are on the « Équipages » page).
async function fillTodo(communityId) {
  const box = app.querySelector('[data-admin-todo]');
  if (!box) return;
  try {
    const lists = await Promise.all(['lmu', 'iracing'].map(game => api(`/api/races?game=${game}&scope=upcoming`)
      .then(result => todoItems((result.events || []).filter(event => String(event.circuit || '').startsWith('iracing-') === (game === 'iracing')), game, Date.now(), undefined, communityId))));
    const items = lists.flat();
    const names = list => [...new Set(list.map(item => item.name))];
    const kinds = [['bad', 'sans équipage', 'Des pilotes inscrits attendent un équipage', 'Les responsables les placent depuis la page Équipages.'],
      ['warn', 'sans pilote', 'Des équipages n’ont aucun pilote', 'À compléter ou à supprimer depuis la page Équipages.'],
      ['warn', 'Horaires', 'Des courses ont leurs horaires à confirmer', 'Ajoute les horaires en modifiant la course.']];
    const lines = kinds.map(([tone, match, title, sub]) => {
      const found = items.filter(item => item.text.includes(match));
      if (!found.length) return '';
      const race = found[0], link = match === 'Horaires' ? `/${race.game}/#event=${esc(race.eventId)}` : `/${race.game}/#equipages`;
      return row(tone, `${title} · ${names(found).length} course${names(found).length > 1 ? 's' : ''}`, `${esc(names(found).slice(0, 3).join(', '))}${names(found).length > 3 ? '…' : ''}. ${sub}`,
        `<a class="secondary-button" href="${link}">${match === 'Horaires' ? 'Ouvrir la course' : 'Ouvrir Équipages'}</a>`);
    }).filter(Boolean);
    if (!lines.length) return;
    const problems = Number(box.dataset.problems || 0), total = problems + lines.length;
    box.innerHTML = (problems ? box.innerHTML : '') + lines.join('');
    app.querySelector('[data-todo-count]').textContent = `· ${total}`;
    const tab = app.querySelector('[data-tab="overview"]');
    const badge = tab.querySelector('[data-todo-badge]');
    if (badge) badge.textContent = total; else tab.insertAdjacentHTML('beforeend', ` <b class="nav-count" data-todo-badge>${total}</b>`);
  } catch { /* the races could not be read: « À régler » keeps what it has */ }
}
function openModuleSettings(key, open = true) {
  const tile = app.querySelector(`[data-module-tile="${key}"]`), settings = tile?.querySelector('.admin-module-settings');
  if (!settings) return;
  settings.hidden = !open; tile.classList.toggle('is-open', open);
  const button = tile.querySelector('[data-module-open]');
  if (button) { button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Fermer' : 'Régler'; }
}
function selectTab(key, focus = false) {
  for (const button of app.querySelectorAll('[data-tab]')) {
    const on = button.dataset.tab === key;
    button.setAttribute('aria-selected', String(on)); button.classList.toggle('is-on', on); button.tabIndex = on ? 0 : -1;
    if (on && focus) button.focus();
  }
  for (const panel of app.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== key;
  openTab = key;
  history.replaceState(null, '', key === 'overview' ? location.pathname : `#${key}`);
}

// Reloads the page content and comes back to the same tab.
async function reload(tab, {view = '', module = ''} = {}) { openTab = tab; openView = view; openModule = module; await load(); }

app.addEventListener('click', async event => {
  const roleRemove = event.target.closest('[data-role-remove]');
  if (roleRemove) {
    // Asked once more on the button itself: the role loses all its permissions.
    if (!roleRemove.dataset.confirm) { roleRemove.dataset.confirm = '1'; roleRemove.textContent = 'Confirmer'; roleRemove.classList.add('is-danger'); return; }
    const card = roleRemove.closest('[data-role]'), status = card.querySelector('.settings-status');
    roleRemove.disabled = true;
    try {
      await api(`/api/community/roles/${card.dataset.role}`, 'PUT', {permissions:[]});
      for (const input of card.querySelectorAll('input[data-permission]')) input.checked = false;
      card.dataset.kept = '[]';
      card.hidden = true;
      roleOption(card.dataset.role, true);
    } catch (error) { status.textContent = error.message; }
    finally { roleRemove.disabled = false; delete roleRemove.dataset.confirm; roleRemove.textContent = 'Retirer'; roleRemove.classList.remove('is-danger'); }
    return;
  }
  const go = event.target.closest('[data-go-tab]');
  if (go) {
    selectTab(go.dataset.goTab);
    scrollTo({top:0, behavior:'smooth'});
    return;
  }
  if (event.target.closest('[data-discord-open]')) { openDiscordSheet(app, api); return; }
  if (event.target.closest('[data-discord-close]')) { closeDiscordSheet(app); return; }
  const filter = event.target.closest('[data-member-filter]');
  if (filter) {
    for (const chip of app.querySelectorAll('[data-member-filter]')) { const on = chip === filter; chip.setAttribute('aria-pressed', String(on)); chip.classList.toggle('is-on', on); }
    filterMembers();
    return;
  }
  if (event.target.closest('[data-setup-refresh]')) { await reload('overview'); return; }
  const officialSetup = event.target.closest('[data-official-setup]');
  if (officialSetup) {
    const status = officialSetup.parentElement.querySelector('.settings-status');
    officialSetup.disabled = true; status.textContent = 'Mise en place…';
    try {
      const {made, moved = []} = await api('/api/platform/official/setup', 'POST', {});
      status.textContent = made.length || moved.length
        ? `✓ ${[made.length && `Créé : ${made.join(', ')}.`, moved.length && `Rangé : ${moved.join(', ')}.`].filter(Boolean).join(' ')}` : '✓ Tout était déjà en place.';
    } catch (error) { status.textContent = error.message; }
    officialSetup.disabled = false;
    return;
  }
  const modulesRefresh = event.target.closest('[data-modules-refresh]');
  if (modulesRefresh) { const discord = modulesRefresh.dataset.modulesRefresh === 'discord'; await reload(discord ? 'discord' : 'modules', {module:discord ? '' : modulesRefresh.dataset.modulesRefresh}); return; }
  const moduleOpen = event.target.closest('[data-module-open]');
  if (moduleOpen) { openModuleSettings(moduleOpen.dataset.moduleOpen, moduleOpen.getAttribute('aria-expanded') !== 'true'); return; }
  const refresh = event.target.closest('[data-members-refresh]');
  if (refresh) {
    refresh.disabled = true; refresh.textContent = 'Actualisation…';
    try { await api('/api/members/refresh', 'POST', {}); await reload('members'); }
    catch (error) { refresh.disabled = false; refresh.textContent = 'Actualiser depuis Discord'; alert(error.message); }
    return;
  }
  // A tester's report: its journal saved as a file.
  const report = event.target.closest('[data-report]');
  if (report) {
    const item = platformReports.find(entry => entry.id === report.dataset.report);
    if (!item) return;
    report.disabled = true;
    try {
      const {data} = await api(`/api/combos/reports/${encodeURIComponent(item.id)}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify({...item, data}, null, 2)], {type:'application/json'}));
      const link = Object.assign(document.createElement('a'), {href:url, download:`retour-${item.pilot}-${new Date(item.at * 1000).toISOString().slice(0, 16)}.json`.replace(/[^\w.-]+/g, '-')});
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { alert(error.message); } finally { report.disabled = false; }
    return;
  }
  const remove = event.target.closest('[data-delete-community]');
  if (remove) {
    if (!confirm(`Supprimer la communauté « ${remove.dataset.name} » ? Seule une communauté sans course ni pilote peut l’être.`)) return;
    remove.disabled = true;
    try { await api(`/api/platform/communities/${encodeURIComponent(remove.dataset.deleteCommunity)}`, 'DELETE'); await reload('platform'); }
    catch (error) { remove.disabled = false; alert(error.message); }
    return;
  }
  // A request fills the form « Nouvelle communauté »; creating the community closes the request.
  const fill = event.target.closest('[data-request-fill]');
  if (fill) {
    const item = platformRequests.find(request => request.id === fill.dataset.requestFill), form = app.querySelector('form[data-new-community]');
    if (!item || !form) return;
    form.elements.name.value = item.communityName; form.elements.shortName.value = item.shortName;
    form.elements.slug.value = item.slug; form.elements.guildId.value = item.guildId; form.elements.requestId.value = item.id;
    form.scrollIntoView({behavior:'smooth', block:'center'}); form.elements.name.focus({preventScroll:true});
    return;
  }
  const requestStatus = event.target.closest('[data-request-status]');
  if (requestStatus) {
    requestStatus.disabled = true;
    try { await api(`/api/platform/community-requests/${encodeURIComponent(requestStatus.dataset.requestId)}`, 'PATCH', {status:requestStatus.dataset.requestStatus}); await reload('platform'); }
    catch (error) { requestStatus.disabled = false; alert(error.message); }
    return;
  }
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    const field = document.getElementById(copy.dataset.copy);
    try { await navigator.clipboard.writeText(field.value); copy.textContent = '✓ Copié'; } catch { field.select(); }
    setTimeout(() => { copy.textContent = 'Copier'; }, 2000);
    return;
  }
  if (event.target.closest('[data-banner-cancel]')) { closeCropper(event.target.closest('.settings-banner')); return; }
  const canvas = cropCanvas();
  if (event.target.closest('[data-banner-save]') && canvas) {
    const container = event.target.closest('.settings-banner'), status = container.querySelector('.settings-status');
    status.textContent = 'Envoi…';
    if (container.dataset.imageKind === 'bot') {
      try {
        const image = await botImage(canvas);
        const response = await fetch('/api/community/bot-avatar', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':image.type}, body:image});
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'L’envoi a échoué.');
        resetCropper();
        await reload('look');
      } catch (error) { status.textContent = error.message; }
      return;
    }
    try {
      const image = await bannerImage(canvas);
      const response = await fetch('/api/community/banner', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':image.type}, body:image});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'L’envoi a échoué.');
      for (const img of document.querySelectorAll('.hero-banner, .settings-banner-preview')) { img.removeAttribute('srcset'); img.src = result.bannerUrl; }
      resetCropper();
      await reload('look');
    } catch (error) { status.textContent = error.message; }
    return;
  }
  if (event.target.closest('[data-bot-avatar-remove]')) {
    if (!confirm('Remettre le logo d’Endurance Manager sur ton serveur Discord ?')) return;
    try { await api('/api/community/bot-avatar', 'DELETE', {}); await reload('look'); } catch (error) { alert(error.message); }
    return;
  }
  if (event.target.closest('[data-banner-remove]')) {
    if (!confirm('Remettre la bannière du site ?')) return;
    try { await api('/api/community/banner', 'DELETE', {}); await reload('look'); } catch (error) { alert(error.message); }
    return;
  }
  const discordButton = event.target.closest('[data-discord-form] button[type="button"]');
  // Phone: the previous or next question.
  if (discordButton?.matches('[data-discord-step]')) {
    const form = discordButton.closest('[data-discord-form]');
    form._step = Math.max(0, (form._step || 0) + Number(discordButton.dataset.discordStep));
    discordPage(form); form.scrollIntoView({block:'start'});
    return;
  }
  if (discordButton && !discordButton.matches('[data-modules-refresh]')) {
    const form = discordButton.closest('[data-discord-form]'), status = form.querySelector('.setup-actions .settings-status');
    discordButton.disabled = true; status.textContent = '';
    try {
      if (discordButton.matches('[data-discord-destinations]')) { await loadDiscordDestinations(form, api); status.textContent = '✓'; }
      else if(discordButton.matches('[data-discord-announcement-test]')){
        const channel=form.elements.announcementTestChannel.value.trim();
        if(!channel)throw new Error('Indique le salon de test.');
        status.textContent='Envoi de l’aperçu…';
        const sent=await api('/api/community/discord/announcement-test','POST',{channel});
        status.textContent=sent?.poster?'✓ Affiche envoyée dans le salon choisi, sans mention.':'✓ Aperçu envoyé en texte : l’affiche n’a pas pu être créée (navigateur Cloudflare non réglé).';
      }
      else if (discordButton.matches('[data-discord-preview]')) {
        const preview = form.querySelector('[data-recap-preview]'), input = discordInput(form);
        preview.textContent = 'Chargement de l’aperçu…';
        const result = await api('/api/community/recap/preview','POST',input);
        // A late answer never replaces a newer choice.
        if (JSON.stringify(discordInput(form)) === JSON.stringify(input)) preview.innerHTML = recapPreviewMarkup(result.previews);
      } else if (discordButton.matches('[data-discord-repair]')) {
        status.textContent = 'Réparation…';
        const result = await api('/api/community/recap/repair','POST',{});
        await reload('discord',{module:'discord'});
        app.querySelector('[data-discord-form] .setup-actions .settings-status').textContent = result.queued ? 'Une synchronisation est en cours. Réessaie dans un instant.' : '✓ Salons et messages vérifiés, réglages conservés.';
      } else if (discordButton.matches('[data-discord-remove]')) {
        // Asked twice, on the button itself.
        if (!discordButton.dataset.confirm) {
          discordButton.dataset.confirm = '1'; discordButton.textContent = 'Confirmer : tout retirer';
          status.textContent = 'Le bot supprime ses messages, salons, catégories et vocaux. Tes réponses restent pour la prochaine fois.';
          return;
        }
        status.textContent = 'Retrait…';
        const result = await api('/api/community/discord','DELETE',{});
        await reload('discord',{module:'discord'});
        app.querySelector('[data-discord-form] .setup-actions .settings-status').textContent = result.done ? '✓ Tout est retiré.' : 'Retrait commencé : le bot finit dans quelques minutes (les vocaux occupés attendent d’être vides).';
      }
    } catch (error) { status.textContent = error.message; }
    finally { discordButton.disabled = false; }
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) selectTab(tab.dataset.tab);
});

app.addEventListener('input', event => {
  if (event.target.matches?.('[data-banner-zoom]') && cropCanvas()) { setZoom(Number(event.target.value)); return; }
  const look = event.target.closest?.('form[data-appearance]');
  if (look) { updatePreview(look); return; }
  if (event.target.name === 'memberSearch') filterMembers();
});
// Members: the search and the chosen chip (all, without access, admins) together.
function filterMembers() {
  const query = (app.querySelector('input[name="memberSearch"]')?.value || '').trim().toLocaleLowerCase('fr-FR');
  const group = app.querySelector('[data-member-filter][aria-pressed="true"]')?.dataset.memberFilter || 'all';
  let visible = 0;
  for (const row of app.querySelectorAll('.members-row')) {
    const match = (!query || row.dataset.search.includes(query)) && (group === 'all' || row.dataset.group === group || (group === 'admin' && row.dataset.group === 'admin'));
    row.hidden = !match;
    if (match) visible += 1;
  }
  const empty = app.querySelector('.members-empty');
  if (empty) empty.hidden = visible > 0;
}

app.addEventListener('submit', async event => {
  const discord = event.target.closest('form[data-discord-form]');
  if (discord) {
    event.preventDefault();
    const status = discord.querySelector('.setup-actions .settings-status'), button = discord.querySelector('[type="submit"]');
    button.disabled = true; status.textContent = 'Enregistrement…';
    try {
      const result = await api('/api/community/discord','PUT',discordInput(discord));
      await reload('discord');
      app.querySelector('[data-discord-saved]').textContent = result.published ? '✓ Enregistré.' : result.error || 'Enregistré ; la publication sera réessayée.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
  const safeGuide = event.target.closest('form[data-safe-guide]');
  if (safeGuide) {
    event.preventDefault();
    const status = safeGuide.querySelector('.settings-status');
    status.textContent = 'Enregistrement…';
    try { await api('/api/community/modules', 'PATCH', {safeGuideUrl:safeGuide.elements.url.value}); await reload('modules', {module:'soloRaces'}); }
    catch (error) { status.textContent = error.message; }
    return;
  }
  const officialForm = event.target.closest('form[data-official]');
  if (officialForm) {
    event.preventDefault();
    const status = officialForm.querySelector('.settings-status');
    status.textContent = 'Enregistrement…';
    try { await api('/api/platform/official', 'POST', {guildId:officialForm.elements.guildId.value.trim(), confirm:officialForm.elements.confirm.value.trim()}); location.reload(); }
    catch (error) { status.textContent = error.message; }
    return;
  }
  const showcaseForm = event.target.closest('form[data-showcase]');
  if (showcaseForm) {
    event.preventDefault();
    const status = showcaseForm.querySelector('.settings-status');
    if (!confirm('Supprimer définitivement toutes les données de ce site et les remplacer par la vitrine ?')) return;
    status.textContent = 'Réinitialisation…';
    try { const result = await api('/api/platform/showcase', 'POST', {confirm:showcaseForm.elements.confirm.value.trim()}); status.textContent = `✓ Vitrine prête : ${result.races} courses fictives. Le calendrier iRacing officiel revient dans les 15 minutes.`; }
    catch (error) { status.textContent = error.message; }
    return;
  }
  const invite = event.target.closest('form[data-invite]'), created = event.target.closest('form[data-new-community]');
  if (invite || created) {
    event.preventDefault();
    const form = invite || created, status = form.querySelector('.settings-actions .settings-status, .setup-actions .settings-status, :scope > .settings-status');
    if (status) status.textContent = 'Enregistrement…';
    try {
      if (invite) {
        await api('/api/community/invite', 'PATCH', {url:form.elements.invite.value.trim() || null});
        await reload('overview');
      } else {
        const input = Object.fromEntries(['name','shortName','slug','guildId','requestId'].map(key => [key, form.elements[key].value.trim()]));
        const result = await api('/api/platform/communities', 'POST', input);
        await reload('platform');
        const message = `Ta communauté est prête sur Endurance Manager : ${result.url}/\n\n1. Invite le bot sur ton serveur Discord : ${result.botInviteUrl || '(lien indisponible)'}\n2. Connecte-toi sur ${result.url}/ avec Discord, puis ouvre « Administration » et suis les étapes de la vue d’ensemble.`;
        const box = app.querySelector('[data-created]');
        if (box) box.innerHTML = `<div class="setup-created"><strong>✓ ${esc(input.name)} est créée.</strong><p>Envoie ce message à un administrateur du serveur Discord :</p>
          <textarea id="platform-created" rows="5" readonly>${esc(message)}</textarea><div class="setup-actions">${copyButton('platform-created')}</div></div>`;
      }
    } catch (error) { if (status) status.textContent = error.message; }
    return;
  }
  const form = event.target.closest('form[data-appearance]');
  if (!form) return;
  event.preventDefault();
  const status = form.querySelector('.settings-status');
  status.textContent = 'Enregistrement…';
  try {
    await api('/api/community/appearance', 'PATCH', {name:form.elements.name.value, shortName:form.elements.shortName.value, accent:form.elements.defaultAccent.checked ? null : form.elements.accent.value});
    status.textContent = '✓ Enregistré. Recharge la page pour voir le résultat.';
  } catch (error) { status.textContent = error.message; }
});

// The preview of « Apparence » follows the form before it is saved.
function updatePreview(form) {
  const preview = app.querySelector('[data-look-preview]');
  if (!preview) return;
  const short = preview.querySelector('[data-preview-short]');
  if (short) short.textContent = (form.elements.shortName.value || form.elements.name.value || 'MC').slice(0, 4);
  preview.style.setProperty('--preview-accent', form.elements.defaultAccent.checked ? '#52d3d8' : form.elements.accent.value);
}

app.addEventListener('change', async event => {
  const box = event.target;
  if (box.matches('[data-role-add]')) {
    const card = box.value && app.querySelector(`.adm-role[data-role="${CSS.escape(box.value)}"]`);
    box.value = '';
    if (!card) return;
    card.hidden = false;
    roleOption(card.dataset.role, false);
    card.querySelector('.settings-status').textContent = '';
    card.querySelector('.adm-role-name strong').insertAdjacentHTML('afterend', '<small data-role-new>Coche ce que ce rôle permet</small>');
    card.scrollIntoView({block:'nearest', behavior:'smooth'});
    card.querySelector('input[data-permission]')?.focus({preventScroll:true});
    return;
  }
  const look = box.closest('form[data-appearance]');
  if (look) { if (box.name === 'accent') look.elements.defaultAccent.checked = false; updatePreview(look); return; }
  if (box.matches('[data-banner-file]') && box.files?.[0]) {
    const container = box.closest('.settings-banner'), status = container.querySelector('.settings-status');
    status.textContent = '';
    try { await openCropper(box.files[0], container); } catch { status.textContent = 'Cette image ne peut pas être lue : essaie un fichier PNG, JPEG ou WebP.'; }
    box.value = '';
    return;
  }
  if (box.matches('[data-banner-zoom]') && cropCanvas()) { setZoom(Number(box.value)); return; }
  // Discord: the rows and the sketch follow the choices; nothing is saved before « Activer ».
  const discord = box.closest('form[data-discord-form]');
  if (discord) { discord.querySelector('[data-recap-preview]').innerHTML = ''; discordRefresh(discord); return; }
  if (box.dataset.platformPlugin) {
    box.disabled = true;
    try { await api(`/api/platform/communities/${encodeURIComponent(box.dataset.platformPlugin)}`, 'PATCH', {plugin:box.checked}); }
    catch (error) { box.checked = !box.checked; alert(error.message); } finally { box.disabled = false; }
    return;
  }
  if (box.dataset.module) {
    box.disabled = true;
    try {
      await api('/api/community/modules', 'PATCH', {[box.dataset.module]:box.checked});
      // The solo races permissions appear or disappear with the module.
      await reload('modules');
      return;
    } catch (error) { box.checked = !box.checked; alert(error.message); } finally { box.disabled = false; }
    return;
  }
  const row = box.closest('[data-role]');
  if (!row || !box.dataset.permission) return;
  const status = row.querySelector('.settings-status');
  // Permissions not shown (solo races module off) are kept as they are.
  const permissions = [...JSON.parse(row.dataset.kept || '[]'), ...[...row.querySelectorAll('input[data-permission]:checked')].map(input => input.dataset.permission)];
  status.textContent = 'Enregistrement…';
  try { await api(`/api/community/roles/${row.dataset.role}`, 'PUT', {permissions}); status.textContent = '✓'; }
  catch (error) { box.checked = !box.checked; status.textContent = error.message; }
});

// A role listed or taken back off the list: its line in « Ajouter un rôle » follows, with the count of the others.
function roleOption(id, available) {
  const select = app.querySelector('[data-role-add]');
  const option = select?.querySelector(`option[value="${CSS.escape(id)}"]`);
  if (!option) return;
  option.hidden = !available; option.disabled = !available;
  const left = [...select.options].filter(item => item.value && !item.disabled).length;
  app.querySelector('[data-role-left]').textContent = `${left} autre${left > 1 ? 's' : ''} rôle${left > 1 ? 's' : ''} sur le serveur`;
}

// Tabs with the keyboard: arrows move along them; Escape closes the Discord window.
app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && app.querySelector('.adm-sheet')) { closeDiscordSheet(app); return; }
  const tab = event.target.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...app.querySelectorAll('[role="tab"]')], index = tabs.indexOf(tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  selectTab(tabs[next].dataset.tab, true);
});
addEventListener('hashchange', () => { const key = TAB_ALIASES[location.hash.slice(1)] || location.hash.slice(1) || 'overview'; if (app.querySelector(`[data-tab="${key}"]`)) selectTab(key); });

void load();

