const root = document.getElementById('account-menu-root');

const roleLabel = role => ({admin:'Administrateur',organizer:'Organisateur',pilot:'Pilote'}[role] || 'Pilote');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isHub = location.pathname === '/' || location.pathname.endsWith('/index.html');
const isMembers = location.pathname.endsWith('/members.html');
const isHelp = location.pathname.endsWith('/help.html');

function discordMark() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.5 5.3A16.3 16.3 0 0 0 15.4 4l-.5 1.1a14.6 14.6 0 0 0-5.8 0L8.6 4a16.1 16.1 0 0 0-4.1 1.3C1.9 9.2 1.2 13 1.6 16.8A16.8 16.8 0 0 0 6.7 19l1.2-1.7c-.7-.3-1.4-.7-2-1.2l.5-.4c3.8 1.8 7.8 1.8 11.6 0l.5.4c-.6.5-1.3.9-2 1.2l1.2 1.7a16.7 16.7 0 0 0 5.1-2.2c.5-4.4-.9-8.2-3.3-11.5ZM8.5 14.7c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z"/></svg>`;
}

function sessionAvatar(user) {
  const raw = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith('fmt_discord_avatar='));
  if (!raw) return '';
  try {
    const value = decodeURIComponent(raw.slice('fmt_discord_avatar='.length));
    const separator = value.indexOf(':');
    if (separator < 0) return '';
    const id = value.slice(0, separator);
    const hash = value.slice(separator + 1);
    if (String(user?.id || '') !== id || !/^\d{15,22}$/.test(id) || !/^[A-Za-z0-9_]{1,128}$/.test(hash)) return '';
    return `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(hash)}.png?size=128`;
  } catch {
    return '';
  }
}

function avatarUrl(user) {
  const direct = user?.avatarUrl || user?.avatar_url;
  if (typeof direct === 'string' && /^https?:\/\//.test(direct)) return direct;
  if (typeof user?.avatar === 'string' && /^https?:\/\//.test(user.avatar)) return user.avatar;
  const id = user?.discordId || user?.discord_id || user?.id;
  const hash = user?.discordAvatar || user?.discord_avatar || (typeof user?.avatar === 'string' && !user.avatar.includes('/') ? user.avatar : '');
  if (id && hash) return `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(hash)}.png?size=128`;
  const stored = sessionAvatar(user);
  if (stored) return stored;
  if (id && /^\d{15,22}$/.test(String(id))) {
    try {
      const index = Number((BigInt(id) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch {}
  }
  return '';
}

function avatarMarkup(user) {
  const src = avatarUrl(user);
  if (src) return `<span class="account-avatar"><img src="${esc(src)}" alt="" referrerpolicy="no-referrer">${discordMark()}</span>`;
  return `<span class="account-avatar is-fallback">${discordMark()}</span>`;
}

function bindAvatarFallbacks() {
  root?.querySelectorAll('.account-avatar img').forEach(image => image.addEventListener('error', () => {
    const wrapper = image.parentElement;
    image.remove();
    wrapper?.classList.add('is-fallback');
  }, {once:true}));
}

function closeMenu() {
  const menu = root?.querySelector('.account-menu');
  const trigger = root?.querySelector('.account-trigger');
  const popover = root?.querySelector('.account-popover');
  if (!menu || !trigger || !popover) return;
  menu.classList.remove('is-open');
  trigger.setAttribute('aria-expanded','false');
  popover.hidden = true;
}

function renderDisconnected(discordReady) {
  root.innerHTML = `<div class="account-disconnected-actions">
    <a class="account-menu-item account-help-link" href="/help.html">Aide</a>
    ${discordReady
      ? `<a class="account-discord-login" href="/api/auth/discord">${discordMark()}<span>Se connecter avec Discord</span></a>`
      : `<span class="account-discord-unavailable">${discordMark()}<span>Connexion Discord indisponible</span></span>`}
  </div>`;
}

function renderConnected(user) {
  const manage = user.role === 'admin' ? `<a class="account-menu-item" href="/members.html">Gestion des membres</a>` : '';
  const help = `<a class="account-menu-item" href="/help.html"${isHelp ? ' aria-current="page"' : ''}>Aide</a>`;

  root.innerHTML = `<div class="account-menu">
    <button type="button" class="account-trigger" aria-haspopup="menu" aria-expanded="false">
      ${avatarMarkup(user)}
      <span class="account-trigger-copy"><strong>${esc(user.name)}</strong><small>${roleLabel(user.role)}</small></span>
      <span class="account-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="account-popover" role="menu" hidden>
      <div class="account-popover-profile">${avatarMarkup(user)}<span><strong>${esc(user.name)}</strong><small>${roleLabel(user.role)}</small></span></div>
      ${help}${manage}
      <span class="account-menu-separator" aria-hidden="true"></span>
      <button type="button" class="account-menu-item account-menu-logout" data-account-logout>Déconnexion</button>
    </div>
  </div>`;
  bindAvatarFallbacks();
}

async function loadSession() {
  if (!root) return;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw new Error('session');
    const session = await response.json();
    if (session.user) renderConnected(session.user);
    else renderDisconnected(!!session.discordReady);
  } catch {
    root.innerHTML = '<span class="account-discord-unavailable">Compte indisponible</span>';
  }
}

function activateLegacyHashAction() {
  if (location.hash === '#members') {
    location.replace('/members.html');
    return;
  }
  if (location.hash === '#help') location.replace('/help.html');
}

root?.addEventListener('click', async event => {
  const trigger = event.target.closest('.account-trigger');
  if (trigger) {
    const menu = trigger.closest('.account-menu');
    const popover = menu.querySelector('.account-popover');
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    popover.hidden = !open;
    return;
  }
  if (event.target.closest('[data-account-logout]')) {
    const button = event.target.closest('[data-account-logout]');
    button.disabled = true;
    try {
      await fetch('/api/auth/logout', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
      location.assign(isHub || isMembers || isHelp ? '/' : location.pathname);
    } catch {
      button.disabled = false;
    }
  }
});

document.addEventListener('click', event => {
  if (!root || root.contains(event.target)) return;
  closeMenu();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();
});

void loadSession();
activateLegacyHashAction();
