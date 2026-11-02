import {helpContext} from './context-help.mjs';
import {todoItems, todoWhen} from './admin-todo.mjs';
const app = document.getElementById('members-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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

function renderError(message) {
  app.innerHTML = `<section class="members-panel members-error"><h1>Accès impossible</h1><p>${esc(message)}</p><a class="secondary-button" href="/">Retour à l’accueil</a></section>`;
}

// What each permission means (server/access.mjs, PERMISSIONS).
const PERMISSION_LABELS = {access:'Accès Endurance Manager', endurance:'Endurances', solo_open:'Événements OPEN', solo_safe:'Événements SAFE', crews:'Équipages', combos:'Fiches combo', admin:'Administrer'};
const PERMISSION_HELP = {access:'Accéder au site de la communauté. Sans cette autorisation sur au moins un rôle, le membre ne peut pas consulter les courses ni utiliser le site.', endurance:'S’inscrire aux endurances (et rejoindre un équipage existant).',
  solo_open:'S’inscrire aux événements OPEN.', solo_safe:'S’inscrire aux événements SAFE (et OPEN).',
  crews:'Créer et gérer les équipages.',
  combos:'Consulter les fiches combo de l’équipe et y envoyer ses séances avec le plugin SimHub.',
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
const tip = text => `<span class="tip-info" data-tip="${esc(text)}" tabindex="0" role="note" aria-label="${esc(text)}">ⓘ</span>`;
// One line of a list: a coloured stripe for its state, a title, a short line, an action on the right.
const row = (tone, title, sub = '', action = '') => `<li class="adm-row is-${tone}"><span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>${action}</li>`;
const goTo = (tab, label, extra = '') => `<button type="button" class="secondary-button" data-go-tab="${tab}" ${extra}>${label}</button>`;
const MODE_NAMES = {events:'Catégorie du bot', general:'Dans tes salons'};

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
    <div class="adm-role-head"><strong>${esc(item.name)}</strong>${everyone(item) ? `<small>Tout le serveur ${tip('Ce que tout membre du serveur peut faire, même sans rôle.')}</small>` : ''}<span class="settings-status" aria-live="polite"></span>
      ${everyone(item) ? '' : '<button type="button" class="adm-role-remove" data-role-remove>Retirer</button>'}</div>
    <div class="adm-perms">${shown.map(permission => `<label class="adm-perm"><input type="checkbox" data-permission="${permission}" aria-label="${esc(item.name)} : ${esc(PERMISSION_LABELS[permission] || permission)}" ${item.permissions.includes(permission) ? 'checked' : ''}><span>${esc(PERMISSION_SHORT[permission] || PERMISSION_LABELS[permission] || permission)}</span></label>`).join('')}</div>
  </article>`;
  const option = item => `<option value="${esc(item.id)}" ${followed(item) ? 'hidden disabled' : ''}>${esc(item.name)}</option>`;
  const legend = `<dl class="adm-legend">${shown.map(permission => `<div><dt>${esc(PERMISSION_SHORT[permission] || PERMISSION_LABELS[permission])}</dt><dd>${esc(PERMISSION_HELP[permission])}</dd></div>`).join('')}</dl>`;
  if (!settings.roles.length) return '<ul class="adm-rows">' + row('warn', 'Les rôles du serveur ne peuvent pas être lus', 'Vérifie que le bot est bien sur ton serveur Discord.') + '</ul>';
  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return `<p class="adm-intro">Le site ne regarde que les rôles listés ici. Ajoute ceux qui comptent pour ta communauté et coche ce qu’ils permettent : c’est enregistré tout de suite. Les autres rôles du serveur sont ignorés.</p>
    <details class="adm-help"><summary>Que permet chaque autorisation ?</summary>${legend}<p>Les autorisations de plusieurs rôles s’additionnent. Les rôles se donnent sur Discord.</p></details>
    <div class="adm-role-add"><label for="adm-role-add">Ajouter un rôle ${tip('Les rôles de ton serveur Discord que le site ne regarde pas encore.')}</label>
      <select id="adm-role-add" data-role-add><option value="">Choisir un rôle du serveur…</option>${sorted.filter(item => !everyone(item)).map(option).join('')}</select>
      <small data-role-left>${sorted.filter(item => !followed(item)).length} autres rôles sur le serveur</small></div>
    <div class="adm-roles">${[...others.filter(everyone), ...sorted.filter(item => !everyone(item))].map(card).join('')}</div>
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

// « Modules »: one tile each, its settings below it once opened.
// « Discord »: the setting asked question by question (server/discord-layout.mjs): each answer shows the questions it
// needs; on a phone, one question per screen, the server's sketch last.
const DISCORD_MODES = {
  events:['Catégorie du bot', 'Le bot crée sa propre catégorie et y range tout : les courses de la semaine (un fil par course), puis les vocaux d’équipage juste en dessous.'],
  general:['Dans tes salons', 'Tu choisis le salon où le bot écrit les courses de la semaine (un fil par course) et la catégorie où vont les vocaux d’équipage.']};
// The answers as saved, or those of a setting made before.
function discordAnswers(setup, settings) {
  const config = setup.botRecap, crews = settings.crews || {};
  if (config?.layout) return config.layout;
  const general = config?.mode === 'general';
  return {mode:config?.mode || 'events', sims:'all', split:false, showWeek:true, showEvents:settings.modules.soloRaces === true, under:'top',
    week:{all:general ? config.lmuId || config.iracingId || '' : ''}, events:general && config.calendarId ? config.calendarId : 'same',
    voices:settings.modules.crewChannels === true, pit:crews.voiceCategoryId ? 'existing' : 'bot', pitAt:crews.voiceCategoryId || 'top', reminders:settings.modules.raceReminders === true};
}
// The server as on Discord: the channels without category, then each category followed by its text channels.
// types: the channels shown (text ones; with 5, the announcement ones too).
function discordPlaces(list, types = [0]) {
  const byPosition = (a, b) => (a.position || 0) - (b.position || 0);
  const texts = list.filter(item => types.includes(item.type)).sort(byPosition);
  return [...texts.filter(item => !item.parentId), ...list.filter(item => item.type === 4).sort(byPosition)
    .flatMap(category => [category, ...texts.filter(item => item.parentId === category.id)])];
}
function discordForm(setup, settings) {
  const config = setup.botRecap, crews = settings.crews || {}, invite = crews.botInviteUrl || setup.recapBotInviteUrl;
  const leaving = config && !config.enabled && config.leftovers;
  const state = !config ? '' : `<p class="discord-state"><strong>${config.lastError ? 'Publication en erreur' : config.enabled ? 'Actif' : leaving ? 'Retrait en cours' : 'Éteint'}</strong>${config.enabled ? ` · ${DISCORD_MODES[config.mode]?.[0] || ''}` : ''}</p>
    ${config.lastError ? `<p class="settings-status" role="alert">${esc(config.lastError)}</p>` : ''}`;
  return `<form class="setup-form discord-form" data-discord-form data-solo="${settings.modules.soloRaces === true}" data-tdz="${settings.modules.eventTdzAvailable === true}" data-answers="${esc(JSON.stringify(discordAnswers(setup, settings)))}" data-start="${config?.enabled || config?.lastError || leaving ? 'end' : ''}">
    ${helpContext('recap')}${state}
    <div class="registration-progress" aria-hidden="true" data-discord-progress></div><p class="registration-step-label" data-discord-label></p>
    <div data-discord-questions></div>
    <div class="discord-end">
      <div class="discord-sketch" data-discord-sketch></div>
      <p class="members-help">Le bot crée lui-même ses catégories, salons et vocaux. Deux façons de l’inviter :</p>
      <ul class="members-help">
        <li>${invite ? `<a href="${esc(invite)}" target="_blank" rel="noopener">Lien normal</a>` : 'Lien normal'} : il a tout ce qu’il faut, sans être administrateur. Dans une catégorie privée, ajoute une exception pour lui (le rôle « Endurance Manager ») sur la catégorie elle-même, pas sur un salon : les autres accès restent privés.</li>
        <li>${setup.recapBotAdminInviteUrl ? `<a href="${esc(setup.recapBotAdminInviteUrl)}" target="_blank" rel="noopener">Lien administrateur</a>` : 'Lien administrateur'} : il voit et gère aussi les catégories privées, sans exception à ajouter.</li>
      </ul>
      <div class="setup-actions"><button type="submit" class="primary-button">${config?.enabled ? 'Enregistrer' : 'Activer'}</button><button type="button" class="secondary-button" data-discord-preview>Voir les messages</button><button type="button" class="secondary-button" data-discord-destinations>Actualiser les salons</button>${config?.lastError ? '<button type="button" class="secondary-button" data-discord-repair>Réparer</button>' : ''}${config?.enabled || leaving ? '<button type="button" class="danger-button" data-discord-remove>Tout retirer</button>' : ''}<span class="settings-status" role="status" aria-live="polite"></span></div>
      <p class="members-help">${config?.enabled ? 'Si tu changes d’avis, le bot retire ce qu’il avait créé et refait selon tes nouveaux choix. Les messages sont modifiés sans notification.' : 'Rien n’est publié avant « Activer ».'}</p>
      <details><summary>Tester une annonce dans Discord</summary><p>Envoie l’affiche d’un jour de stream avec des données d’exemple, sans mention ni inscription.</p><label>Nom ou identifiant du salon texte <input name="announcementTestChannel" placeholder="discussion"></label><button type="button" class="secondary-button" data-discord-announcement-test>Envoyer l’aperçu</button></details>
      <div data-recap-preview class="recap-live-preview"></div>
    </div>
    <div class="discord-steps"><button type="button" class="secondary-button" data-discord-step="-1">Retour</button><span data-discord-count></span><button type="button" class="primary-button" data-discord-step="1">Suivant</button></div>
  </form>`;
}
// « Diagnostic » (server/discord-diagnostic.mjs): what the bot should have made now, and where it stands. Loaded when opened.
const DIAGNOSTIC_PANEL = `<details class="discord-diagnostic" data-discord-diagnostic><summary>Diagnostic : ce que le bot a fait sur Discord</summary><div data-diagnostic-body><p class="members-help">Chargement…</p></div></details>`;
const DIAG_STATES = {ok:['ok','✓ En place'], waiting:['wait','En attente'], missing:['bad','Introuvable sur Discord']};
const diagWhen = value => value ? new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
const diagSim = sim => sim === 'iracing' ? 'iRacing' : 'LMU';
function diagnosticMarkup(result) {
  const row = (title, meta, state) => { const [tone, label] = DIAG_STATES[state] || DIAG_STATES.waiting; return `<li class="diag-row is-${tone}"><span><strong>${esc(title)}</strong><small>${esc(meta)}</small></span><b>${label}</b></li>`; };
  const list = (title, items, empty) => `<h4>${title}</h4>${items.length ? `<ul class="diag-list">${items.join('')}</ul>` : `<p class="members-help">${empty}</p>`}`;
  const {recap, voices, announcement} = result, problems = [...result.threads, ...result.crews].filter(item => item.state !== 'ok').length;
  const facts = [
    recap.on ? `Dernier passage du bot : ${recap.lastPass ? diagWhen(recap.lastPass) : 'pas encore'}` : 'Fils des courses : éteints',
    recap.waiting ? 'Des changements attendent le prochain passage (2 min au plus).' : '',
    recap.on && !recap.sameServer ? 'Le serveur choisi n’est plus celui de la communauté : relance le réglage.' : '',
    announcement.posted ? `Annonce du jour publiée (${announcement.items} course${announcement.items > 1 ? 's' : ''}).` : '',
  ].filter(Boolean);
  const errors = [recap.error, voices.error].filter(Boolean).map(text => `<p class="settings-status" role="alert">⚠️ ${esc(text)}</p>`).join('');
  return `${errors}<ul class="members-help diag-facts">${facts.map(text => `<li>${esc(text)}</li>`).join('')}</ul>
    ${recap.on ? list('Fils des courses de la semaine', result.threads.map(item => row(item.name, `${diagSim(item.sim)} · ${diagWhen(item.startsAt)}`, item.state)), 'Aucune course cette semaine.') : ''}
    ${voices.on ? list('Vocaux des équipages', result.crews.map(item => row(item.name, `${diagSim(item.sim)} · ${item.race} · ${diagWhen(item.startsAt)}`, item.state)), 'Aucun équipage cette semaine.') : ''}
    <p class="members-help">${result.liveError ? esc(result.liveError) : result.checkedLive ? 'Vérifié sur Discord à l’instant.' : '« En place » : noté par le bot. « Vérifier sur Discord » regarde s’ils existent encore.'}</p>
    <div class="setup-actions"><button type="button" class="secondary-button" data-diagnostic-live>Vérifier sur Discord</button>${problems ? '<button type="button" class="secondary-button" data-diagnostic-repair>Réparer</button>' : ''}<span class="settings-status" role="status" aria-live="polite"></span></div>`;
}
async function loadDiagnostic(panel, live = false) {
  const body = panel.querySelector('[data-diagnostic-body]');
  try { body.innerHTML = diagnosticMarkup(await api(`/api/community/discord/diagnostic${live ? '?live=1' : ''}`)); }
  catch (error) { body.innerHTML = `<p class="settings-status" role="alert">${esc(error.message)}</p>`; }
}
app.addEventListener('toggle', event => {
  const panel = event.target;
  if (panel.matches?.('[data-discord-diagnostic]') && panel.open && !panel.dataset.loaded) { panel.dataset.loaded = '1'; loadDiagnostic(panel); }
}, true);
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-diagnostic-live],[data-diagnostic-repair]');
  if (!button) return;
  const panel = button.closest('[data-discord-diagnostic]'), status = panel.querySelector('.settings-status');
  button.disabled = true; status.textContent = button.matches('[data-diagnostic-live]') ? 'Vérification…' : 'Réparation…';
  try {
    if (button.matches('[data-diagnostic-repair]')) await api('/api/community/recap/repair','POST',{});
    await loadDiagnostic(panel, button.matches('[data-diagnostic-live]'));
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
// The answers as the questions show them now (a question not shown keeps its last answer).
function discordRead(form) {
  const answers = form._answers ||= JSON.parse(form.dataset.answers || '{}'), field = name => form.elements[name];
  const radio = name => field(name) && field(name).value ? field(name).value : null;
  if (radio('mode')) answers.mode = radio('mode');
  if (radio('sims')) answers.sims = radio('sims');
  if (radio('split')) answers.split = radio('split') === 'apart';
  if (radio('voices')) answers.voices = radio('voices') === 'yes';
  if (radio('pit')) answers.pit = radio('pit');
  if (radio('copy')) answers.copy = radio('copy') === 'private';
  if (radio('pitCopy')) answers.pitCopy = radio('pitCopy') === 'private';
  for (const name of ['showWeek','showEvents','reminders']) if (field(name)) answers[name] = field(name).checked;
  for (const name of ['under','events','pitAt','announce','stream','streamName']) if (field(name)) answers[name] = field(name).value.trim();
  answers.week ||= {};
  for (const key of ['all','lmu','iracing']) if (field(`week-${key}`)) answers.week[key] = field(`week-${key}`).value;
  return answers;
}
const discordSims = answers => answers.sims === 'all' ? ['lmu','iracing'] : [answers.sims];
const discordApart = answers => answers.sims === 'all' && answers.split;
const SIM_NAMES = {lmu:'LMU', iracing:'iRacing'};
// The bot's own names on Discord (as server/discord-layout.mjs): an emoji in front makes them stand out.
const BOT_NAMES = {main:'🏆 Endurance Manager', lmu:'🔴 LMU', iracing:'🔵 iRacing'};
// Where the events go: apart, the bot's category is the one of a sim (« LMU » or « iRacing »).
const discordEvents = answers => discordApart(answers) && answers.events === 'bot' ? `bot-${discordSims(answers).find(sim => answers.week?.[sim] === 'bot') || 'lmu'}`
  : !discordApart(answers) && answers.events?.startsWith('bot-') ? 'bot' : answers.events || '';
// The categories the bot makes for the races and the week's channels (as server/discord-layout.mjs).
function discordBotCategories(answers) {
  if (answers.mode === 'events') return discordApart(answers) ? [BOT_NAMES.lmu,BOT_NAMES.iracing] : [BOT_NAMES.main];
  if (discordApart(answers)) return discordSims(answers).filter(sim => answers.week?.[sim] === 'bot' || discordEvents(answers) === `bot-${sim}`).map(sim => BOT_NAMES[sim]);
  return [answers.week?.all, discordEvents(answers)].includes('bot') ? [BOT_NAMES.main] : [];
}
const discordUsesBot = answers => discordBotCategories(answers).length > 0;
// Apart, each sim's channel is « endurances-de-la-semaine »; both just below the same place, they need their own names.
const discordWeekChannel = (answers, sim) => {
  const here = answers.week?.[sim], other = answers.week?.[sim === 'lmu' ? 'iracing' : 'lmu'];
  return `📅・${here && here !== 'bot' && here === other ? `endurances-${sim}-de-la-semaine` : 'endurances-de-la-semaine'}`;
};
const quoted = names => names.map(name => `« ${name} »`).join(' et ');
// The questions these answers need, in order.
function discordQuestions(form, answers) {
  const list = form._destinations, solo = form.dataset.solo === 'true', race = answers.mode === 'events', apart = discordApart(answers);
  const places = list ? discordPlaces(list) : [];
  const radio = (name, value, label, checked) => `<label class="discord-pill"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}> ${label}</label>`;
  const known = (value, label) => value && !['top','bot','same','bot-lmu','bot-iracing'].includes(value) && !places.some(item => item.id === value || `in:${item.id}` === value) ? `<option value="${esc(value)}" selected>${esc(label || 'Choix enregistré')}</option>` : '';
  // Written in a channel of the server: its own rights count.
  const inside = (item, value) => `<option value="in:${esc(item.id)}" ${`in:${item.id}` === value ? 'selected' : ''}>Dans # ${esc(item.name)}${item.insideReady === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
  const option = (item, value, inside = false, rights = true) => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${inside ? 'Juste sous ' : ''}${item.type === 0 ? `# ` : '📁 '}${esc(item.name)}${item.type === 4 && item.private ? ' · privée' : ''}${rights && item.ready === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
  // A place for a recap: not shown, a category the bot makes, or just below a channel or category of the server.
  const place = (name, value, extra = '', bots = [['bot', apart && name.startsWith('week-') ? SIM_NAMES[name.slice(5)] : 'Endurance Manager']]) => `<select name="${name}"><option value="" ${!value ? 'selected' : ''}>Ne pas afficher</option>${extra}
    ${bots.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>Dans « ${label} », créée par le bot</option>`).join('')}<optgroup label="Ou juste sous…">${places.map(item => option(item, value, true)).join('')}${known(value)}</optgroup><optgroup label="Ou dans ce salon…">${places.filter(item => item.type === 0).map(item => inside(item, value)).join('')}</optgroup></select>`;
  // rights: only where the bot writes inside; placing its own category just below needs no rights there.
  const category = (name, value, rights = false) => `<select name="${name}"><option value="top" ${value === 'top' ? 'selected' : ''}>Le haut du serveur</option>${places.filter(item => item.type === 4).map(item => option(item, value, false, rights)).join('')}${known(value)}</select>`;
  const help = value => {
    if (value?.startsWith('in:')) { const chosen = places.find(item => `in:${item.id}` === value); return chosen?.insideReady === false ? discordInsideHelp(chosen) : ''; }
    const chosen = places.find(item => item.id === value); return chosen?.ready === false ? discordRightsHelp(chosen) : '';
  };
  // Below a private category, the bot's own one is private like it (its rights copied) or open to all: the admins choose.
  const privacy = (name, at, label, value) => {
    const chosen = places.find(item => item.id === at && item.type === 4);
    if (!chosen?.private) return '';
    return `<div class="discord-pills">${radio(name,'private',`Privée comme « ${esc(chosen.name)} »`,value !== false)}${radio(name,'public','Publique',value === false)}</div>
      <p class="members-help">${value !== false ? `Seuls ceux qui voient « ${esc(chosen.name)} » verront ${label}.` : `Tout le serveur verra ${label}.`}</p>`;
  };
  const row = (title, sub, control, after = '') => `<label class="discord-row"><span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>${control}</label>${after}`;
  const questions = [
    ['Comment ranger les courses ?', `<div class="recap-cards">${Object.entries(DISCORD_MODES).map(([value, [title, text]]) => `<label class="recap-card"><input type="radio" name="mode" value="${value}" ${answers.mode === value ? 'checked' : ''}><span><strong>${title}</strong><small>${text}</small></span></label>`).join('')}</div>`],
    ['Quelles simus ?', `<div class="discord-pills">${radio('sims','lmu','LMU',answers.sims === 'lmu')}${radio('sims','iracing','iRacing',answers.sims === 'iracing')}${radio('sims','all','Les deux',answers.sims === 'all')}</div>`]];
  if (answers.sims === 'all') questions.push([race ? 'LMU et iRacing dans la même catégorie ?' : 'LMU et iRacing dans le même salon ?',
    `<div class="discord-pills">${radio('split','together','Ensemble',!answers.split)}${radio('split','apart','Séparés',answers.split)}</div>
    <p class="members-help">${race ? (answers.split ? 'Le bot crée « LMU » et « iRacing », chacune suivie de ses courses.' : 'Le bot crée « Endurance Manager », suivie des courses : LMU d’abord, puis iRacing, chacune par date.') : (answers.split ? 'Chaque simu a son salon.' : 'Un message par simu dans le même salon.')}</p>`]);
  // « Un fil par course »: # endurances-de-la-semaine is always there (the races' threads are in it).
  if (race) { if (solo) questions.push([apart ? 'Afficher aussi les events dans « LMU » et « iRacing » ?' : 'Afficher aussi les events dans « Endurance Manager » ?',
    `<label class="discord-check"><input type="checkbox" name="showEvents" ${answers.showEvents ? 'checked' : ''}><span><strong># ${discordEventChannel(form)}</strong><small>Les events de la semaine.</small></span></label>`]); }
  else {
    questions.push(['Où mettre les endurances de la semaine ?', (apart ? discordSims(answers).map(sim => row(SIM_NAMES[sim], `# ${discordWeekChannel(answers, sim)}`, place(`week-${sim}`, answers.week?.[sim] || ''), help(answers.week?.[sim])))
      : [row('# endurances-de-la-semaine', discordSims(answers).length > 1 ? 'LMU puis iRacing, un message chacun.' : '', place('week-all', answers.week?.all || ''), help(answers.week?.all))]).join('')
      + `<p class="members-help">${apart ? 'Dans « LMU » ou « iRacing » : le bot crée cette catégorie pour la simu, tu choisis ensuite où la placer.' : 'Dans « Endurance Manager » : le bot crée sa catégorie, tu choisis ensuite où la placer.'} Juste sous un salon : le bot crée le sien juste après, dans la même catégorie. Sous une catégorie : en tête de celle-ci, avec ses droits. Dans un salon : le bot écrit après les messages déjà là et y ouvre les fils des courses ; ses messages restent ensuite à leur place.</p>`]);
    const events = discordEvents(answers);
    if (solo) questions.push(['Où mettre les events de la semaine ?', row(`# ${discordEventChannel(form)}`, '', place('events', events, `<option value="same" ${events === 'same' ? 'selected' : ''}>Avec les endurances</option>`, apart ? discordSims(answers).map(sim => [`bot-${sim}`, SIM_NAMES[sim]]) : undefined), help(events))]);
  }
  const made = quoted(discordBotCategories(answers)), several = discordBotCategories(answers).length > 1;
  if (discordUsesBot(answers)) questions.push([several ? 'Où placer les catégories du bot ?' : 'Où placer la catégorie du bot ?', row(made, race ? 'Juste sous cette catégorie, puis les catégories des courses.' : 'Juste sous cette catégorie.', category('under', answers.under || 'top'))
    + privacy('copy', answers.under, made, answers.copy)
    + `<p class="members-help">Le bot n’a pas besoin de droits sur la catégorie choisie : il se place juste en dessous. Une catégorie privée est signalée « privée » : tu choisis alors si ${several ? 'les siennes restent publiques ou deviennent privées' : 'la sienne reste publique ou devient privée'} comme elle.</p>`]);
  questions.push(['Des vocaux d’équipage ?', `<div class="discord-pills">${radio('voices','yes','Oui',answers.voices)}${radio('voices','no','Non',!answers.voices)}</div>
    ${answers.voices && !race ? `<div class="discord-pills">${radio('pit','bot','Le bot crée « 🎙️ Pit talk »',answers.pit !== 'existing')}${radio('pit','existing','Dans une catégorie existante',answers.pit === 'existing')}</div>
      ${row(answers.pit === 'existing' ? 'Vocaux d’équipage' : '🎙️ Pit talk', answers.pit === 'existing' ? 'Le bot les crée dans' : 'Le bot la crée juste sous', category('pitAt', answers.pitAt || 'top', answers.pit === 'existing'), answers.pit === 'existing' ? help(answers.pitAt) : privacy('pitCopy', answers.pitAt, '« 🎙️ Pit talk »', answers.pitCopy))}` : ''}
    ${answers.voices && !race && answers.pit === 'existing' ? '<p class="members-help">Si cette catégorie est privée, ajoute sur Discord une exception pour le bot (le rôle « Endurance Manager ») : les vocaux qu’il y crée restent privés comme elle.</p>' : ''}
    <p class="members-help">${!answers.voices ? 'Pas de vocal : les équipages s’organisent ailleurs.' : race ? 'Juste sous les fils, nommés « 🏎️ LMU · 6h de Spa · Équipage A », LMU puis iRacing, par date. Supprimés 2 h après la course.' : 'Nommés « 🏎️ LMU · 6h de Spa · Équipage A », LMU puis iRacing, par date. Supprimés 2 h après la course.'}</p>
    <label class="discord-check"><input type="checkbox" name="reminders" ${answers.reminders ? 'checked' : ''}><span><strong>Rappels avant le départ</strong><small>${answers.voices ? '24 h avant dans la cloche du site, puis 24 h et 1 h avant dans le chat du vocal.' : '24 h avant dans la cloche du site.'}</small></span></label>`]);
  // The morning announcement: written in a text or announcement channel of the server, with @everyone.
  const channels = discordPlaces(list || [], [0,5]).filter(item => item.type !== 4), announce = answers.announce || '';
  const chosen = channels.find(item => item.id === announce);
  questions.push(['Annoncer les courses du jour ?', row('📣 Annonce du jour', 'Chaque matin à 7h30, avec @everyone : les events et endurances du jour, avec Présent et Absent.',
    `<select name="announce"><option value="" ${!announce ? 'selected' : ''}>Ne pas annoncer</option>${channels.map(item => `<option value="${esc(item.id)}" ${item.id === announce ? 'selected' : ''}>${item.parentId ? '   ' : ''}# ${esc(item.name)}${item.announceReady === false ? ' · le bot n’a pas ses droits' : ''}</option>`).join('')}${announce && !chosen ? `<option value="${esc(announce)}" selected>Choix enregistré</option>` : ''}</select>`,
    chosen?.announceReady === false ? `<p class="setup-note setup-error discord-rights">Sur Discord : clic droit sur « ${esc(chosen.name)} » › Modifier le salon › Permissions › « + » › Endurance Manager, puis coche ${esc((chosen.announceMissing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>` : '')
    + (announce ? row('📺 Lien du stream', 'Facultatif : « 📺 Lancement du stream sur Twitch à 19h45 » dans l’annonce, avec l’heure de début du stream de l’event.',
      `<input type="url" name="stream" inputmode="url" maxlength="300" placeholder="https://twitch.tv/…" value="${esc(answers.stream || '')}">`)+row('Nom du streamer','Nom affiché dans « La soirée avec… ». Sans nom renseigné, le nom de la chaîne est utilisé.',`<input name="streamName" maxlength="80" placeholder="La Praline" value="${esc(answers.streamName||'')}">`) : '')]);
  return questions;
}
const discordEventChannel = form => form.dataset.tdz === 'true' ? '🗓️・calendrier' : 'event-solo-de-la-semaine';
// The questions follow the answers; on a phone, one per screen (the sketch and the buttons last).
function discordRefresh(form) {
  const answers = discordRead(form), questions = discordQuestions(form, answers);
  form.querySelector('[data-discord-questions]').innerHTML = questions.map(([title, body], index) => `<fieldset class="discord-q" data-q="${index}"><legend>${title}</legend>${body}</fieldset>`).join('');
  // On a phone, a setting already in place opens on its summary (the sketch and its buttons); « Retour » goes to the questions.
  form._step = Math.min(form._step ?? (form.dataset.start === 'end' ? questions.length : 0), questions.length);
  discordPage(form);
  discordSketch(form, answers);
}
function discordPage(form) {
  const questions = [...form.querySelectorAll('.discord-q')], step = form._step || 0, last = questions.length;
  questions.forEach((item, index) => item.classList.toggle('is-current', index === step));
  form.querySelector('.discord-end').classList.toggle('is-current', step === last);
  form.querySelector('[data-discord-count]').textContent = step === last ? 'Aperçu' : `${step + 1} / ${last}`;
  // In the window: the bar and « Étape 2 sur 7 · … », as the creation of a race.
  form.querySelector('[data-discord-progress]').innerHTML = [...questions, null].map((_, index) => `<span class="${index <= step ? 'done' : ''}"></span>`).join('');
  form.querySelector('[data-discord-label]').textContent = step === last ? 'Dernière étape · Aperçu sur ton serveur' : `Question ${step + 1} sur ${last} · ${questions[step].querySelector('legend')?.textContent || ''}`;
  const [back, next] = form.querySelectorAll('[data-discord-step]');
  back.disabled = step === 0; next.hidden = step === last;
  next.textContent = step === last - 1 ? 'Voir le résultat' : 'Suivant';
}
// Written in a channel: what to tick on that channel.
function discordInsideHelp(destination) {
  return `<p class="setup-note setup-error discord-rights">Le bot n’a pas ses droits dans ce salon. Sur Discord : clic droit sur « ${esc(destination.name)} » › Modifier le salon › Permissions › « + » › Endurance Manager, puis coche ${esc((destination.insideMissing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>`;
}
// What to tick on Discord when the bot cannot work in the chosen place (the invitation only gives server-wide rights).
function discordRightsHelp(destination) {
  // Below a channel, the bot makes its own in that channel's category: the rights count there.
  const category = destination.type === 4 ? destination.name : destination.parentName;
  const where = category ? `clic droit sur la catégorie « ${esc(category)} » › Modifier la catégorie › Permissions › « + » › Endurance Manager` : 'Paramètres du serveur › Rôles › Endurance Manager';
  const why = category && destination.private ? `« ${esc(category)} » est privée : ajoute une exception pour le bot, les autres accès restent privés.` : 'Le bot n’a pas ses droits ici.';
  return `<p class="setup-note setup-error discord-rights">${why} Sur Discord : ${where}, puis coche ${esc((destination.missing || []).join(', '))}. Reviens ensuite sur « Actualiser les salons ».</p>`;
}
// A sketch of the server with these answers (example races and crews); what the bot makes is highlighted.
function discordSketch(form, answers = discordRead(form)) {
  const list = form._destinations || [], solo = form.dataset.solo === 'true', race = answers.mode === 'events', apart = discordApart(answers), sims = discordSims(answers);
  const texts = list.filter(item => item.type === 0).sort((a, b) => (a.position || 0) - (b.position || 0));
  const groups = [{id:'top', items:texts.filter(item => !item.parentId).map(item => ({name:`# ${item.name}`, id:item.id}))},
    ...list.filter(item => item.type === 4).sort((a, b) => (a.position || 0) - (b.position || 0)).map(item => ({id:item.id, name:item.name, items:texts.filter(text => text.parentId === item.id).map(text => ({name:`# ${text.name}`, id:text.id}))}))];
  const at = id => groups.findIndex(group => group.id === (id === 'top' ? 'top' : id));
  const after = (id, ...added) => { const index = id === 'top' ? 0 : at(id); groups.splice(index < 0 ? groups.length : index + 1, 0, ...added); };
  const RACES = {lmu:['🏎️ LMU · 6h de Spa', ['Équipage A','Équipage B']], iracing:['🏁 iRacing · 8h de Watkins Glen', ['Équipage A']]};
  const bot = name => ({name, bot:true});
  // Each race: its thread in # endurances-de-la-semaine, its crews' voices just below (Discord lists them after the texts).
  const voices = list => answers.voices ? list.flatMap(sim => RACES[sim][1].map(crew => bot(`🔊 ${RACES[sim][0]} · ${crew}`))) : [];
  const week = list => [bot('# 📅・endurances-de-la-semaine'), ...list.map(sim => bot(`　🧵 ${RACES[sim][0]}`))];
  const eventName = `# ${discordEventChannel(form)}`;
  const isPrivate = id => list.some(item => item.id === id && item.type === 4 && item.private);
  const lock = (copy, at) => copy !== false && isPrivate(at) ? ' 🔒' : '';
  const botCat = {name:`${BOT_NAMES.main}${lock(answers.copy, answers.under)}`, bot:true, items:[]};
  const simCats = Object.fromEntries(sims.map(sim => [sim, {name:`${BOT_NAMES[sim]}${lock(answers.copy, answers.under)}`, bot:true, items:[]}]));
  if (race) {
    const blocks = apart ? sims.map((sim, index) => ({name:`${BOT_NAMES[sim]}${lock(answers.copy, answers.under)}`, bot:true, items:[...week([sim]), ...(solo && answers.showEvents ? [bot(eventName)] : []), ...voices([sim])]}))
      : [{...botCat, items:[...week(sims), ...(solo && answers.showEvents ? [bot(eventName)] : []), ...voices(sims)]}];
    after(answers.under || 'top', ...blocks);
  } else {
    // A week's channel with its races' threads.
    const placeIn = (value, name, sim = null, threads = [], label = '') => {
      if (!value) return;
      if (value.startsWith('in:')) {
        // In a channel of the server: its messages after those already there, then the races' threads.
        const items = [bot(`　💬 ${label}`), ...threads.map(item => bot(`　🧵 ${RACES[item][0]}`))];
        for (const item of groups) { const index = item.items.findIndex(text => `in:${text.id}` === value); if (index >= 0) { item.items.splice(index + 1 + item.items.slice(index + 1).filter(text => text.bot && text.name.startsWith('　')).length, 0, ...items); return; } }
        return;
      }
      const items = [bot(name), ...threads.map(item => bot(`　🧵 ${RACES[item][0]}`))];
      if (value === 'bot') { (apart && sim ? simCats[sim] : botCat).items.push(...items); return; }
      if (value.startsWith('bot-')) { simCats[value.slice(4)]?.items.push(...items); return; }
      const group = groups[at(value)];
      if (group) { group.items.unshift(...items); return; }
      for (const item of groups) { const index = item.items.findIndex(text => text.id === value); if (index >= 0) { item.items.splice(index + 1, 0, ...items); return; } }
    };
    const channels = apart ? sims.map(sim => [answers.week?.[sim], `# ${discordWeekChannel(answers, sim)}`, sim, [sim]]) : [[answers.week?.all, '# 📅・endurances-de-la-semaine', null, sims]];
    for (const [value, name, sim, threads] of channels) placeIn(value, name, sim, threads, sim ? `Endurances ${SIM_NAMES[sim]}` : 'Endurances de la semaine');
    const events = discordEvents(answers);
    if (solo && events && events !== 'same') placeIn(events, eventName, null, [], 'Events de la semaine');
    const made = [botCat, ...Object.values(simCats)].filter(group => group.items.length);
    if (made.length) after(answers.under || 'top', ...made);
    if (answers.voices) {
      const voices = sims.flatMap(sim => RACES[sim][1].map(crew => bot(`🔊 ${RACES[sim][0]} · ${crew}`)));
      if (answers.pit === 'existing') (groups[at(answers.pitAt || 'top')] || groups[0]).items.push(...voices);
      else after(answers.pitAt || 'top', {name:`🎙️ Pit talk${lock(answers.pitCopy, answers.pitAt)}`, bot:true, items:voices});
    }
  }
  const lines = groups.flatMap(group => [...(group.name ? [`<li class="is-category${group.bot ? ' is-bot' : ''}">${esc(group.name)}</li>`] : []), ...group.items.map(item => `<li class="${item.name.startsWith('🔊') ? 'is-voice' : 'is-text'}${item.bot ? ' is-bot' : ''}">${esc(item.name)}</li>`)]);
  const server = form._server && !form._server.ready && discordUsesBot(answers) ? `<p class="setup-note setup-error discord-rights">Pour créer ses catégories, le bot a besoin sur ton serveur de : ${esc(form._server.missing.join(', '))}.</p>` : '';
  form.querySelector('[data-discord-sketch]').innerHTML = `<strong>Sur ton serveur</strong>${list.length ? '' : ' <small>(touche « Actualiser les salons » pour voir les tiens)</small>'}${form._destinationsError ? `<p class="setup-note setup-error">Tes salons n’ont pas pu être lus sur Discord (${esc(form._destinationsError)}). Tes choix sont gardés : réessaie dans un moment avec « Actualiser les salons ».</p>` : ''}<ul>${lines.join('')}</ul><small>En surligné : ce que crée le bot.</small>${server}`;
}
async function loadDiscordDestinations(form) {
  // Just after a change the bot is busy on Discord: one more try before saying so.
  const read = () => api('/api/community/recap/destinations');
  let result;
  try { result = await read().catch(async () => { await new Promise(resolve => setTimeout(resolve, 3000)); return read(); }); }
  catch (error) { form._destinationsError = error.message; discordRefresh(form); throw error; }
  form._destinationsError = null;
  form._destinations = result.destinations || [];
  form._server = result.server || null;
  discordRefresh(form);
}
// Copying the rights only means something below a private category.
function discordInput(form) {
  const answers = discordRead(form), list = form._destinations || [];
  const isPrivate = id => list.some(item => item.id === id && item.type === 4 && item.private);
  return {layout:{...answers, events:discordEvents(answers), copy:answers.copy !== false && isPrivate(answers.under), pitCopy:answers.pitCopy !== false && isPrivate(answers.pitAt)}};
}
const recapPreviewText = value => esc(String(value || '').replace(/<t:(\d+):[A-Za-z]>/g,(_,unix) => new Date(Number(unix)*1000).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'})).replace(/\*\*/g,''))
  .replace(/&lt;:em_([a-z0-9_]+):\d+&gt;/g,'<img src="/images/discord-emojis/$1.png" width="18" height="18" alt="">');
function recapPreviewMarkup(previews) {
  return previews.length ? previews.map(item => `<figure class="recap-preview"><figcaption># ${esc(item.name)}</figcaption>${item.payload.embeds.map(embed => `<div class="recap-preview-embed"><strong>${esc(embed.title || '')}</strong><span>${recapPreviewText(embed.description)}</span>${(embed.fields || []).map(field => `<b>${esc(field.name)}</b><span>${recapPreviewText(field.value)}</span>`).join('')}${embed.url ? `<a href="${esc(embed.url)}">Voir sur le site</a>` : ''}</div>`).join('')}</figure>`).join('') : '<p>Rien à publier pour le moment. Les prochaines courses apparaîtront toutes seules.</p>';
}
// Short names of the permissions (the chips) and of the modules (overview).
const PERMISSION_SHORT = {access:'Accès au site', endurance:'Endurances', solo_open:'Events OPEN', solo_safe:'Events SAFE', crews:'Équipages', combos:'Fiches combo', admin:'Administrer'};
const MODULE_NAMES = [['iracingImport', 'iRacing officiel'], ['soloRaces', 'Events'], ['categoryEntry', 'Inscription par catégorie'], ['combos', 'Fiches combo'], ['grindfest', 'Gridfest']];

// Why the crews' channels cannot be turned on yet (the bot's state on the server, checked by the site).
const BOT_PROBLEMS = {
  channel:'Un administrateur Discord doit autoriser le bot dans le salon ou sa catégorie. Les autres accès restent privés.',
  rights:'Touche « Donner les droits au bot », valide sur Discord, puis « C’est fait ».',
  absent:'Le bot n’est pas sur ton serveur : touche « Donner les droits au bot » pour l’ajouter avec ses droits, puis « C’est fait ».',
  config:'Le bot du site n’est pas configuré : préviens le gérant de la plateforme.',
  discord:'Discord ne répond pas pour l’instant : réessaie avec « C’est fait » dans un moment.'};

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
    // Private module: opened for a team by the platform managers, shown to the community's admins once open.
    ...(settings.modules.combosManager || states.combos ? [{key:'combos', name:'Fiches combo', sub:'Les données de practice de l’équipe, par voiture et circuit.', tip:'Énergie, pneus, rythme et arrêts, envoyés par le plugin SimHub de chaque pilote. Visible des rôles qui ont l’autorisation « Fiches combo ».', locked:!settings.modules.combosManager}] : []),
    ...(settings.modules.grindfestAvailable ? [{key:'grindfest', name:'Gridfest', sub:'Inscription par streamer.', tip:'Le pilote choisit le streamer qu’il représente et donne son nom en jeu ; le mot de passe arrive par message privé Discord.'}] : [])];
  const line = item => `<article class="adm-module${states[item.key] ? ' is-on' : ''}" data-module-tile="${item.key}">
    <div class="adm-module-line"><span class="admin-module-icon">${icon(item.key)}</span>
      <span class="adm-module-text"><strong>${item.name} ${tip(item.tip)}</strong><small>${item.sub}</small></span>
      ${item.settings && states[item.key] ? `<button type="button" class="link-button" data-module-open="${item.key}" aria-expanded="false">Régler</button>` : ''}${toggle(item.key, item.name, item.locked)}</div>
    ${item.settings ? `<div class="admin-module-settings" hidden>${item.settings}</div>` : ''}</article>`;
  return `<p class="adm-intro">Allume ce que ta communauté utilise. Chaque interrupteur s’enregistre tout de suite. Discord a son propre onglet.</p>
    <div class="adm-modules">${items.map(line).join('')}</div>`;
}

// « Discord »: where it stands, what the bot does (a summary), « Modifier » opens the questions step by step in a window.
function discordTabMarkup(setup, settings, look) {
  const config = setup.botRecap, crews = settings.crews || {}, guild = setup.guild || {};
  const answers = discordAnswers(setup, settings), voices = settings.modules.crewChannels === true;
  const leaving = config && !config.enabled && config.leftovers;
  const [tone, title] = config?.lastError ? ['bad', 'Publication en erreur'] : config?.enabled ? ['ok', `Actif · ${MODE_NAMES[config.mode] || ''}`]
    : leaving ? ['warn', 'Retrait en cours'] : ['off', 'Éteint'];
  const sub = config?.lastError ? esc(config.lastError) : config?.enabled ? 'Le bot met ton serveur à jour tout seul, toutes les 2 minutes.' : leaving ? 'Le bot finit de retirer ce qu’il avait créé.' : 'Rien n’est publié sur ton serveur. Touche « Régler Discord » pour commencer.';
  const state = `<ul class="adm-rows"><li class="adm-row is-${tone}" data-discord-state><span><strong>${title}</strong><small>${sub}</small></span>
    <span class="adm-actions"><span class="settings-status" data-discord-saved aria-live="polite"></span><button type="button" class="primary-button" data-discord-open>${config?.enabled ? 'Modifier' : 'Régler Discord'}</button></span></li></ul>`;
  const crewWarn = voices && (crews.botReady !== true || crews.lastError);
  const crewRights = !crewWarn ? '' : crews.botReady === true ? row('warn', 'Vocaux d’équipage en échec', esc(crews.lastError))
    : row('warn', 'Vocaux d’équipage : le bot n’a pas ses droits', esc(crews.botProblem === 'channel' ? `Dans « ${crews.botChannelName || 'le salon'} », un administrateur Discord doit autoriser Endurance Manager : ${(crews.botMissing || []).join(', ')}. Les autres accès restent privés.` : crews.botProblem === 'rights' && crews.botMissing?.length ? `Droits manquants : ${crews.botMissing.join(', ')}.` : BOT_PROBLEMS[crews.botProblem] || BOT_PROBLEMS.rights),
      `<span class="adm-actions">${crews.botInviteUrl && crews.botProblem !== 'channel' ? `<a class="primary-button" href="${esc(crews.botInviteUrl)}" target="_blank" rel="noopener">Donner les droits au bot</a>` : ''}<button type="button" class="secondary-button" data-modules-refresh="discord">C’est fait</button></span>`);
  const sims = {lmu:'LMU', iracing:'iRacing', all:'LMU et iRacing'}[answers.sims] || 'LMU et iRacing';
  const fact = (label, value, help) => `<div><dt>${label} ${tip(help)}</dt><dd>${value}</dd></div>`;
  const facts = config?.enabled ? `<section class="adm-block"><h2 class="adm-label">Ce que fait le bot</h2><dl class="adm-facts">
      ${fact('Courses de la semaine', `${esc(MODE_NAMES[answers.mode] || '')} · ${sims}${answers.split && answers.sims === 'all' ? ' séparés' : ''}`, answers.mode === 'events' ? 'Le lundi à 7h30, le bot publie les courses de la semaine dans # endurances-de-la-semaine et ouvre un fil par course. Les pilotes inscrits y sont ajoutés sans notification.' : 'Le lundi à 7h30, le bot publie le récap de la semaine dans le salon choisi, avec un fil par course.')}
      ${fact('Vocaux d’équipage', answers.voices ? (answers.reminders ? 'Oui, avec rappels' : 'Oui') : 'Non', 'Un salon vocal par équipage, ouvert le lundi de la semaine de la course et supprimé 2 h après la fin. Avec les rappels : 24 h et 1 h avant le départ dans son chat.')}
      ${fact('Annonce du jour', answers.announce ? 'Oui, à 7h30' : 'Non', 'Chaque matin à 7h30, une affiche des courses du jour dans le salon choisi. @everyone seulement les jours de stream.')}
      ${answers.announce ? fact('Stream', answers.stream ? esc(answers.stream.replace(/^https?:\/\//, '')) : 'Aucun', 'Facultatif : le lien et le nom du streamer s’affichent sur l’affiche des jours de stream.') : ''}
    </dl></section>` : '';
  const bot = look.discordServer ? `<section class="adm-block"><h2 class="adm-label">Logo du bot ${tip('L’image du bot, seulement sur ton serveur Discord. Le nom du bot se change directement sur Discord.')}</h2>
      <div class="settings-banner settings-bot adm-card" data-image-kind="bot">
        <div class="settings-bot-current"><img class="settings-banner-preview" src="${esc(look.botAvatarUrl || '/images/app-icon-192.png')}" alt="Logo actuel du bot"><span><b>${look.botAvatarUrl ? 'Ton logo' : 'Logo d’Endurance Manager'}</b><small>${look.botAvatarUrl ? 'Seulement sur ton serveur' : 'Le même sur tous les serveurs'}</small></span></div>
        <div class="settings-actions"><label class="secondary-button settings-banner-pick">Changer<input type="file" accept="image/png,image/jpeg,image/webp" data-banner-file hidden></label>
          ${look.botAvatarUrl ? '<button type="button" class="secondary-button" data-bot-avatar-remove>Remettre le logo du site</button>' : ''}<span class="settings-status" aria-live="polite"></span></div></div></section>` : '';
  const presence = guild.id && !guild.botPresent ? row('bad', 'Le bot n’est pas sur ton serveur', 'Invite-le d’abord : sans lui, rien ne peut être publié.', setup.botInviteUrl ? `<a class="primary-button" href="${esc(setup.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot</a>` : '') : '';
  return `<p class="adm-intro">Ce que le bot Endurance Manager fait sur ton serveur Discord : les courses de la semaine, les vocaux d’équipage et l’annonce du jour.</p>
    ${state}${presence || crewRights ? `<ul class="adm-rows">${presence}${crewRights}</ul>` : ''}
    ${facts}${config?.enabled || voices ? `<section class="adm-block">${DIAGNOSTIC_PANEL}</section>` : ''}${bot}
    <div class="adm-sheet-home" data-discord-home hidden>${discordForm(setup, settings)}</div>`;
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

// « Plateforme » (managers of Endurance Manager): the communities, and a new one.
async function platformMarkup() {
  const [{communities, baseDomain, showcase, testSite, official}, {requests}] = await Promise.all([api('/api/platform/communities'), api('/api/platform/community-requests')]);
  const rows = communities.map(item => `<article class="platform-row"><div><strong>${esc(item.name)}</strong><a href="${esc(item.url)}/" target="_blank" rel="noopener">${esc(item.url.replace(/^https:\/\//, ''))}</a></div>
    <span>${item.discordServer ? `Discord « ${esc(item.discordServer)} »` : item.guildId ? `Serveur ${esc(item.guildId)}` : 'Aucun serveur'}</span>
    <span class="${item.botPresent ? 'platform-ok' : 'platform-ko'}">${item.botPresent ? '✓ Bot présent' : item.botInviteUrl ? `<a href="${esc(item.botInviteUrl)}" target="_blank" rel="noopener">Bot absent : lien d’invitation</a>` : 'Bot absent'}</span><button type="button" class="danger-link platform-delete" data-delete-community="${esc(item.slug)}" data-name="${esc(item.name)}">Supprimer</button></article>`).join('');
  return `${requestsMarkup(requests, baseDomain, testSite)}<section class="settings-card"><h2>Communautés (${communities.length})</h2><div class="platform-list">${rows}</div></section>
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
    void fillTodo();
    if (openModule === 'discord') openDiscordSheet(true);
    else if (openModule) openModuleSettings(openModule);
    openView = ''; openModule = '';
  } catch (error) {
    renderError(error.message || String(error));
  }
}
// The endurances of both simulators: pilots without a crew, empty crews and times to confirm, one line each
// in « À régler » (the details are on the « Équipages » page).
async function fillTodo() {
  const box = app.querySelector('[data-admin-todo]');
  if (!box) return;
  try {
    const lists = await Promise.all(['lmu', 'iracing'].map(game => api(`/api/races?game=${game}&scope=upcoming`)
      .then(result => todoItems((result.events || []).filter(event => String(event.circuit || '').startsWith('iracing-') === (game === 'iracing')), game))));
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
// The Discord questions in a window, step by step (as the creation of a race). The form itself only moves:
// what was answered stays, and closing puts it back.
function openDiscordSheet(atEnd = false) {
  const form = app.querySelector('[data-discord-form]');
  if (!form || form.closest('.form-sheet-overlay')) return;
  const overlay = document.createElement('section');
  overlay.className = 'form-sheet-overlay adm-sheet';
  overlay.innerHTML = `<div class="registration-sheet form-sheet" role="dialog" aria-modal="true" aria-labelledby="discord-sheet-title"><div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="discord-sheet-title" tabindex="-1">Régler Discord</h2></div><span class="registration-workspace-actions"><button type="button" class="secondary-button registration-close-button" data-discord-close>Fermer</button></span></div><div class="form-sheet-body"></div></div>`;
  overlay.querySelector('.form-sheet-body').append(form);
  app.append(overlay);
  form._step = atEnd ? form.querySelectorAll('.discord-q').length : 0;
  discordPage(form);
  if (!form._destinations) loadDiscordDestinations(form).catch(error => { form.querySelector('.setup-actions .settings-status').textContent = error.message; });
  requestAnimationFrame(() => overlay.querySelector('h2')?.focus({preventScroll:true}));
}
function closeDiscordSheet() {
  const overlay = app.querySelector('.adm-sheet'), form = overlay?.querySelector('[data-discord-form]');
  if (form) app.querySelector('[data-discord-home]')?.append(form);
  overlay?.remove();
  app.querySelector('[data-discord-open]')?.focus();
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

// Banner: cropped to 2048 × 512 in the browser (centre) and compressed, WebP (JPEG where WebP is not available).
// Framing of a new banner by the admin: the image is dragged in a 2048 × 512 frame and zoomed with a slider
// (or the mouse wheel); it always covers the whole frame.
let cropper = null;
function drawCropper() {
  const {canvas, bitmap, zoom} = cropper, W = canvas.width, H = canvas.height;
  const scale = Math.max(W / bitmap.width, H / bitmap.height) * zoom, w = bitmap.width * scale, h = bitmap.height * scale;
  cropper.x = Math.min(0, Math.max(W - w, cropper.x ?? (W - w) / 2));
  cropper.y = Math.min(0, Math.max(H - h, cropper.y ?? (H - h) / 2));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, W, H);
  context.drawImage(bitmap, cropper.x, cropper.y, w, h);
}
function setZoom(zoom) {
  const W = cropper.canvas.width, H = cropper.canvas.height;
  // Zoom around the centre of the frame.
  const ratio = zoom / cropper.zoom;
  cropper.x = W / 2 - (W / 2 - cropper.x) * ratio;
  cropper.y = H / 2 - (H / 2 - cropper.y) * ratio;
  cropper.zoom = zoom;
  drawCropper();
}
async function openCropper(file, container) {
  const bitmap = await createImageBitmap(file);
  const bot = container.dataset.imageKind === 'bot';
  container.querySelector('.banner-cropper')?.remove();
  const box = document.createElement('div');
  box.className = `banner-cropper${bot ? ' bot-cropper' : ''}`;
  box.innerHTML = `<div class="banner-crop-frame"><canvas width="${bot ? 512 : 2048}" height="512" aria-label="${bot ? 'Cadrage du logo' : 'Cadrage de la bannière'}"></canvas></div>
    <label class="banner-crop-zoom">Zoom<input type="range" min="1" max="4" step="0.01" value="1" data-banner-zoom></label>
    <p class="members-help">Fais glisser l’image pour choisir la partie visible, et zoome si besoin.</p>
    <div class="settings-actions"><button type="button" class="primary-button" data-banner-save>${bot ? 'Enregistrer le logo' : 'Enregistrer la bannière'}</button><button type="button" class="secondary-button" data-banner-cancel>Annuler</button></div>`;
  const shown = container.querySelector('.settings-bot-current') || container.querySelector('.settings-banner-preview');
  shown.after(box);
  shown.hidden = true;
  const canvas = box.querySelector('canvas');
  cropper = {canvas, bitmap, zoom:1, x:null, y:null};
  drawCropper();
  let drag = null;
  canvas.addEventListener('pointerdown', event => { drag = {x:event.clientX, y:event.clientY}; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    cropper.x += (event.clientX - drag.x) * ratio; cropper.y += (event.clientY - drag.y) * ratio;
    drag = {x:event.clientX, y:event.clientY};
    drawCropper();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const slider = box.querySelector('[data-banner-zoom]');
    slider.value = Math.min(4, Math.max(1, cropper.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
    setZoom(Number(slider.value));
  }, {passive:false});
}
function closeCropper(container) {
  container.querySelector('.banner-cropper')?.remove();
  const preview = container.querySelector('.settings-bot-current') || container.querySelector('.settings-banner-preview');
  if (preview) preview.hidden = false;
  cropper = null;
}
async function bannerImage(canvas) {
  for (const quality of [.85, .75, .62, .5]) {
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob?.type !== 'image/webp') blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 600000) return blob;
  }
  throw new Error('Cette image reste trop lourde : essaie une image plus simple.');
}
// Logo of the bot: Discord takes PNG or JPEG only (PNG keeps the transparency).
async function botImage(canvas) {
  for (const [type, quality] of [['image/png'], ['image/jpeg', .9], ['image/jpeg', .75]]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= 1000000) return blob;
  }
  throw new Error('Cette image reste trop lourde : essaie une image plus simple.');
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
  if (event.target.closest('[data-discord-open]')) { openDiscordSheet(); return; }
  if (event.target.closest('[data-discord-close]')) { closeDiscordSheet(); return; }
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
  if (event.target.closest('[data-banner-save]') && cropper) {
    const container = event.target.closest('.settings-banner'), status = container.querySelector('.settings-status');
    status.textContent = 'Envoi…';
    if (container.dataset.imageKind === 'bot') {
      try {
        const image = await botImage(cropper.canvas);
        const response = await fetch('/api/community/bot-avatar', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':image.type}, body:image});
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'L’envoi a échoué.');
        cropper = null;
        await reload('look');
      } catch (error) { status.textContent = error.message; }
      return;
    }
    try {
      const image = await bannerImage(cropper.canvas);
      const response = await fetch('/api/community/banner', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':image.type}, body:image});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'L’envoi a échoué.');
      for (const img of document.querySelectorAll('.hero-banner, .settings-banner-preview')) { img.removeAttribute('srcset'); img.src = result.bannerUrl; }
      cropper = null;
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
      if (discordButton.matches('[data-discord-destinations]')) { await loadDiscordDestinations(form); status.textContent = '✓'; }
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
  if (event.target.matches?.('[data-banner-zoom]') && cropper) { setZoom(Number(event.target.value)); return; }
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
    card.querySelector('.adm-role-head strong').insertAdjacentHTML('afterend', '<small data-role-new>Coche ce que ce rôle permet</small>');
    card.scrollIntoView({block:'center', behavior:'smooth'});
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
  if (box.matches('[data-banner-zoom]') && cropper) { setZoom(Number(box.value)); return; }
  // Discord: the rows and the sketch follow the choices; nothing is saved before « Activer ».
  const discord = box.closest('form[data-discord-form]');
  if (discord) { discord.querySelector('[data-recap-preview]').innerHTML = ''; discordRefresh(discord); return; }
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
  if (event.key === 'Escape' && app.querySelector('.adm-sheet')) { closeDiscordSheet(); return; }
  const tab = event.target.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...app.querySelectorAll('[role="tab"]')], index = tabs.indexOf(tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  selectTab(tabs[next].dataset.tab, true);
});
addEventListener('hashchange', () => { const key = TAB_ALIASES[location.hash.slice(1)] || location.hash.slice(1) || 'overview'; if (app.querySelector(`[data-tab="${key}"]`)) selectTab(key); });

void load();


