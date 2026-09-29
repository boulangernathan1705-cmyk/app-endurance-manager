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
  const legend = `<dl class="role-legend">${shown.map(permission => `<div><dt>${esc(PERMISSION_LABELS[permission])}</dt><dd>${esc(PERMISSION_HELP[permission])}</dd></div>`).join('')}</dl>`;
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
    <section class="settings-card"><h2>Modules</h2>${module('iracingImport','Endurances iRacing officielles','Import automatique des séries en équipe et des événements spéciaux.')}${module('discordWeekly','Récap Discord hebdomadaire','Message des courses de la semaine sur le salon Discord.')}${module('soloRaces','Courses solo','Onglet « Courses solo », places limitées, liste d’attente, courses OPEN / SAFE.')}</section>
    <section class="settings-card settings-roles-card"><h2>Autorisations des rôles Discord</h2><p class="members-help">Un membre cumule les autorisations de tous ses rôles. « @everyone » s’applique à tous les membres du serveur. Le propriétaire du serveur et les rôles « Administrateur » de Discord ont tout.</p>${legend}${roles}</section>`;
}

async function load() {
  try {
    const session = await api('/api/session');
    // A visitor who is not signed in goes to the welcome screen (Discord sign-in).
    if (!session.user) { location.replace('/'); return; }
    if (!(session.permissions || []).includes('admin')) throw new Error('Accès réservé aux administrateurs de la communauté.');
    const [result, settings] = await Promise.all([api('/api/members'), settingsMarkup()]);
    const members = Array.isArray(result.members) ? result.members : [];
    const server = result.community?.discordServer ? ` « ${esc(result.community.discordServer)} »` : '';
    // The page name is already the active tab of the navigation bar: the title stays for screen readers only.
    app.innerHTML = `<h1 class="sr-only">Membres</h1>
      <div class="members-tabs" role="tablist"><button type="button" role="tab" data-tab="members" aria-selected="true">Membres <span>${members.length}</span></button><button type="button" role="tab" data-tab="settings" aria-selected="false">Réglages</button></div>
      <section class="members-panel" data-panel="members">
        <div class="members-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote ou un rôle…" autocomplete="off"></label></div>
        <p class="members-help">Les membres du serveur Discord${server} qui se sont connectés au site. Leurs rôles se gèrent sur Discord et sont vérifiés chaque jour.</p>
        <div class="members-list member-grid">${members.map(member => memberCard(member, result.permissions || [])).join('')}</div>
        <p class="members-empty" hidden>Aucun membre ne correspond à cette recherche.</p></section>
      <div class="community-settings" data-panel="settings" hidden>${settings}</div>`;
  } catch (error) {
    renderError(error.message || String(error));
  }
}

app.addEventListener('click', event => {
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
