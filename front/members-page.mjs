import {helpContext} from './context-help.mjs';
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
  const badge = member.manager ? '<span class="member-badge">Gestionnaire</span>'
    : member.discordAdmin ? '<span class="member-badge">Admin Discord</span>' : '';
  const roles = member.roles.length ? member.roles.map(role => `<span class="members-discord-role">${esc(role.name)}</span>`).join('') : '<span class="members-discord-role is-empty">Aucun rôle</span>';
  const allowed = allPermissions.filter(permission => member.permissions.includes(permission));
  const rights = allowed.length === allPermissions.length && allowed.length ? '<span class="member-right is-all">Toutes les autorisations</span>'
    : allowed.map(permission => `<span class="member-right">${esc(PERMISSION_LABELS[permission] || permission)}</span>`).join('') || '<span class="member-right is-none">Aucune autorisation</span>';
  return `<article class="members-row member-card" data-search="${search}">
    <div class="member-head"><span class="member-avatar" aria-hidden="true">${initials(member.nickname || member.name)}</span>
      <div class="members-identity"><strong>${esc(member.nickname || member.name)}</strong><small>${member.nickname ? `${esc(member.name)} · ` : ''}${esc(member.id)}</small></div>${badge}</div>
    <div class="members-discord-roles">${roles}</div>
    <div class="member-rights">${rights}</div>
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

// « Vue d'ensemble ».
function overviewMarkup(setup, settings, members) {
  const guild = setup.guild || {}, crews = settings.crews || {};
  const server = guild.name ? `« ${esc(guild.name)} »` : 'de la communauté';
  const states = moduleStates(settings, setup), active = Object.values(states).filter(Boolean).length;
  const recapDone = states.discord, voices = settings.modules.crewChannels === true;
  const tile = (label, value, sub, tone = '') => `<div class="admin-tile"><span class="admin-tile-label">${label}</span><strong class="admin-tile-value ${tone}">${value}</strong><span class="admin-tile-sub">${sub}</span></div>`;
  const tiles = `<div class="admin-tiles">
    ${tile('Serveur Discord', !guild.id ? '<i class="admin-dot is-bad"></i>Aucun' : guild.botPresent ? '<i class="admin-dot is-ok"></i>Relié' : '<i class="admin-dot is-bad"></i>Bot absent', guild.botPresent ? `Bot présent sur ${server}` : 'Personne ne peut entrer sur le site', 'is-small')}
    ${tile('Membres connectés', members.length, 'Membres du serveur venus sur le site')}
    ${tile('Modules actifs', `${active} / ${Object.keys(states).length}`, Object.entries(states).filter(([, on]) => !on).length ? 'Le reste est dans Modules' : 'Tout est allumé')}</div>`;
  // Getting started: the four steps, then the announcement once they are done.
  const steps = [
    {done:Boolean(guild.botPresent), title:'Inviter le bot sur ton serveur Discord', action:!guild.id ? '<small>Demande à un gestionnaire de relier ton serveur.</small>'
      : `${setup.botInviteUrl ? `<a class="primary-button" href="${esc(setup.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot</a>` : ''}<button type="button" class="secondary-button" data-setup-refresh>Vérifier</button>`},
    {done:Boolean(setup.rolesConfigured), title:'Choisir ce que chaque rôle peut faire', action:'<button type="button" class="secondary-button" data-go-tab="people" data-go-view="roles">Ouvrir les rôles</button>'},
    {done:recapDone, title:'Afficher les courses sur Discord', action:'<button type="button" class="secondary-button" data-go-tab="modules" data-go-module="discord">Régler Discord</button>'},
    {done:Boolean(setup.discordInviteUrl), title:'Ajouter le lien d’invitation de ton serveur', action:`<form class="admin-inline-form" data-invite><input name="invite" type="url" placeholder="https://discord.gg/…" aria-label="Lien d’invitation Discord" value="${esc(setup.discordInviteUrl || '')}"><button class="primary-button" type="submit">Ajouter</button><span class="settings-status" aria-live="polite"></span></form>`}];
  const left = steps.filter(item => !item.done).length;
  const message = `🏁 Nos courses d’endurance s’organisent maintenant sur Endurance Manager !\n👉 ${setup.siteUrl}/\n\nConnecte-toi avec ton compte Discord : tu y retrouves les courses LMU et iRacing, tu t’inscris avec tes disponibilités et tu crées ou rejoins un équipage.`;
  const announce = `<div class="admin-announce"><p>Partage l’adresse du site sur ton Discord et épingle le message dans ton salon d’annonces.</p>
    <div class="setup-inline"><input readonly id="setup-site-url" value="${esc(setup.siteUrl)}/" aria-label="Adresse du site">${copyButton('setup-site-url')}</div>
    <label class="setup-message">Message prêt à poster<textarea id="setup-announce" rows="4" readonly>${esc(message)}</textarea></label>
    <div class="setup-actions">${copyButton('setup-announce')}</div></div>`;
  const start = `<section class="admin-card"><div class="admin-card-head"><h2>${left ? 'Démarrage de la communauté' : 'Annoncer le site'}</h2>${left ? `<span class="admin-muted">${4 - left} étape${4 - left > 1 ? 's' : ''} sur 4</span>` : ''}</div>
    ${left ? `<div class="admin-progress" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${4 - left}"><i style="width:${(4 - left) * 25}%"></i></div>
    <ol class="admin-steps">${steps.map((item, index) => `<li class="${item.done ? 'is-done' : ''}"><span class="admin-step-check" aria-hidden="true">${item.done ? '✓' : index + 1}</span><span class="admin-step-title">${item.title}</span>${item.done ? '' : `<span class="admin-step-action">${item.action}</span>`}</li>`).join('')}</ol>
    <details class="admin-later"><summary>Message pour annoncer le site</summary>${announce}</details>` : announce}</section>`;
  // What needs a look: problems first, then what works.
  const alerts = [];
  if (guild.id && !guild.botPresent) alerts.push(['bad', 'Le bot n’est pas sur ton serveur Discord : personne ne peut entrer sur le site.', '']);
  if (voices && crews.botReady !== true) alerts.push(['warn', 'Vocaux d’équipage : le bot n’a pas les droits pour créer les salons.', '<button type="button" class="link-button" data-go-tab="modules" data-go-module="discord">Régler</button>']);
  else if (voices && crews.lastError) alerts.push(['warn', `Vocaux d’équipage : ${esc(crews.lastError)}`, '<button type="button" class="link-button" data-go-tab="modules" data-go-module="discord">Voir</button>']);
  if (setup.recapSetupRequired) alerts.push(['warn', 'Discord attend son réglage : choisis où le bot publie les courses.', '<button type="button" class="link-button" data-go-tab="modules" data-go-module="discord">Régler</button>']);
  if (setup.botRecap?.lastError) alerts.push(['warn', esc(setup.botRecap.lastError), '<button type="button" class="link-button" data-go-tab="modules" data-go-module="discord">Voir</button>']);
  if (states.iracingImport) alerts.push(['ok', 'Endurances iRacing officielles importées automatiquement.', '']);
  if (!alerts.some(([tone]) => tone !== 'ok')) alerts.unshift(['ok', 'Rien à signaler : tout fonctionne.', '']);
  const watch = `<section class="admin-card"><div class="admin-card-head"><h2>À surveiller</h2></div><ul class="admin-alerts">${alerts.map(([tone, text, action]) => `<li class="is-${tone}"><span>${text}</span>${action}</li>`).join('')}</ul></section>`;
  return {todo:left, html:`<div class="admin-head"><h2>Vue d’ensemble</h2><p>Ce qui marche, ce qui reste à faire et ce qui demande ton attention.</p></div>${tiles}<div class="admin-columns">${start}${watch}</div>`};
}

// « Membres et rôles »: the members, or the table of the roles.
function peopleMarkup(result, settings) {
  const members = Array.isArray(result.members) ? result.members : [];
  const server = result.community?.discordServer ? ` « ${esc(result.community.discordServer)} »` : '';
  // The solo races permissions only matter with the solo races module, the fiches combo one with its module.
  const shown = settings.permissions.filter(permission => ((settings.modules.soloRaces && settings.modules.eventTdzAvailable) || !permission.startsWith('solo_'))
    && (permission !== 'combos' || settings.modules.combos));
  const legend = `<details class="role-legend-wrap"><summary>Que permet chaque autorisation ?</summary><dl class="role-legend">${shown.map(permission => `<div><dt>${esc(PERMISSION_LABELS[permission])}</dt><dd>${esc(PERMISSION_HELP[permission])}</dd></div>`).join('')}</dl></details>`;
  const row = item => `<tr data-role="${esc(item.id)}" data-kept="${esc(JSON.stringify(item.permissions.filter(permission => !shown.includes(permission))))}">
    <th scope="row"><strong>${esc(item.name)}</strong>${item.administrator ? '<small>Admin Discord : tout</small>' : ''}<span class="settings-status" aria-live="polite"></span></th>
    ${shown.map(permission => `<td><label class="admin-tick"><input type="checkbox" data-permission="${permission}" aria-label="${esc(item.name)} : ${esc(PERMISSION_LABELS[permission] || permission)}" ${item.permissions.includes(permission) || item.administrator ? 'checked' : ''} ${item.administrator ? 'disabled' : ''}><span aria-hidden="true"></span></label></td>`).join('')}</tr>`;
  const roles = settings.roles.length
    ? `<div class="admin-matrix-wrap"><table class="admin-matrix"><thead><tr><th scope="col">Rôle Discord</th>${shown.map(permission => `<th scope="col" title="${esc(PERMISSION_HELP[permission])}">${esc(PERMISSION_LABELS[permission] || permission)}</th>`).join('')}</tr></thead><tbody>${settings.roles.map(row).join('')}</tbody></table></div>`
    : '<p class="members-help">Les rôles du serveur Discord ne peuvent pas être lus : vérifie que le bot est bien sur le serveur.</p>';
  return `<div class="admin-head admin-head-row"><div><h2>Membres et rôles</h2><p>Les membres venus sur le site, et ce que chaque rôle Discord leur permet.</p></div>
      <div class="admin-seg" role="group" aria-label="Affichage"><button type="button" data-view="members" aria-pressed="true">Membres <span>${members.length}</span></button><button type="button" data-view="roles" aria-pressed="false">Rôles</button></div></div>
    <div data-view-pane="members" class="admin-stack">
      <div class="members-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote ou un rôle…" autocomplete="off"></label><button type="button" class="secondary-button" data-members-refresh data-tip="Relit tout de suite sur Discord les rôles de chaque membre et le nom des rôles. Sinon, c’est fait chaque jour.">Actualiser depuis Discord</button></div>
      <p class="members-help">Les membres du serveur Discord${server} qui se sont connectés au site. Leurs rôles se donnent sur Discord.</p>
      <div class="members-list member-grid">${members.map(member => memberCard(member, (result.permissions || []).filter(permission => permission !== 'combos' || settings.modules.combos))).join('')}</div>
      <p class="members-empty" hidden>Aucun membre ne correspond à cette recherche.</p></div>
    <div data-view-pane="roles" class="admin-stack" hidden>
      <p class="members-help">Coche « Accès Endurance Manager » sur les rôles qui peuvent entrer (sur « @everyone », tout le serveur entre), puis ce que chacun peut faire. Le propriétaire du serveur et les admins Discord ont tout. Chaque case s’enregistre aussitôt.</p>
      ${roles}${legend}</div>`;
}

// « Modules »: one tile each, its settings below it once opened.
// « Discord »: the setting asked question by question (server/discord-layout.mjs): each answer shows the questions it
// needs; on a phone, one question per screen, the server's sketch last.
const DISCORD_MODES = {
  events:['Un fil par course', 'Chaque course a son fil dans # endurances-de-la-semaine, les vocaux de ses équipages juste en dessous.'],
  general:['Récap de la semaine + pit talk', 'Un fil par course dans # endurances-de-la-semaine, les vocaux d’équipage dans « Pit talk ».']};
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
      <details><summary>Tester une annonce dans Discord</summary><p>Envoie une démonstration SAFE’S RACE avec des données d’exemple, sans mention ni inscription.</p><label>Nom ou identifiant du salon texte <input name="announcementTestChannel" placeholder="discussion"></label><button type="button" class="secondary-button" data-discord-announcement-test>Envoyer l’aperçu</button></details>
      <div data-recap-preview class="recap-live-preview"></div>
    </div>
    <div class="discord-steps"><button type="button" class="secondary-button" data-discord-step="-1">Retour</button><span data-discord-count></span><button type="button" class="primary-button" data-discord-step="1">Suivant</button></div>
  </form>`;
}
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
  for (const name of ['under','events','pitAt','announce','stream']) if (field(name)) answers[name] = field(name).value.trim();
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
  const inside = (item, value) => `<option value="in:${esc(item.id)}" ${`in:${item.id}` === value ? 'selected' : ''}># ${esc(item.name)}${item.insideReady === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
  const option = (item, value, inside = false, rights = true) => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${item.type === 0 ? `${inside && item.parentId ? '   ' : ''}# ` : '📁 '}${esc(item.name)}${item.type === 4 && item.private ? ' · privée' : ''}${rights && item.ready === false ? ' · le bot n’a pas ses droits' : ''}</option>`;
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
      `<input type="url" name="stream" inputmode="url" maxlength="300" placeholder="https://twitch.tv/…" value="${esc(answers.stream || '')}">`) : '')]);
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
// Why the crews' channels cannot be turned on yet (the bot's state on the server, checked by the site).
const BOT_PROBLEMS = {
  channel:'Un administrateur Discord doit autoriser le bot dans le salon ou sa catégorie. Les autres accès restent privés.',
  rights:'Avant d’activer : touche « Donner les droits au bot », valide sur Discord, puis « C’est fait ».',
  absent:'Le bot n’est pas sur ton serveur : touche « Donner les droits au bot » pour l’ajouter avec ses droits, puis « C’est fait ».',
  config:'Le bot du site n’est pas configuré : préviens le gérant de la plateforme.',
  discord:'Discord ne répond pas pour l’instant : réessaie avec « C’est fait » dans un moment.'};
function modulesMarkup(settings, setup) {
  const crews = settings.crews || {}, states = moduleStates(settings, setup);
  const toggle = (key, label, locked = false) => `<label class="admin-switch"><input type="checkbox" role="switch" data-module="${key}" aria-label="${label}" ${states[key] ? 'checked' : ''} ${locked ? 'disabled' : ''}><i aria-hidden="true"></i></label>`;
  const crewRights = crews.botReady === true ? (crews.lastError ? `<p class="setup-note setup-error">⚠️ ${esc(crews.lastError)}</p>` : '<p class="members-help">Le bot a les droits pour créer les salons.</p>')
    : `<p class="members-help">${crews.botProblem === 'channel' ? `Dans « ${esc(crews.botChannelName || 'le salon')} », un administrateur Discord doit autoriser Endurance Manager : ${esc((crews.botMissing || []).join(', '))}. Les autres accès restent privés.` : crews.botProblem === 'rights' && crews.botMissing?.length ? `Droits manquants pour le bot : ${esc(crews.botMissing.join(', '))}.` : BOT_PROBLEMS[crews.botProblem] || BOT_PROBLEMS.rights}</p>
      <div class="setup-actions">${crews.botInviteUrl && crews.botProblem !== 'channel' ? `<a class="primary-button" href="${esc(crews.botInviteUrl)}" target="_blank" rel="noopener">Donner les droits au bot</a>` : ''}<button type="button" class="secondary-button" data-modules-refresh="discord">C’est fait</button></div>`;
  const voices = settings.modules.crewChannels === true, crewWarn = voices && (crews.botReady !== true || crews.lastError);
  const tiles = [
    {key:'discord', name:'Discord', text:'Le bot affiche tes courses et crée les vocaux des équipages sur ton serveur.',
      state:setup.botRecap?.lastError ? ['warn','Publication en erreur'] : crewWarn ? ['warn', crews.botProblem === 'channel' ? 'Accès au salon à corriger' : crews.botReady !== true ? 'Le bot n’a pas les droits' : 'Vocaux en échec']
        : states.discord ? ['ok', setup.botRecap.mode === 'events' ? 'Actif · une catégorie par course' : 'Actif · récap de la semaine'] : ['off', 'Éteint'],
      control:'', settings:`${crewWarn ? crewRights : ''}${discordForm(setup, settings)}`},
    {key:'categoryEntry', name:'Inscription par catégorie', text:'Sur une course à plusieurs départs, le pilote choisit ses catégories et ses départs possibles. Seuls les TM forment les équipages.',
      state:states.categoryEntry ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('categoryEntry', 'Inscription par catégorie'), settings:''},
    {key:'iracingImport', name:'Endurances iRacing officielles', text:settings.modules.eventTdzAvailable?'Les séries en équipe et les événements spéciaux importés automatiquement.':'Les séries en équipe et les événements spéciaux importés automatiquement. Avec EVENT SOLO activé, les endurances solo apparaissent aussi dans son calendrier.',
      state:states.iracingImport ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('iracingImport', 'Endurances iRacing officielles'), settings:''},
    ...(!settings.modules.eventTdzAvailable ? [] : [{key:'soloRaces', name:'EVENT TDZ', text:'Un calendrier d’événements toutes simus&nbsp;: places limitées, liste d’attente, accès OPEN ou SAFE.',
      state:states.soloRaces ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('soloRaces', 'EVENT TDZ'),
      settings:`<form class="settings-safe-guide" data-safe-guide><label>Salon Discord « Comment devenir SAFE »<input name="url" type="url" maxlength="200" placeholder="https://discord.com/channels/…" value="${esc(settings.modules.safeGuideUrl || '')}"></label>
        <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form>`}]),
    ...(settings.modules.eventTdzAvailable ? [] : [{key:'soloRaces', name:'EVENT SOLO', text:'Un calendrier d’événements toutes simus&nbsp;: inscription en un clic, places limitées si besoin et liste d’attente.',
      state:states.soloRaces ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('soloRaces', 'EVENT SOLO'), settings:''}]),
    // Private module: opened for a team by the platform managers, shown to the community's admins once open.
    ...(settings.modules.combosManager || states.combos ? [{key:'combos', name:'Fiches combo', text:'Module privé de l’équipe&nbsp;: les données de practice par voiture et circuit (énergie, pneus, rythme, arrêts), envoyées par le plugin SimHub de chaque pilote. Visible des rôles qui ont l’autorisation « Fiches combo ».',
      state:states.combos ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('combos', 'Fiches combo', !settings.modules.combosManager), settings:''}] : []),
    ...(settings.modules.grindfestAvailable ? [{key:'grindfest', name:'Gridfest', text:'Inscription par streamer, nom en jeu et mot de passe par MP Discord.', state:states.grindfest ? ['ok','Actif'] : ['off','Éteint'], control:toggle('grindfest','Gridfest'), settings:''}] : []),
  ];
  const tile = item => `<article class="admin-module ${states[item.key] ? 'is-on' : ''}" data-module-tile="${item.key}">
    <div class="admin-module-top"><span class="admin-module-icon">${icon(item.key)}</span><strong>${item.name}</strong>${item.control}</div>
    <p>${item.text}</p>
    <div class="admin-module-foot"><span class="admin-state is-${item.state[0]}">${item.state[1]}</span>${item.settings ? `<button type="button" class="link-button" data-module-open="${item.key}" aria-expanded="false">Régler</button>` : ''}</div>
    ${item.settings ? `<div class="admin-module-settings" hidden>${item.settings}</div>` : ''}</article>`;
  return `<div class="admin-head"><h2>Modules</h2><p>Tout ce qui s’allume ou s’éteint. Les interrupteurs s’enregistrent tout de suite.</p></div><div class="admin-modules">${tiles.map(tile).join('')}</div>`;
}

// « Apparence »: the form on the left, the preview of the site on the right.
function lookMarkup(settings) {
  const look = settings.community;
  const accent = look.accent || '#52d3d8';
  return `<div class="admin-head"><h2>Apparence</h2><p>L’aperçu montre tout de suite ce que verront tes membres.</p></div>
    <div class="admin-look">
      <div class="admin-stack">
        <section class="admin-card"><form class="settings-appearance" data-appearance>
          <label>Nom de la communauté<input name="name" maxlength="80" required value="${esc(look.name)}"></label>
          <label><span>Nom court <small>(onglet du navigateur)</small></span><input name="shortName" maxlength="12" required value="${esc(look.shortName)}"></label>
          <div class="settings-accent"><label><span>Couleur d’accent <span class="tip-info" data-tip="Couleur des boutons, des traits et des repères sur le site de ta communauté.">ⓘ</span></span><input name="accent" type="color" value="${esc(accent)}"></label>
            <label class="role-pill"><input type="checkbox" name="defaultAccent" ${look.accent ? '' : 'checked'}><span>Couleur du site</span></label></div>
          <p class="members-help">Le logo est l’icône du serveur Discord${look.discordServer ? ` « ${esc(look.discordServer)} »` : ''} : change-la sur Discord.${look.logoUrl ? '' : ' Le serveur n’a pas d’icône : le logo du site est utilisé.'}</p>
          <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form></section>
        <section class="admin-card settings-banner-card"><h3>Bannière</h3><div class="settings-banner">
          <img class="settings-banner-preview" src="${esc(look.bannerUrl || '/images/endurance-manager-banner.webp')}" alt="Bannière actuelle">
          <div class="settings-actions"><label class="secondary-button settings-banner-pick">Choisir une image<input type="file" accept="image/png,image/jpeg,image/webp" data-banner-file hidden></label>
            ${look.bannerUrl ? '<button type="button" class="secondary-button" data-banner-remove>Remettre la bannière du site</button>' : ''}<span class="settings-status" aria-live="polite"></span></div>
          <p class="members-help">Format conseillé : 2048 × 512 (4 fois plus large que haute). Tu la cadres et la zoomes avant de l’enregistrer ; elle est allégée automatiquement.</p></div></section>
      </div>
      <div class="admin-preview-wrap"><p class="admin-preview-label">Aperçu : ce que verront tes membres</p>
        <div class="admin-preview" data-look-preview style="--preview-accent:${esc(accent)}">
          <div class="admin-preview-banner"><img src="${esc(look.bannerUrl || '/images/endurance-manager-banner.webp')}" alt=""></div>
          <div class="admin-preview-nav">${look.logoUrl ? `<img class="admin-preview-badge" src="${esc(look.logoUrl)}" alt="">` : `<b class="admin-preview-badge" data-preview-short>${esc(String(look.shortName || look.name).slice(0, 4))}</b>`}<span>EVENT SOLO</span><span class="is-active">ENDURANCE</span><span>Mes inscriptions</span></div>
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
const SECTIONS = [['overview', 'Vue d’ensemble'], ['people', 'Membres et rôles'], ['modules', 'Modules'], ['look', 'Apparence']];
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
    // The showcase (main address) has no Discord server and nobody real: no overview nor members there.
    const sections = SECTIONS.filter(([key]) => !session.openSite || !['overview', 'people'].includes(key));
    if (platform) sections.push(['platform', 'Plateforme']);
    const panels = {overview:overview.html, people:peopleMarkup(result, settings), modules:modulesMarkup(settings, setup), look:lookMarkup(settings), platform};
    const current = sections.some(([key]) => key === openTab) ? openTab : sections[0][0];
    const brand = settings.community?.logoUrl ? `<img src="${esc(settings.community.logoUrl)}" alt="">` : `<span>${initials(settings.community?.shortName || settings.community?.name)}</span>`;
    app.innerHTML = `<h1 class="sr-only">Administration</h1><div class="admin-shell">
      <nav class="admin-rail" role="tablist" aria-label="Administration">
        <div class="admin-brand">${brand}<div><strong>${esc(settings.community?.name || '')}</strong><small>Administration</small></div></div>
        ${sections.map(([key, label]) => `<button type="button" role="tab" class="admin-nav${key === 'platform' ? ' is-platform' : ''}" data-tab="${key}" aria-selected="${key === current}">${icon(key)}<span>${label}</span>${key === 'overview' && overview.todo ? `<b class="admin-count">${overview.todo}</b>` : ''}</button>`).join('')}
      </nav>
      <div class="admin-main">${sections.map(([key]) => `<section class="admin-panel${key === 'platform' ? ' community-settings' : ''}" data-panel="${key}" role="tabpanel" ${key === current ? '' : 'hidden'}>${helpContext('admin-'+key)}${panels[key]}</section>`).join('')}</div></div>`;
    for (const form of app.querySelectorAll('[data-discord-form]')) discordRefresh(form);
    if (openView) showView(openView);
    if (openModule) openModuleSettings(openModule);
    openView = ''; openModule = '';
  } catch (error) {
    renderError(error.message || String(error));
  }
}
function showView(view) {
  for (const button of app.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  for (const pane of app.querySelectorAll('[data-view-pane]')) pane.hidden = pane.dataset.viewPane !== view;
}
function openModuleSettings(key, open = true) {
  const tile = app.querySelector(`[data-module-tile="${key}"]`), settings = tile?.querySelector('.admin-module-settings');
  if (!settings) return;
  settings.hidden = !open; tile.classList.toggle('is-open', open);
  tile.querySelector('[data-module-open]')?.setAttribute('aria-expanded', String(open));
  const button = tile.querySelector('[data-module-open]');
  if (button) button.textContent = open ? 'Fermer' : 'Régler';
  if (open) tile.scrollIntoView({behavior:'smooth', block:'nearest'});
  // The server's channels are read once the setting is opened.
  const form = settings.querySelector('[data-discord-form]');
  if (open && form && !form._destinations) loadDiscordDestinations(form).catch(error => { form.querySelector('.setup-actions .settings-status').textContent = error.message; });
}
function selectTab(key) {
  for (const button of app.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === key));
  for (const panel of app.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== key;
  openTab = key;
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
  container.querySelector('.banner-cropper')?.remove();
  const box = document.createElement('div');
  box.className = 'banner-cropper';
  box.innerHTML = `<div class="banner-crop-frame"><canvas width="2048" height="512" aria-label="Cadrage de la bannière"></canvas></div>
    <label class="banner-crop-zoom">Zoom<input type="range" min="1" max="4" step="0.01" value="1" data-banner-zoom></label>
    <p class="members-help">Fais glisser l’image pour choisir la partie visible, et zoome si besoin.</p>
    <div class="settings-actions"><button type="button" class="primary-button" data-banner-save>Enregistrer la bannière</button><button type="button" class="secondary-button" data-banner-cancel>Annuler</button></div>`;
  container.querySelector('.settings-banner-preview').after(box);
  container.querySelector('.settings-banner-preview').hidden = true;
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
  const preview = container.querySelector('.settings-banner-preview');
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
// Reloads the page content and comes back to the same tab.
async function reload(tab, {view = '', module = ''} = {}) { openTab = tab; openView = view; openModule = module; await load(); }

app.addEventListener('click', async event => {
  const go = event.target.closest('[data-go-tab]');
  if (go) {
    selectTab(go.dataset.goTab);
    if (go.dataset.goView) showView(go.dataset.goView);
    if (go.dataset.goModule) openModuleSettings(go.dataset.goModule);
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
  if (modulesRefresh) { await reload('modules', {module:modulesRefresh.dataset.modulesRefresh}); return; }
  const view = event.target.closest('[data-view]');
  if (view) { showView(view.dataset.view); return; }
  const moduleOpen = event.target.closest('[data-module-open]');
  if (moduleOpen) { openModuleSettings(moduleOpen.dataset.moduleOpen, moduleOpen.getAttribute('aria-expanded') !== 'true'); return; }
  const refresh = event.target.closest('[data-members-refresh]');
  if (refresh) {
    refresh.disabled = true; refresh.textContent = 'Actualisation…';
    try { await api('/api/members/refresh', 'POST', {}); await reload('people'); }
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
        await api('/api/community/discord/announcement-test','POST',{channel});
        status.textContent='✓ Aperçu envoyé dans le salon choisi, sans mention.';
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
        await reload('modules',{module:'discord'});
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
        await reload('modules',{module:'discord'});
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
  if (event.target.name !== 'memberSearch') return;
  const query = event.target.value.trim().toLocaleLowerCase('fr-FR');
  let visible = 0;
  for (const row of app.querySelectorAll('.members-row')) {
    const match = !query || row.dataset.search.includes(query);
    row.hidden = !match;
    if (match) visible += 1;
  }
  const empty = app.querySelector('.members-empty');
  if (empty) empty.hidden = visible > 0;
});

app.addEventListener('submit', async event => {
  const discord = event.target.closest('form[data-discord-form]');
  if (discord) {
    event.preventDefault();
    const status = discord.querySelector('.setup-actions .settings-status'), button = discord.querySelector('[type="submit"]');
    button.disabled = true; status.textContent = 'Enregistrement…';
    try {
      const result = await api('/api/community/discord','PUT',discordInput(discord));
      await reload('modules',{module:'discord'});
      app.querySelector('[data-discord-form] .setup-actions .settings-status').textContent = result.published ? '✓ Enregistré.' : result.error || 'Enregistré ; la publication sera réessayée.';
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

void load();


