// The bell next to the account (signed-in players): what happens on the races the player is entered in, with the
// number of notifications not read yet. Opening it marks them read; each one opens its race.
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const REFRESH_MS = 60000;
const CHANGES = {starts:'horaires', circuit:'circuit', duration:'durée', name:'nom'};
let wrap = null, items = [], unread = 0, loading = false;

const b = value => `<strong>${esc(value)}</strong>`;
// The sentence of each notification (server/notifications.mjs).
function sentence(item) {
  const crew = b(item.crewName || 'sans nom');
  switch (item.kind) {
    case 'entry': return `${b(item.pilot)} s’est inscrit sur ton départ${item.category && item.category !== '*' ? ` en ${esc(item.category)}` : ''}`;
    case 'entered_by': return `${b(item.by)} t’a inscrit${item.category && item.category !== '*' ? ` en ${esc(item.category)}` : ''}`;
    case 'crew_join': return `${b(item.pilot)} a rejoint ton équipage ${crew}`;
    case 'crew_added': return `${b(item.by)} t’a ajouté à l’équipage ${crew}`;
    case 'crew_leave': return `${b(item.pilot)} a quitté ton équipage ${crew}`;
    case 'crew_removed': return `${b(item.by)} t’a retiré de l’équipage ${crew}`;
    case 'crew_deleted': return `L’équipage ${crew} a été supprimé${item.by ? ` par ${b(item.by)}` : ''}`;
    case 'crew_start': return `Ton équipage ${crew} a choisi son départ`;
    case 'crew_car': return item.car ? `Ton équipage ${crew} roulera en ${b(item.car)}` : `Ton équipage ${crew} n’a plus de voiture choisie`;
    case 'withdrawn': return `${b(item.pilot)} s’est désinscrit : une place se libère dans ton équipage ${crew}`;
    case 'removed_by': return `${item.by ? b(item.by) : 'Un organisateur'} a retiré ton inscription`;
    case 'race_changed': {
      const what = (item.changes || []).map(key => CHANGES[key]).filter(Boolean);
      return `La course a été modifiée${what.length ? ` : ${esc(what.join(', '))}` : ''}${item.previousName ? ` (ancien nom : ${esc(item.previousName)})` : ''}`;
    }
    case 'race_deleted': return 'La course a été supprimée';
    case 'race_reminder': return `Rappel : ta course commence dans moins de 24 h${item.crewName ? ` avec ton équipage ${crew}` : ''}${discordThread(item) ? ' · ouvre le fil de l’équipage sur Discord' : ''}`;
    default: return 'Du nouveau sur une de tes courses';
  }
}

function startLabel(item) {
  if (item.tbd) return 'horaire à définir';
  if (!item.startsAt) return '';
  return new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(item.startsAt));
}

function ago(seconds) {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

// The reminder of a crew with its thread on Discord opens the thread (server/crew-discord.mjs).
const discordThread = item => item.kind === 'race_reminder' && /^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(item.threadUrl || '') ? item.threadUrl : '';

function link(item) {
  if (!item.eventId || item.kind === 'race_deleted') return '';
  if (discordThread(item)) return discordThread(item);
  return `/${item.game === 'iracing' ? 'iracing' : 'lmu'}/#event=${item.eventId}`;
}

function itemMarkup(item) {
  const where = [item.eventName, startLabel(item)].filter(Boolean).map(esc).join(' · ');
  const body = `<span class="notif-text">${sentence(item)}</span><span class="notif-meta">${where}</span><span class="notif-time">${ago(item.createdAt)}</span>`;
  const href = link(item), css = `notif-item${item.read ? '' : ' is-unread'}`;
  return href ? `<a class="${css}" href="${esc(href)}" role="menuitem">${body}</a>` : `<span class="${css}">${body}</span>`;
}

function render() {
  if (!wrap) return;
  const count = wrap.querySelector('.notif-count');
  count.hidden = !unread;
  count.textContent = unread > 9 ? '9+' : String(unread);
  wrap.querySelector('.notif-bell').setAttribute('aria-label', unread ? `Notifications : ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications');
  wrap.querySelector('.notif-list').innerHTML = items.length
    ? items.map(itemMarkup).join('')
    : '<p class="notif-empty">Rien de neuf pour l’instant. Tu seras prévenu ici quand un pilote s’inscrit sur ton départ, rejoint ou quitte ton équipage, ou quand une de tes courses change.</p>';
}

async function load() {
  if (loading || document.hidden) return;
  loading = true;
  try {
    const response = await fetch('/api/notifications', {credentials:'same-origin', cache:'no-store'});
    if (!response.ok) return;
    const data = await response.json();
    items = Array.isArray(data.notifications) ? data.notifications : [];
    unread = Number(data.unread) || 0;
    render();
  } catch {
    // Network hiccup: the next refresh tries again.
  } finally {
    loading = false;
  }
}

function setOpen(open) {
  const panel = wrap.querySelector('.notif-panel'), bell = wrap.querySelector('.notif-bell');
  panel.hidden = !open;
  // Phones: the list spans the screen, just under the bell.
  if (open) panel.style.setProperty('--notif-top', `${Math.round(bell.getBoundingClientRect().bottom + 6)}px`);
  bell.setAttribute('aria-expanded', String(open));
  wrap.classList.toggle('is-open', open);
  if (open && unread) {
    unread = 0;
    render();
    fetch('/api/notifications/read', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}'}).catch(() => {});
  }
  if (!open) for (const item of items) item.read = true;
}

// Placed just before the account menu (`root`), once.
export function installNotifications(root) {
  if (!root || wrap) return;
  wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = `<button type="button" class="notif-bell" aria-haspopup="menu" aria-expanded="false" aria-label="Notifications">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
      <span class="notif-count" hidden></span>
    </button>
    <div class="notif-panel" role="menu" hidden><div class="notif-head">Notifications</div><div class="notif-list"></div></div>`;
  root.before(wrap);
  render();
  wrap.querySelector('.notif-bell').addEventListener('click', () => setOpen(wrap.querySelector('.notif-panel').hidden));
  wrap.querySelector('.notif-list').addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('click', event => { if (!wrap.contains(event.target) && !wrap.querySelector('.notif-panel').hidden) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !wrap.querySelector('.notif-panel').hidden) setOpen(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(load, REFRESH_MS);
  load();
}
