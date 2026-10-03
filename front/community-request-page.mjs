// « Demander un espace »: the manager of a Discord server asks for the space of their community. Signed in with
// Discord (the request carries their account); the platform managers read it in « Administration → Plateforme ».
const app = document.getElementById('request-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const BASE = 'endurance-manager.app';
const STATUS = {pending:['En attente', 'request-pending'], done:['Espace créé', 'request-done'], rejected:['Refusée', 'request-rejected']};
const MEMBERS = ['moins de 20', '20 à 50', '50 à 150', 'plus de 150'];

async function api(path, method = 'GET', data) {
  const response = await fetch(path, {method, credentials:'same-origin', cache:'no-store',
    headers:method === 'GET' ? {} : {'Content-Type':'application/json'}, body:method === 'GET' ? undefined : JSON.stringify(data || {})});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Cette action a échoué.');
  return result;
}

const intro = `<section class="settings-card request-intro"><h1>Un espace Endurance Manager pour ta communauté</h1>
  <p>Ta communauté aura son propre site, à son adresse (<strong>ta-commu.${BASE}</strong>), séparé des autres : ses courses LMU et iRacing, ses équipages, sa bannière et ses couleurs.
  L’accès se fait par ton serveur Discord : seuls ses membres y entrent, avec les droits de leurs rôles.</p>
  <p>Remplis ce formulaire en tant que gérant du serveur. La demande est lue à la main ; tu recevras l’adresse de ton espace et les étapes pour l’installer.</p></section>`;

function previous(requests) {
  if (!requests.length) return '';
  const rows = requests.map(item => {
    const [label, css] = STATUS[item.status] || STATUS.pending;
    const date = new Date(item.createdAt * 1000).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
    return `<li><strong>${esc(item.communityName)}</strong><span>${esc(item.slug)}.${BASE} · envoyée le ${esc(date)}</span><em class="${css}">${label}</em></li>`;
  }).join('');
  return `<section class="settings-card"><h2>Tes demandes</h2><ul class="request-history">${rows}</ul></section>`;
}

function form(user) {
  const members = MEMBERS.map(value => `<option value="${esc(value)}">${esc(value)} membres</option>`).join('');
  return `<section class="settings-card"><h2>Ta demande</h2>
    <form class="settings-appearance request-form" data-request>
      <label>Nom de la communauté<input name="communityName" maxlength="80" required placeholder="Ex. : Team Rookie Racing"></label>
      <label>Nom court <small>(onglet du navigateur, 12 caractères)</small><input name="shortName" maxlength="12" required placeholder="Ex. : TRR"></label>
      <label>Adresse souhaitée<span class="platform-slug"><input name="slug" maxlength="40" required pattern="[a-z0-9][a-z0-9\\-]{1,38}[a-z0-9]" placeholder="team-rookie"><span>.${BASE}</span></span></label>
      <label>ID du serveur Discord<input name="guildId" inputmode="numeric" required pattern="[0-9]{15,22}" placeholder="Ex. : 1269541162025353289"></label>
      <p class="members-help">Pour l’ID : sur Discord, active <strong>Paramètres utilisateur → Avancés → Mode développeur</strong>, puis fais un clic droit sur l’icône du serveur et choisis <strong>Copier l’identifiant du serveur</strong>.</p>
      <fieldset class="request-games"><legend>Simulateurs</legend>
        <label><input type="radio" name="games" value="lmu" required> Le Mans Ultimate</label>
        <label><input type="radio" name="games" value="iracing"> iRacing</label>
        <label><input type="radio" name="games" value="both"> Les deux</label></fieldset>
      <label>Taille de la communauté<select name="members" required><option value="">Choisir…</option>${members}</select></label>
      <label>Lien d’invitation du serveur <small>(facultatif)</small><input name="inviteUrl" type="url" maxlength="200" placeholder="https://discord.gg/…"></label>
      <label>Autre contact <small>(facultatif : un autre admin, un e-mail)</small><input name="contact" maxlength="120"></label>
      <label class="request-wide">Ton message <small>(facultatif : vos courses, vos besoins, des questions)</small><textarea name="message" rows="4" maxlength="1500"></textarea></label>
      <p class="members-help">La demande est envoyée avec ton compte Discord <strong>${esc(user.name)}</strong>, pour pouvoir te recontacter.</p>
      <div class="settings-actions"><button class="primary-button" type="submit">Envoyer la demande</button><span class="settings-status" aria-live="polite"></span></div>
    </form></section>`;
}

async function load() {
  try {
    const session = await api('/api/session');
    if (!session.user) {
      const login = session.discordReady
        ? `<a class="welcome-discord" href="/api/auth/discord?return=${encodeURIComponent(location.pathname)}"><span>Se connecter avec Discord</span></a>`
        : '<p class="members-help">La connexion Discord n’est pas disponible pour le moment.</p>';
      app.innerHTML = `${intro}<section class="settings-card"><h2>Connecte-toi pour faire ta demande</h2>
        <p class="members-help">Ta demande est liée à ton compte Discord : c’est ainsi que nous te recontactons et que nous vérifions que tu gères bien le serveur.</p>${login}</section>`;
      return;
    }
    const {requests} = await api('/api/community-requests');
    const pending = requests.filter(item => item.status === 'pending').length;
    const full = pending >= 3 ? '<section class="settings-card"><p class="members-help">Tu as déjà plusieurs demandes en attente : elles seront traitées avant d’en envoyer une autre.</p></section>' : form(session.user);
    app.innerHTML = intro + previous(requests) + full;
  } catch (error) {
    app.innerHTML = `<section class="members-panel members-error"><h1>Page indisponible</h1><p>${esc(error.message)}</p><a class="secondary-button" href="/">Retour à l’accueil</a></section>`;
  }
}

app.addEventListener('input', event => {
  // The address follows the name until it is typed by hand.
  const form = event.target.closest('form[data-request]');
  if (!form) return;
  if (event.target.name === 'slug') form.elements.slug.dataset.edited = '1';
  if (event.target.name === 'communityName' && !form.elements.slug.dataset.edited) {
    form.elements.slug.value = event.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
});

app.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-request]');
  if (!form) return;
  event.preventDefault();
  const status = form.querySelector('.settings-status'), button = form.querySelector('button[type=submit]');
  const input = Object.fromEntries(['communityName', 'shortName', 'slug', 'guildId', 'members', 'inviteUrl', 'contact', 'message'].map(key => [key, form.elements[key].value.trim()]));
  input.games = form.elements.games.value;
  status.textContent = 'Envoi…'; button.disabled = true;
  try {
    await api('/api/community-requests', 'POST', input);
    await load();
    app.querySelector('.request-intro')?.insertAdjacentHTML('afterend', `<section class="setup-created" role="status"><strong>✓ Demande envoyée.</strong>
      <p>Elle sera étudiée rapidement. Tu seras recontacté sur Discord avec l’adresse de ton espace et les étapes pour l’installer.</p></section>`);
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});

load();
