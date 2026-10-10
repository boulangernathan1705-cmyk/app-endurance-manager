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
const PERMISSION_LABELS = {access:'Accès Endurance Manager', endurance:'Endurances', solo_open:'Événements OPEN', solo_safe:'Événements SAFE', crews:'Équipages', admin:'Administrer'};
const PERMISSION_HELP = {access:'Accéder au site de la communauté. Sans cette autorisation sur au moins un rôle, le membre ne peut pas consulter les courses ni utiliser le site.', endurance:'S’inscrire aux endurances (et rejoindre un équipage existant).',
  solo_open:'S’inscrire aux événements OPEN.', solo_safe:'S’inscrire aux événements SAFE (et OPEN).',
  crews:'Créer et gérer les équipages.',
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
  recap:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  crewChannels:'<path d="M4 5h16v10H9l-5 4V5Z"/><path d="M14 19h1l4 3v-3"/>',
  raceReminders:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
  iracingImport:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  training:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  grindfest:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  soloRaces:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
const RECAP_LABELS = {all:'LMU et iRacing', lmu:'LMU', iracing:'iRacing'};
const copyButton = target => `<button type="button" class="secondary-button setup-copy" data-copy="${target}">Copier</button>`;

// What is on, for the overview and the modules.
function moduleStates(settings, setup) {
  const recaps = setup.recaps || [];
  return {recap:recaps.length > 0 || Boolean(setup.legacyRecap), crewChannels:settings.modules.crewChannels === true, raceReminders:settings.modules.raceReminders === true,
    iracingImport:settings.modules.iracingImport === true, soloRaces:settings.modules.soloRaces === true, training:settings.modules.training === true, grindfest:settings.modules.grindfest === true};
}

// « Vue d'ensemble ».
function overviewMarkup(setup, settings, members) {
  const guild = setup.guild || {}, crews = settings.crews || {};
  const server = guild.name ? `« ${esc(guild.name)} »` : 'de la communauté';
  const states = moduleStates(settings, setup), active = Object.values(states).filter(Boolean).length;
  const recapDone = states.recap;
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
    {done:recapDone, title:'Publier le récap de la semaine sur Discord', action:'<button type="button" class="secondary-button" data-go-tab="modules" data-go-module="recap">Régler le récap</button>'},
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
  if (states.crewChannels && crews.botReady !== true) alerts.push(['warn', 'Salons d’équipage : le bot n’a pas les droits pour créer les salons.', '<button type="button" class="link-button" data-go-tab="modules" data-go-module="crewChannels">Régler</button>']);
  else if (states.crewChannels && crews.lastError) alerts.push(['warn', `Salons d’équipage : ${esc(crews.lastError)}`, '<button type="button" class="link-button" data-go-tab="modules" data-go-module="crewChannels">Voir</button>']);
  if (setup.legacyRecap) alerts.push(['warn', 'Le récap de la semaine passe encore par le salon réglé à la création du site : règle ton propre salon.', '<button type="button" class="link-button" data-go-tab="modules" data-go-module="recap">Régler</button>']);
  if ((setup.recaps || []).length) alerts.push(['ok', `Récap de la semaine publié sur Discord (${(setup.recaps || []).map(item => RECAP_LABELS[item.scope]).join(', ')}).`, '']);
  if (states.iracingImport) alerts.push(['ok', 'Endurances iRacing officielles importées automatiquement.', '']);
  if (!alerts.some(([tone]) => tone !== 'ok')) alerts.unshift(['ok', 'Rien à signaler : tout fonctionne.', '']);
  const watch = `<section class="admin-card"><div class="admin-card-head"><h2>À surveiller</h2></div><ul class="admin-alerts">${alerts.map(([tone, text, action]) => `<li class="is-${tone}"><span>${text}</span>${action}</li>`).join('')}</ul></section>`;
  return {todo:left, html:`<div class="admin-head"><h2>Vue d’ensemble</h2><p>Ce qui marche, ce qui reste à faire et ce qui demande ton attention.</p></div>${tiles}<div class="admin-columns">${start}${watch}</div>`};
}

// « Membres et rôles »: the members, or the table of the roles.
function peopleMarkup(result, settings) {
  const members = Array.isArray(result.members) ? result.members : [];
  const server = result.community?.discordServer ? ` « ${esc(result.community.discordServer)} »` : '';
  // The solo races permissions only matter with the solo races module.
  const shown = settings.permissions.filter(permission => settings.modules.soloRaces || !permission.startsWith('solo_'));
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
      <div class="members-list member-grid">${members.map(member => memberCard(member, result.permissions || [])).join('')}</div>
      <p class="members-empty" hidden>Aucun membre ne correspond à cette recherche.</p></div>
    <div data-view-pane="roles" class="admin-stack" hidden>
      <p class="members-help">Coche « Accès Endurance Manager » sur les rôles autorisés à entrer. Un membre doit avoir au moins un de ces rôles ; les autres autorisations définissent ensuite ce qu’il peut faire. « @everyone » s’applique à tout le serveur : laisse son accès décoché pour réserver le site à certains rôles. Les administrateurs du site, le propriétaire du serveur et les rôles « Administrateur » de Discord conservent toutes les autorisations. Chaque case s’enregistre dès qu’on la coche.</p>
      ${roles}${legend}</div>`;
}

// « Modules »: one tile each, its settings below it once opened.
function webhookField(key, label, saved) {
  return `<div class="setup-hook"><label>Adresse du webhook ${label ? `du salon ${label}` : 'du salon'} <span class="tip-info" data-tip="Un webhook laisse le site publier dans ce salon, et seulement là : il ne donne aucun autre accès à ton serveur.">ⓘ</span><input name="hook-${key}" type="url" inputmode="url" autocomplete="off" spellcheck="false"
    placeholder="${saved ? `Déjà relié (${esc(saved)}) : laisse vide pour le garder` : 'https://discord.com/api/webhooks/…'}"></label>
    <button type="button" class="secondary-button" data-recap-test="${key}">Tester</button><span class="settings-status" aria-live="polite"></span></div>`;
}
function recapForm(setup) {
  const byScope = Object.fromEntries((setup.recaps || []).map(recap => [recap.scope, recap.webhook]));
  const count = (setup.recaps || []).length, layout = count === 2 ? 'two' : 'one';
  const oneScope = count === 1 ? setup.recaps[0].scope : 'all';
  const guide = `<details class="setup-guide"><summary>Comment obtenir cette adresse ?</summary><ol class="setup-howto">
      <li>Sur Discord, survole le salon choisi et clique sur la roue dentée <strong>⚙ Modifier le salon</strong>.</li>
      <li>Ouvre <strong>Intégrations</strong> → <strong>Webhooks</strong> → <strong>Nouveau webhook</strong>.</li>
      <li>Clique sur le webhook créé, puis sur <strong>Copier l’URL du webhook</strong>, et colle-la ici.</li></ol>
      <p class="setup-note">Garde cette adresse pour toi : elle permet d’écrire dans le salon. Une fois enregistrée, le site ne la réaffiche plus.</p></details>`;
  const preview = `<figure class="recap-preview" aria-label="Exemple de récap sur Discord"><figcaption>Exemple de message sur Discord</figcaption>
      <div class="recap-preview-bot"><span class="recap-preview-avatar">EM</span><strong>Endurance Manager</strong><span class="recap-preview-tag">APP</span></div>
      <div class="recap-preview-embed"><strong>📝 Semaine du 6 au 12 octobre</strong><b>🏁 6h de Fuji</b><span>🕐 samedi 11 octobre — 21:00</span>
      <span>🟦 Équipe Alpha · Hypercar · 🔓 Ouvert</span><span>👤 Pilote 1 &nbsp; 👤 Pilote 2</span><em>mise à jour à 18:42</em></div></figure>`;
  const card = (value, title, help) => `<label class="recap-card"><input type="radio" name="layout" value="${value}" ${layout === value ? 'checked' : ''}><span><strong>${title}</strong><small>${help}</small></span></label>`;
  const sim = (key, label, checked) => `<label class="role-pill"><input type="checkbox" name="${key}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
  return `<div class="recap-intro"><p>Un message avec <strong>les courses de la semaine</strong>, les équipages et les pilotes inscrits. Il se met à jour tout seul à chaque inscription.</p>${preview}</div>
    ${setup.legacyRecap ? '<p class="setup-note">Le récap actuel (courses LMU) passe par le salon réglé à la création du site. Règle ton salon ci-dessous pour le reprendre en main.</p>' : ''}
    <form class="setup-form" data-recaps data-mode="${count ? layout : 'none'}">
      <label class="settings-switch recap-switch"><span><strong>Publier le récap sur Discord</strong><small>Si c’est désactivé, aucun message n’est publié.</small></span><input type="checkbox" role="switch" name="enabled" ${count ? 'checked' : ''}><i aria-hidden="true"></i></label>
      <div class="recap-options">
        <p class="recap-question">Où le publier ?</p>
        <div class="recap-cards">${card('one', 'Dans un seul salon', 'Un message avec toutes les courses.')}${card('two', 'Un salon par simu', 'Un message LMU et un message iRacing, chacun dans son salon.')}</div>
        <div class="setup-mode-block" data-mode-block="one">
          <div class="recap-sims"><span>Courses à inclure</span>${sim('simLmu', 'LMU', oneScope !== 'iracing')}${sim('simIracing', 'iRacing', oneScope !== 'lmu')}</div>
          ${webhookField('one', '', count === 1 ? setup.recaps[0].webhook : '')}</div>
        <div class="setup-mode-block" data-mode-block="two">${webhookField('lmu', 'LMU', count === 2 ? byScope.lmu : '')}${webhookField('iracing', 'iRacing', count === 2 ? byScope.iracing : '')}</div>
        ${guide}
      </div>
      <div class="setup-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form>`;
}
// Where the crews' voice channels are made, asked as soon as the module is turned on.
function crewCategory(crews) {
  const list = crews.categories || [], current = crews.voiceCategoryId || '';
  const options = [{id:'', name:'En haut du serveur'}, ...list, ...(current && !list.some(item => item.id === current) ? [{id:current, name:'Catégorie actuelle'}] : [])];
  return `<label class="crew-category">Où créer les vocaux ?<select data-crew-category>${options.map(item => `<option value="${esc(item.id)}" ${item.id === current ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><span class="settings-status" aria-live="polite"></span>`;
}
// Why the crews' channels cannot be turned on yet (the bot's state on the server, checked by the site).
const BOT_PROBLEMS = {
  rights:'Avant d’activer : touche « Donner les droits au bot », valide sur Discord, puis « C’est fait ».',
  absent:'Le bot n’est pas sur ton serveur : touche « Donner les droits au bot » pour l’ajouter avec ses droits, puis « C’est fait ».',
  config:'Le bot du site n’est pas configuré : préviens le gérant de la plateforme.',
  discord:'Discord ne répond pas pour l’instant : réessaie avec « C’est fait » dans un moment.'};
function modulesMarkup(settings, setup) {
  const crews = settings.crews || {}, states = moduleStates(settings, setup);
  const toggle = (key, label, locked = false) => `<label class="admin-switch"><input type="checkbox" role="switch" data-module="${key}" aria-label="${label}" ${states[key] ? 'checked' : ''} ${locked ? 'disabled' : ''}><i aria-hidden="true"></i></label>`;
  const crewRights = crews.botReady === true ? (crews.lastError ? `<p class="setup-note setup-error">⚠️ ${esc(crews.lastError)}</p>` : '<p class="members-help">Le bot a les droits pour créer les salons.</p>')
    : `<p class="members-help">${BOT_PROBLEMS[crews.botProblem] || BOT_PROBLEMS.rights}</p>
      <div class="setup-actions">${crews.botInviteUrl ? `<a class="primary-button" href="${esc(crews.botInviteUrl)}" target="_blank" rel="noopener">Donner les droits au bot</a>` : ''}<button type="button" class="secondary-button" data-modules-refresh="crewChannels">C’est fait</button></div>`;
  const crewWarn = states.crewChannels && (crews.botReady !== true || crews.lastError);
  const tiles = [
    {key:'recap', name:'Récap de la semaine sur Discord', text:'Les courses de la semaine dans un salon de ton serveur, mis à jour tout seul.',
      state:states.recap ? ['ok', (setup.recaps || []).length ? `Actif · ${(setup.recaps || []).map(item => RECAP_LABELS[item.scope]).join(', ')}` : 'Actif · salon d’origine'] : ['off', 'Éteint'],
      control:'', settings:recapForm(setup)},
    {key:'crewChannels', name:'Salons d’équipage sur Discord', text:'Un salon vocal par équipage, nommé simu + nom de l’équipage, ouvert quelques jours avant la course.',
      state:crewWarn ? ['warn', crews.botReady !== true ? 'Le bot n’a pas les droits' : 'Le bot est bloqué'] : states.crewChannels ? ['ok', 'Actif'] : ['off', crews.botReady === true ? 'Éteint' : crews.botProblem === 'rights' ? 'Éteint · droits du bot à donner' : 'Éteint · bot à vérifier'],
      control:toggle('crewChannels', 'Salons d’équipage sur Discord', crews.botReady !== true && !states.crewChannels),
      settings:`${crewRights}${states.crewChannels ? crewCategory(crews) : ''}<p class="members-help">Il est supprimé 2 h après la course.</p>`},
    {key:'raceReminders', name:'Rappels de course', text:'24&nbsp;h avant le départ dans la cloche du site, 24&nbsp;h et 1&nbsp;h avant dans le salon de l’équipage.',
      state:states.raceReminders ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('raceReminders', 'Rappels de course'), settings:''},
    {key:'iracingImport', name:'Endurances iRacing officielles', text:'Les séries en équipe et les événements spéciaux importés automatiquement.',
      state:states.iracingImport ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('iracingImport', 'Endurances iRacing officielles'), settings:''},
    {key:'soloRaces', name:'EVENT TDZ', text:'Le calendrier des Tondeuz, toutes simus&nbsp;: places limitées, liste d’attente, types OPEN, SAFE, Bouboule…',
      state:states.soloRaces ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('soloRaces', 'EVENT TDZ'),
      settings:`<form class="settings-safe-guide" data-safe-guide><label>Salon Discord « Comment devenir SAFE »<input name="url" type="url" maxlength="200" placeholder="https://discord.com/channels/…" value="${esc(settings.modules.safeGuideUrl || '')}"></label>
        <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form>`},
    ...(settings.modules.grindfestAvailable ? [{key:'grindfest', name:'Grindfest', text:'Événement solo : chaque pilote représente un streamer, avec ses places et sa liste d’attente.', state:states.grindfest ? ['ok','Actif'] : ['off','Éteint'], control:toggle('grindfest','Grindfest'), settings:''}] : []),
    {key:'training', name:'Entraînement', text:'Page « Mon entraînement » : programme guidé, séance du jour et conseils tirés des séances LMU de chaque pilote.',
      state:states.training ? ['ok', 'Actif'] : ['off', 'Éteint'], control:toggle('training', 'Entraînement'), settings:''}];
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
          <div class="admin-preview-banner"><img src="${esc(look.bannerUrl || '/images/endurance-manager-banner.webp')}" alt=""><b data-preview-name>${esc(look.name)}</b></div>
          <div class="admin-preview-nav"><span>Endurance</span><span>Mes inscriptions</span></div>
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
  const [{communities, baseDomain, showcase, testSite}, {requests}] = await Promise.all([api('/api/platform/communities'), api('/api/platform/community-requests')]);
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
      <div class="admin-main">${sections.map(([key]) => `<section class="admin-panel${key === 'platform' ? ' community-settings' : ''}" data-panel="${key}" role="tabpanel" ${key === current ? '' : 'hidden'}>${panels[key]}</section>`).join('')}</div></div>`;
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
// Simulators of a single recap message: both (all), LMU or iRacing ('' when none is ticked).
const oneScopeOf = form => form.elements.simLmu.checked && form.elements.simIracing.checked ? 'all' : form.elements.simLmu.checked ? 'lmu' : form.elements.simIracing.checked ? 'iracing' : '';
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
  const testButton = event.target.closest('[data-recap-test]');
  if (testButton) {
    const form = testButton.closest('form'), key = testButton.dataset.recapTest, status = testButton.parentElement.querySelector('.settings-status');
    const scope = key === 'one' ? oneScopeOf(form) : key;
    status.textContent = 'Envoi…';
    try { await api('/api/community/recaps/test', 'POST', {webhookUrl:form.elements[`hook-${key}`].value.trim(), scope}); status.textContent = '✓ Message de test envoyé : regarde ton salon Discord.'; }
    catch (error) { status.textContent = error.message; }
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
  const safeGuide = event.target.closest('form[data-safe-guide]');
  if (safeGuide) {
    event.preventDefault();
    const status = safeGuide.querySelector('.settings-status');
    status.textContent = 'Enregistrement…';
    try { await api('/api/community/modules', 'PATCH', {safeGuideUrl:safeGuide.elements.url.value}); await reload('modules', {module:'soloRaces'}); }
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
  const recaps = event.target.closest('form[data-recaps]'), invite = event.target.closest('form[data-invite]'), created = event.target.closest('form[data-new-community]');
  if (recaps || invite || created) {
    event.preventDefault();
    const form = recaps || invite || created, status = form.querySelector('.settings-actions .settings-status, .setup-actions .settings-status, :scope > .settings-status');
    if (status) status.textContent = 'Enregistrement…';
    try {
      if (recaps) {
        const mode = form.dataset.mode, hook = key => form.elements[`hook-${key}`].value.trim();
        if (mode === 'one' && !oneScopeOf(form)) throw new Error('Coche au moins une simu : LMU ou iRacing.');
        const list = mode === 'one' ? [{scope:oneScopeOf(form), webhookUrl:hook('one')}] : mode === 'two' ? [{scope:'lmu', webhookUrl:hook('lmu')}, {scope:'iracing', webhookUrl:hook('iracing')}] : [];
        const result = await api('/api/community/recaps', 'PUT', {recaps:list});
        if (list.length && !result.published) throw new Error('Enregistré, mais Discord a refusé le message : clique sur « Tester » pour vérifier chaque webhook.');
        await reload('modules', {module:'recap'});
      } else if (invite) {
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
  preview.querySelector('[data-preview-name]').textContent = form.elements.name.value || 'Ta communauté';
  preview.style.setProperty('--preview-accent', form.elements.defaultAccent.checked ? '#52d3d8' : form.elements.accent.value);
}

app.addEventListener('change', async event => {
  const box = event.target;
  const look = box.closest('form[data-appearance]');
  if (look) { if (box.name === 'accent') look.elements.defaultAccent.checked = false; updatePreview(look); return; }
  // Recap: the fields of the chosen kind of recap.
  if (box.matches('[data-banner-file]') && box.files?.[0]) {
    const container = box.closest('.settings-banner'), status = container.querySelector('.settings-status');
    status.textContent = '';
    try { await openCropper(box.files[0], container); } catch { status.textContent = 'Cette image ne peut pas être lue : essaie un fichier PNG, JPEG ou WebP.'; }
    box.value = '';
    return;
  }
  if (box.matches('[data-banner-zoom]') && cropper) { setZoom(Number(box.value)); return; }
  const recapForm = box.closest('form[data-recaps]');
  if (recapForm) { recapForm.dataset.mode = recapForm.elements.enabled.checked ? recapForm.elements.layout.value : 'none'; return; }
  if (box.matches('[data-crew-category]')) {
    const status = box.closest('.admin-module-settings').querySelector('.crew-category + .settings-status');
    box.disabled = true; status.textContent = 'Enregistrement…';
    try { await api('/api/community/modules', 'PATCH', {crewCategory:box.value}); status.textContent = '✓'; }
    catch (error) { status.textContent = error.message; } finally { box.disabled = false; }
    return;
  }
  if (box.dataset.module) {
    box.disabled = true;
    try {
      await api('/api/community/modules', 'PATCH', {[box.dataset.module]:box.checked});
      // The solo races permissions appear or disappear with the module; the crews' channels ask where to go.
      await reload('modules', {module:box.dataset.module === 'crewChannels' && box.checked ? 'crewChannels' : ''});
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
