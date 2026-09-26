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

const ROLE_LABELS = {pilot:'Pilote', organizer:'Organisateur'};

function memberRow(member) {
  const search = esc(`${member.name} ${member.id}`.toLocaleLowerCase('fr-FR'));
  if (member.role === 'admin') {
    return `<article class="members-row" data-search="${search}"><div class="members-identity"><strong>${esc(member.name)}</strong><small>Discord : ${esc(member.id)}</small></div><span class="members-role members-role-admin">Administrateur principal</span><span class="members-row-status"></span></article>`;
  }
  // The role is saved as soon as it changes: no separate "Enregistrer" button per member.
  return `<article class="members-row" data-member-id="${esc(member.id)}" data-search="${search}">
    <div class="members-identity"><strong>${esc(member.name)}</strong><small>Discord : ${esc(member.id)}</small></div>
    <label class="members-role-select"><span class="sr-only">Rôle de ${esc(member.name)}</span><select name="role" data-saved="${esc(member.role)}">${Object.entries(ROLE_LABELS).map(([value,label]) => `<option value="${value}" ${member.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <span class="members-row-status" role="status" aria-live="polite"></span>
  </article>`;
}

async function load() {
  try {
    const session = await api('/api/session');
    if (!session.user || session.user.role !== 'admin') throw new Error('Accès réservé aux administrateurs.');
    const result = await api('/api/members');
    const members = Array.isArray(result.members) ? result.members : [];
    // The page name is already the active tab of the navigation bar: the title stays for screen readers only.
    app.innerHTML = `<section class="members-panel"><h1 class="sr-only">Gestion des membres</h1>
      <div class="members-toolbar"><label class="members-search"><span class="sr-only">Rechercher un membre</span><input type="search" name="memberSearch" placeholder="Rechercher un pilote…" autocomplete="off"></label><span class="members-count">${members.length} membre${members.length > 1 ? 's' : ''}</span></div>
      <p class="members-help">Commun à LMU et iRacing. Un pilote apparaît ici après sa première connexion Discord ; son rôle est enregistré dès que tu le changes.</p>
      <div class="members-list">${members.map(memberRow).join('')}</div>
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

app.addEventListener('change', async event => {
  const select = event.target;
  const row = select.closest('.members-row[data-member-id]');
  if (!row || select.name !== 'role') return;
  const status = row.querySelector('.members-row-status');
  select.disabled = true;
  status.className = 'members-row-status';
  status.textContent = 'Enregistrement…';
  try {
    await api(`/api/members/${row.dataset.memberId}`, 'PATCH', {role:select.value});
    select.dataset.saved = select.value;
    status.classList.add('is-saved');
    status.textContent = '✓ Enregistré';
  } catch (error) {
    select.value = select.dataset.saved;
    status.classList.add('is-error');
    status.textContent = error.message || String(error);
  } finally {
    select.disabled = false;
  }
});

void load();
