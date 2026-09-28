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
const PERMISSION_LABELS = {register:'S’inscrire', register_others:'Inscrire un autre pilote', create_crew:'Créer un équipage',
  manage_crews:'Gérer tous les équipages', create_race:'Créer une course', manage_races:'Gérer toutes les courses',
  safe_races:'Courses SAFE', admin:'Administrer la communauté'};

// Members of the community: found on its Discord server by the bot. Roles are managed on Discord; this page
// shows them with what they allow here (the settings of each role come with the community settings page).
function memberRow(member, allPermissions) {
  const search = esc(`${member.name} ${member.nickname} ${member.id} ${member.roles.map(role => role.name).join(' ')}`.toLocaleLowerCase('fr-FR'));
  const badge = member.manager ? '<span class="members-role members-role-admin">Gestionnaire de la plateforme</span>'
    : member.discordAdmin ? '<span class="members-role members-role-admin">Administrateur du Discord</span>' : '';
  const roles = member.roles.length ? member.roles.map(role => `<span class="members-discord-role">${esc(role.name)}</span>`).join('') : '<span class="members-discord-role is-empty">Aucun rôle</span>';
  const allowed = allPermissions.filter(permission => member.permissions.includes(permission)).map(permission => esc(PERMISSION_LABELS[permission] || permission)).join(' · ') || 'Aucune autorisation';
  return `<article class="members-row" data-search="${search}">
    <div class="members-identity"><strong>${esc(member.name)}</strong><small>${member.nickname ? `${esc(member.nickname)} · ` : ''}Discord : ${esc(member.id)}</small></div>
    <div class="members-discord-roles">${badge}${roles}</div>
    <p class="members-permissions">${allowed}</p>
  </article>`;
}

async function load() {
  try {
    const session = await api('/api/session');
    if (!session.user || !(session.permissions || []).includes('admin')) throw new Error('Accès réservé aux administrateurs de la communauté.');
    const result = await api('/api/members');
    const members = Array.isArray(result.members) ? result.members : [];
    const server = result.community?.discordServer ? ` « ${esc(result.community.discordServer)} »` : '';
    // The page name is already the active tab of the navigation bar: the title stays for screen readers only.
    app.innerHTML = `<section class="members-panel"><h1 class="sr-only">Membres</h1>
      <div class="members-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote ou un rôle…" autocomplete="off"></label><span class="members-count">${members.length} membre${members.length > 1 ? 's' : ''}</span></div>
      <p class="members-help">Les membres du serveur Discord${server} qui se sont connectés au site. Leurs rôles se gèrent sur Discord et sont vérifiés chaque jour ; ce qu’ils permettent ici se règle dans les réglages de la communauté.</p>
      <div class="members-list">${members.map(member => memberRow(member, result.permissions || [])).join('')}</div>
      <p class="members-empty" hidden>Aucun membre ne correspond à cette recherche.</p></section>`;
  } catch (error) {
    renderError(error.message || String(error));
  }
}

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

void load();
