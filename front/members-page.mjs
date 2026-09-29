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
const PERMISSION_LABELS = {endurance:'Endurances', solo_open:'Courses solo OPEN', solo_safe:'Courses solo SAFE',
  manage_registrations:'Gérer les inscriptions', create_race:'Créer des courses', manage_races:'Gérer toutes les courses', admin:'Administrer'};
const PERMISSION_HELP = {endurance:'S’inscrire aux endurances, rejoindre, créer et gérer son équipage.',
  solo_open:'S’inscrire aux courses solo OPEN.', solo_safe:'S’inscrire aux courses solo SAFE (et OPEN).',
  manage_registrations:'Inscrire, modifier ou retirer n’importe quel pilote, composer tous les équipages.',
  create_race:'Créer des courses, modifier et supprimer les siennes.', manage_races:'Modifier et supprimer toutes les courses, y compris celles importées d’iRacing.',
  admin:'Page Membres et réglages : apparence, modules, autorisations des rôles.'};

// Members of the community: found on its Discord server by the bot. Roles are managed on Discord; this page
// shows them with what they allow here (the settings of each role are in the « Réglages » tab).
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

// Community settings: appearance, the permissions of each Discord role, and the modules. Roles and modules
// are saved as soon as a box changes.
async function settingsMarkup() {
  const settings = await api('/api/community/settings');
  const module = (key, label, help) => `<label class="settings-switch"><span><strong>${label}</strong><small>${help}</small></span><input type="checkbox" role="switch" data-module="${key}" ${settings.modules[key] ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  // The solo races permissions only matter with the solo races module.
  const shown = settings.permissions.filter(permission => settings.modules.soloRaces || !permission.startsWith('solo_'));
  const legend = `<details class="role-legend-wrap"><summary>Que permet chaque autorisation ?</summary><dl class="role-legend">${shown.map(permission => `<div><dt>${esc(PERMISSION_LABELS[permission])}</dt><dd>${esc(PERMISSION_HELP[permission])}</dd></div>`).join('')}</dl></details>`;
  const role = item => `<article class="role-card" data-role="${esc(item.id)}" data-kept="${esc(JSON.stringify(item.permissions.filter(permission => !shown.includes(permission))))}">
    <div class="role-head"><strong>${esc(item.name)}</strong>${item.administrator ? '<small>Administrateur Discord : toutes les autorisations</small>' : ''}<span class="settings-status" aria-live="polite"></span></div>
    <div class="role-pills">${shown.map(permission => `<label class="role-pill" title="${esc(PERMISSION_HELP[permission])}"><input type="checkbox" data-permission="${permission}" ${item.permissions.includes(permission) || item.administrator ? 'checked' : ''} ${item.administrator ? 'disabled' : ''}><span>${esc(PERMISSION_LABELS[permission] || permission)}</span></label>`).join('')}</div>
  </article>`;
  const roles = settings.roles.length ? `<div class="role-list">${settings.roles.map(role).join('')}</div>`
    : '<p class="members-help">Les rôles du serveur Discord ne peuvent pas être lus : vérifie que le bot est bien sur le serveur.</p>';
  const look = settings.community;
  const appearance = `<section class="settings-card"><h2>Apparence</h2><form class="settings-appearance" data-appearance>
    <label>Nom de la communauté<input name="name" maxlength="80" required value="${esc(look.name)}"></label>
    <label>Nom court <small>(onglet du navigateur)</small><input name="shortName" maxlength="12" required value="${esc(look.shortName)}"></label>
    <div class="settings-accent"><label>Couleur d’accent<input name="accent" type="color" value="${esc(look.accent || '#52d3d8')}"></label>
      <label class="role-pill"><input type="checkbox" name="defaultAccent" ${look.accent ? '' : 'checked'}><span>Couleur du site</span></label></div>
    <p class="members-help">Le logo et la bannière sont ceux du serveur Discord${look.discordServer ? ` « ${esc(look.discordServer)} »` : ''} : change-les sur Discord.${look.logoUrl ? '' : ' Le serveur n’a pas d’icône : le logo du site est utilisé.'}${look.bannerUrl ? '' : ' Sans bannière de serveur, la bannière du site est utilisée.'}</p>
    <div class="settings-actions"><button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></div></form></section>`;
  return `${appearance}
    <section class="settings-card"><h2>Modules</h2>${module('iracingImport','Endurances iRacing officielles','Import automatique des séries en équipe et des événements spéciaux.')}${module('soloRaces','Courses solo','Onglet « Courses solo », places limitées, liste d’attente, courses OPEN / SAFE.')}</section>
    <section class="settings-card settings-roles-card"><h2>Autorisations des rôles Discord</h2><p class="members-help">Un membre cumule les autorisations de tous ses rôles. « @everyone » s’applique à tous les membres du serveur. Le propriétaire du serveur et les rôles « Administrateur » de Discord ont tout.</p>${legend}${roles}</section>`;
}


// « Mise en place » (admins): the steps to set the community up, each one explained and checked by itself.
const RECAP_LABELS = {all:'LMU et iRacing', lmu:'LMU', iracing:'iRacing'};
const copyButton = target => `<button type="button" class="secondary-button setup-copy" data-copy="${target}">Copier</button>`;
function step(done, number, title, status, body, open = !done) {
  return `<li class="setup-step ${done === null ? 'is-info' : done ? 'is-done' : 'is-todo'}"><details ${open ? 'open' : ''}>
    <summary><span class="setup-check" aria-hidden="true">${done ? '✓' : number}</span><span class="setup-title"><strong>${title}</strong><small>${status}</small></span></summary>
    <div class="setup-body">${body}</div></details></li>`;
}
function webhookField(key, label, saved) {
  return `<div class="setup-hook"><label>Webhook du salon ${label}<input name="hook-${key}" type="url" inputmode="url" autocomplete="off" spellcheck="false"
    placeholder="${saved ? `Déjà relié (${esc(saved)}) : laisse vide pour le garder` : 'https://discord.com/api/webhooks/…'}"></label>
    <button type="button" class="secondary-button" data-recap-test="${key}">Tester</button><span class="settings-status" aria-live="polite"></span></div>`;
}
function setupMarkup(setup) {
  const guild = setup.guild || {};
  const server = guild.name ? `« ${esc(guild.name)} »` : 'de la communauté';
  // 1. Discord server and bot.
  const bot = !guild.id
    ? '<p>Cette communauté n’est reliée à aucun serveur Discord. Demande à un gestionnaire d’Endurance Manager de la relier.</p>'
    : guild.botPresent
      ? `<p>Le bot Endurance Manager est sur le serveur ${server}. Il lit seulement la liste des membres et leurs rôles, pour savoir qui a accès au site : il n’écrit jamais rien sur ton serveur.</p>`
      : `<p>Le bot d’Endurance Manager vérifie qui est membre de ton serveur Discord et avec quels rôles. Sans lui, personne ne peut entrer sur le site de la communauté.</p>
        <ol class="setup-howto"><li>Clique sur <strong>Inviter le bot</strong> : Discord s’ouvre directement sur ton serveur.</li>
        <li>Vérifie le nom du serveur, puis clique sur <strong>Autoriser</strong>. Il faut être administrateur du serveur (ou avoir la permission « Gérer le serveur »).</li>
        <li>Reviens ici et clique sur <strong>Vérifier</strong>.</li></ol>
        <div class="setup-actions">${setup.botInviteUrl ? `<a class="welcome-discord" href="${esc(setup.botInviteUrl)}" target="_blank" rel="noopener">Inviter le bot</a>` : ''}<button type="button" class="secondary-button" data-setup-refresh>Vérifier</button></div>`;
  // 2. Roles.
  const roles = `<p>Par défaut, tous les membres du serveur (@everyone) peuvent s’inscrire aux endurances et créer leur équipage. Les administrateurs du Discord ont déjà tout.</p>
    <ul class="setup-tips"><li>Donne à tes organisateurs <strong>Créer des courses</strong> et <strong>Gérer les inscriptions</strong>.</li>
    <li>Pour réserver le site à un rôle (par exemple « Pilote »), décoche tout sur @everyone et coche <strong>Endurances</strong> sur ce rôle.</li>
    <li>Les rôles se donnent sur Discord : le site les relit chaque jour, ou à la connexion suivante.</li></ul>
    <div class="setup-actions"><button type="button" class="secondary-button" data-go-tab="settings">Ouvrir les autorisations des rôles</button></div>`;
  // 3. Recap on Discord.
  const byScope = Object.fromEntries((setup.recaps || []).map(recap => [recap.scope, recap.webhook]));
  const count = (setup.recaps || []).length, mode = count === 2 ? 'two' : count === 1 ? 'one' : 'none';
  const oneScope = count === 1 ? setup.recaps[0].scope : 'all';
  const radio = (value, label, help) => `<label class="setup-mode"><input type="radio" name="mode" value="${value}" ${mode === value ? 'checked' : ''}><span><strong>${label}</strong><small>${help}</small></span></label>`;
  const recap = `<p>Un message sur ton Discord montre les courses de la semaine, les équipages et les pilotes inscrits. Il se met à jour tout seul à chaque inscription : pas besoin de le reposter.</p>
    ${setup.legacyRecap ? '<p class="setup-note">Le récap actuel (courses LMU) passe par le salon réglé à la création du site. Choisis ton salon ci-dessous pour le reprendre en main.</p>' : ''}
    <details class="setup-guide" ${count ? '' : 'open'}><summary>Créer un webhook sur Discord (1 minute)</summary><ol class="setup-howto">
      <li>Sur Discord, survole le salon où publier le récap et clique sur la roue dentée <strong>⚙ Modifier le salon</strong>.</li>
      <li>Ouvre <strong>Intégrations</strong>, puis <strong>Webhooks</strong>, et clique sur <strong>Nouveau webhook</strong>.</li>
      <li>Donne-lui un nom (par exemple « Endurance Manager ») et, si tu veux, une image.</li>
      <li>Clique sur <strong>Copier l’URL du webhook</strong>, puis colle-la ci-dessous et clique sur <strong>Tester</strong> : un message de test doit apparaître dans le salon.</li></ol>
      <p class="setup-note">Garde cette adresse pour toi : elle permet d’écrire dans le salon. Une fois enregistrée, le site ne la réaffiche plus.</p></details>
    <form class="setup-form" data-recaps data-mode="${mode}">
      <fieldset class="setup-modes"><legend>Quel récap veux-tu ?</legend>
        ${radio('none','Pas de récap','Aucun message sur Discord.')}
        ${radio('one','Un seul message','Une simu, ou LMU et iRacing ensemble, dans un salon.')}
        ${radio('two','Deux messages','Un pour LMU et un pour iRacing, par exemple dans deux salons séparés.')}</fieldset>
      <div class="setup-mode-block" data-mode-block="one"><label>Courses du message<select name="oneScope">${['all','lmu','iracing'].map(scope => `<option value="${scope}" ${oneScope === scope ? 'selected' : ''}>${RECAP_LABELS[scope]}</option>`).join('')}</select></label>
        ${webhookField('one', '', count === 1 ? setup.recaps[0].webhook : '')}</div>
      <div class="setup-mode-block" data-mode-block="two">${webhookField('lmu', 'LMU', count === 2 ? byScope.lmu : '')}${webhookField('iracing', 'iRacing', count === 2 ? byScope.iracing : '')}</div>
      <div class="setup-actions"><button class="primary-button" type="submit">Enregistrer le récap</button><span class="settings-status" aria-live="polite"></span></div></form>`;
  // 4. Invitation link.
  const invite = `<p>Un joueur qui arrive sur le site sans être membre de ton serveur voit un bouton pour le rejoindre.</p>
    <ol class="setup-howto"><li>Sur Discord, fais un clic droit sur l’icône de ton serveur, puis <strong>Inviter des gens</strong>.</li>
    <li>Clique sur <strong>Modifier le lien d’invitation</strong> et choisis « Expire après : <strong>Jamais</strong> ».</li><li>Copie le lien et colle-le ici.</li></ol>
    <form class="setup-form setup-inline" data-invite><input name="invite" type="url" placeholder="https://discord.gg/…" value="${esc(setup.discordInviteUrl || '')}">
      <button class="primary-button" type="submit">Enregistrer</button><span class="settings-status" aria-live="polite"></span></form>`;
  // 5. Announce the site.
  const message = `🏁 Nos courses d’endurance s’organisent maintenant sur Endurance Manager !\n👉 ${setup.siteUrl}/\n\nConnecte-toi avec ton compte Discord : tu y retrouves les courses LMU et iRacing, tu t’inscris avec tes disponibilités et tu crées ou rejoins un équipage.`;
  const announce = `<p>Partage l’adresse du site sur ton Discord, et épingle le message dans ton salon d’annonces.</p>
    <div class="setup-inline"><input readonly id="setup-site-url" value="${esc(setup.siteUrl)}/">${copyButton('setup-site-url')}</div>
    <label class="setup-message">Message prêt à poster<textarea id="setup-announce" rows="5" readonly>${esc(message)}</textarea></label>
    <div class="setup-actions">${copyButton('setup-announce')}</div>`;
  const todo = [guild.botPresent, setup.rolesConfigured, count > 0 || setup.legacyRecap, Boolean(setup.discordInviteUrl)].filter(done => !done).length;
  return {todo, html:`<p class="setup-intro">Suis ces étapes pour installer ${esc(setup.community?.name || 'ta communauté')} sur Endurance Manager. Chaque étape se coche toute seule une fois faite.</p>
    <ol class="setup-steps">
      ${step(Boolean(guild.botPresent), 1, 'Inviter le bot sur ton serveur Discord', guild.botPresent ? `Relié au serveur ${server}` : 'À faire : sans lui, personne ne peut entrer', bot)}
      ${step(setup.rolesConfigured, 2, 'Choisir ce que chaque rôle peut faire', setup.rolesConfigured ? 'Autorisations réglées' : 'Conseillé : réglages par défaut en place', roles, false)}
      ${step(count > 0 || setup.legacyRecap, 3, 'Publier le récap de la semaine sur Discord', count ? (setup.recaps || []).map(item => `${RECAP_LABELS[item.scope]} : ${esc(item.webhook)}`).join(' · ') : setup.legacyRecap ? 'Récap LMU actif (salon d’origine)' : 'Facultatif', recap)}
      ${step(Boolean(setup.discordInviteUrl), 4, 'Ajouter le lien d’invitation de ton serveur', setup.discordInviteUrl ? 'Lien enregistré' : 'Facultatif', invite)}
      ${step(null, 5, 'Annoncer le site à tes membres', 'Adresse et message prêts à copier', announce, false)}
    </ol>`};
}

// « Plateforme » (managers of Endurance Manager): the communities, and a new one.
async function platformMarkup() {
  const {communities, baseDomain} = await api('/api/platform/communities');
  const rows = communities.map(item => `<article class="platform-row"><div><strong>${esc(item.name)}</strong><a href="${esc(item.url)}/" target="_blank" rel="noopener">${esc(item.url.replace(/^https:\/\//, ''))}</a></div>
    <span>${item.discordServer ? `Discord « ${esc(item.discordServer)} »` : item.guildId ? `Serveur ${esc(item.guildId)}` : 'Aucun serveur'}</span>
    <span class="${item.botPresent ? 'platform-ok' : 'platform-ko'}">${item.botPresent ? '✓ Bot présent' : item.botInviteUrl ? `<a href="${esc(item.botInviteUrl)}" target="_blank" rel="noopener">Bot absent : lien d’invitation</a>` : 'Bot absent'}</span></article>`).join('');
  return `<section class="settings-card"><h2>Communautés (${communities.length})</h2><div class="platform-list">${rows}</div></section>
    <section class="settings-card"><h2>Nouvelle communauté</h2>
      <p class="members-help">Les administrateurs du serveur Discord deviennent automatiquement administrateurs de la communauté. Ils terminent ensuite l’installation dans « Gestion des membres → Mise en place ».</p>
      <form class="settings-appearance" data-new-community>
        <label>Nom de la communauté<input name="name" maxlength="80" required placeholder="Ex. : Team Rookie Racing"></label>
        <label>Nom court <small>(onglet du navigateur)</small><input name="shortName" maxlength="12" required placeholder="Ex. : TRR"></label>
        <label>Adresse du site<span class="platform-slug"><input name="slug" maxlength="40" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" placeholder="team-rookie"><span>.${esc(baseDomain || 'endurance-manager.app')}</span></span></label>
        <label>ID du serveur Discord<input name="guildId" inputmode="numeric" required pattern="[0-9]{15,22}" placeholder="Ex. : 1269541162025353289"></label>
        <p class="members-help">Pour l’ID : sur Discord, active <strong>Paramètres utilisateur → Avancés → Mode développeur</strong>, puis fais un clic droit sur l’icône du serveur et choisis <strong>Copier l’identifiant du serveur</strong>.</p>
        <div class="settings-actions"><button class="primary-button" type="submit">Créer la communauté</button><span class="settings-status" aria-live="polite"></span></div>
      </form><div data-created></div></section>`;
}

let openTab = '';
async function load() {
  try {
    const session = await api('/api/session');
    // A visitor who is not signed in goes to the welcome screen (Discord sign-in).
    if (!session.user) { location.replace('/'); return; }
    if (!(session.permissions || []).includes('admin')) throw new Error('Accès réservé aux administrateurs de la communauté.');
    const [result, settings, setupData, platform] = await Promise.all([api('/api/members'), settingsMarkup(), api('/api/community/setup'),
      session.manager ? platformMarkup() : Promise.resolve('')]);
    const setup = setupMarkup(setupData);
    const members = Array.isArray(result.members) ? result.members : [];
    const server = result.community?.discordServer ? ` « ${esc(result.community.discordServer)} »` : '';
    // The page name is already the active tab of the navigation bar: the title stays for screen readers only.
    app.innerHTML = `<h1 class="sr-only">Membres</h1>
      <div class="members-tabs" role="tablist"><button type="button" role="tab" data-tab="members" aria-selected="true">Membres <span>${members.length}</span></button><button type="button" role="tab" data-tab="setup" aria-selected="false">Mise en place${setup.todo ? ` <span>${setup.todo}</span>` : ''}</button><button type="button" role="tab" data-tab="settings" aria-selected="false">Réglages</button>${platform ? '<button type="button" role="tab" data-tab="platform" aria-selected="false">Plateforme</button>' : ''}</div>
      <section class="members-panel" data-panel="members">
        <div class="members-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote ou un rôle…" autocomplete="off"></label></div>
        <p class="members-help">Les membres du serveur Discord${server} qui se sont connectés au site. Leurs rôles se gèrent sur Discord et sont vérifiés chaque jour.</p>
        <div class="members-list member-grid">${members.map(member => memberCard(member, result.permissions || [])).join('')}</div>
        <p class="members-empty" hidden>Aucun membre ne correspond à cette recherche.</p></section>
      <section class="setup" data-panel="setup" hidden>${setup.html}</section>
      <div class="community-settings" data-panel="settings" hidden>${settings}</div>
      ${platform ? `<div class="community-settings" data-panel="platform" hidden>${platform}</div>` : ''}`;
    if (openTab) app.querySelector(`[data-tab="${openTab}"]`)?.click();
  } catch (error) {
    renderError(error.message || String(error));
  }
}

// Reloads the page content and comes back to the same tab.
async function reload(tab) { openTab = tab; await load(); }

app.addEventListener('click', async event => {
  const go = event.target.closest('[data-go-tab]');
  if (go) { app.querySelector(`[data-tab="${go.dataset.goTab}"]`)?.click(); return; }
  if (event.target.closest('[data-setup-refresh]')) { await reload('setup'); return; }
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    const field = document.getElementById(copy.dataset.copy);
    try { await navigator.clipboard.writeText(field.value); copy.textContent = '✓ Copié'; } catch { field.select(); }
    setTimeout(() => { copy.textContent = 'Copier'; }, 2000);
    return;
  }
  const testButton = event.target.closest('[data-recap-test]');
  if (testButton) {
    const form = testButton.closest('form'), key = testButton.dataset.recapTest, status = testButton.parentElement.querySelector('.settings-status');
    const scope = key === 'one' ? form.elements.oneScope.value : key;
    status.textContent = 'Envoi…';
    try { await api('/api/community/recaps/test', 'POST', {webhookUrl:form.elements[`hook-${key}`].value.trim(), scope}); status.textContent = '✓ Message de test envoyé : regarde ton salon Discord.'; }
    catch (error) { status.textContent = error.message; }
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  for (const button of app.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button === tab));
  for (const panel of app.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
});

app.addEventListener('input', event => {
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
  const recaps = event.target.closest('form[data-recaps]'), invite = event.target.closest('form[data-invite]'), created = event.target.closest('form[data-new-community]');
  if (recaps || invite || created) {
    event.preventDefault();
    const form = recaps || invite || created, status = form.querySelector('.settings-actions .settings-status, .setup-actions .settings-status, :scope > .settings-status');
    if (status) status.textContent = 'Enregistrement…';
    try {
      if (recaps) {
        const mode = form.elements.mode.value, hook = key => form.elements[`hook-${key}`].value.trim();
        const list = mode === 'one' ? [{scope:form.elements.oneScope.value, webhookUrl:hook('one')}] : mode === 'two' ? [{scope:'lmu', webhookUrl:hook('lmu')}, {scope:'iracing', webhookUrl:hook('iracing')}] : [];
        const result = await api('/api/community/recaps', 'PUT', {recaps:list});
        if (list.length && !result.published) throw new Error('Enregistré, mais Discord a refusé le message : clique sur « Tester » pour vérifier chaque webhook.');
        await reload('setup');
      } else if (invite) {
        await api('/api/community/invite', 'PATCH', {url:form.elements.invite.value.trim() || null});
        await reload('setup');
      } else {
        const input = Object.fromEntries(['name','shortName','slug','guildId'].map(key => [key, form.elements[key].value.trim()]));
        const result = await api('/api/platform/communities', 'POST', input);
        await reload('platform');
        const message = `Ta communauté est prête sur Endurance Manager : ${result.url}/\n\n1. Invite le bot sur ton serveur Discord : ${result.botInviteUrl || '(lien indisponible)'}\n2. Connecte-toi sur ${result.url}/ avec Discord, puis ouvre « Gestion des membres » → « Mise en place » et suis les étapes.`;
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

app.addEventListener('change', async event => {
  const box = event.target;
  // Recap: the fields of the chosen kind of recap.
  if (box.name === 'mode' && box.closest('form[data-recaps]')) { box.closest('form').dataset.mode = box.value; return; }
  if (box.dataset.module) {
    box.disabled = true;
    try {
      await api('/api/community/modules', 'PATCH', {[box.dataset.module]:box.checked});
      // The solo races permissions appear or disappear with the module.
      if (box.dataset.module === 'soloRaces') { await load(); app.querySelector('[data-tab="settings"]')?.click(); return; }
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
