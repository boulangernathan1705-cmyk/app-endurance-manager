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

function memberRow(member) {
  if (member.role === 'admin') {
    return `<article class="members-row"><div class="members-identity"><strong>${esc(member.name)}</strong><small>Discord : ${esc(member.id)}</small></div><span class="members-role members-role-admin">Administrateur principal</span></article>`;
  }
  return `<form class="members-row" data-member-id="${esc(member.id)}">
    <div class="members-identity"><strong>${esc(member.name)}</strong><small>Discord : ${esc(member.id)}</small></div>
    <label class="members-role-select"><span class="sr-only">Rôle de ${esc(member.name)}</span><select name="role"><option value="pilot" ${member.role === 'pilot' ? 'selected' : ''}>Pilote</option><option value="organizer" ${member.role === 'organizer' ? 'selected' : ''}>Organisateur</option></select></label>
    <button class="secondary-button" type="submit">Enregistrer</button>
  </form>`;
}

async function load() {
  try {
    const session = await api('/api/session');
    if (!session.user || session.user.role !== 'admin') throw new Error('Accès réservé aux administrateurs.');
    const result = await api('/api/members');
    const members = Array.isArray(result.members) ? result.members : [];
    app.innerHTML = `<section class="members-panel"><header class="members-heading"><div><span class="members-kicker">ENDURANCE MANAGER</span><h1>GESTION DES MEMBRES</h1><p>Cette page est commune à LMU et iRacing. Un pilote apparaît après sa première connexion Discord.</p></div><span class="members-count">${members.length} membre${members.length > 1 ? 's' : ''}</span></header><div class="members-list">${members.map(memberRow).join('')}</div><p id="members-status" class="members-status" role="status" aria-live="polite"></p></section>`;
  } catch (error) {
    renderError(error.message || String(error));
  }
}

app.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-member-id]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('members-status');
  button.disabled = true;
  try {
    await api(`/api/members/${form.dataset.memberId}`, 'PATCH', {role:form.elements.role.value});
    if (status) status.textContent = 'Autorisations mises à jour.';
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
  } finally {
    button.disabled = false;
  }
});

void load();
