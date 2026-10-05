// Info bubbles on every page (data-tip).
import './tooltip.mjs?v=2';
import {showCommunityIntro} from './community-intro.mjs';
import {installNotifications} from './notifications.mjs?v=1';
const root = document.getElementById('account-menu-root');

const roleLabel = role => ({admin:'Administrateur',organizer:'Organisateur',pilot:'Pilote'}[role] || 'Pilote');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isHub = location.pathname === '/' || location.pathname.endsWith('/index.html');
const isMembers = location.pathname.endsWith('/members.html');
const isHelp = location.pathname.endsWith('/help.html');
let siteCommunityName = '';

function discordMark() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.5 5.3A16.3 16.3 0 0 0 15.4 4l-.5 1.1a14.6 14.6 0 0 0-5.8 0L8.6 4a16.1 16.1 0 0 0-4.1 1.3C1.9 9.2 1.2 13 1.6 16.8A16.8 16.8 0 0 0 6.7 19l1.2-1.7c-.7-.3-1.4-.7-2-1.2l.5-.4c3.8 1.8 7.8 1.8 11.6 0l.5.4c-.6.5-1.3.9-2 1.2l1.2 1.7a16.7 16.7 0 0 0 5.1-2.2c.5-4.4-.9-8.2-3.3-11.5ZM8.5 14.7c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.4.9-2.4 2.1-2.4s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z"/></svg>`;
}

function sessionAvatar(user) {
  const raw = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith('em_discord_avatar='));
  if (!raw) return '';
  try {
    const value = decodeURIComponent(raw.slice('em_discord_avatar='.length));
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
  root.innerHTML = `<div class="account-disconnected-wrap"><div class="account-disconnected-actions">
    <a class="account-menu-item account-help-link" href="/help.html">Aide</a>
    ${discordReady
      ? `<a class="account-discord-login" href="/api/auth/discord">${discordMark()}<span class="login-long">Se connecter avec Discord</span><span class="login-short">Connexion</span></a>`
      : `<span class="account-discord-unavailable">${discordMark()}<span>Connexion Discord indisponible</span></span>`}
  </div>${discordReady?'<p class="account-oauth-trust">Connexion via Discord OAuth · aucun mot de passe transmis à Endurance Manager. <a href="/about.html#connexion">En savoir plus</a></p>':''}</div>`;
}

// "Mes communautés" (a player of several communities): the site of each one, under "Aide"; the current one marked.
function communitiesMarkup(communities) {
  const sites = communities.filter(item => item.current || /^https:\/\//.test(item.url || ''));
  if (sites.length < 2) return '';
  const mark = item => item.logoUrl ? `<img class="account-community-logo" src="${esc(item.logoUrl)}" alt="">` : `<span class="account-community-logo is-short">${esc(String(item.shortName || item.name).slice(0, 4))}</span>`;
  // How communities work (a pilot of several communities only), shown once on his first entry.
  return `<button type="button" class="account-menu-item" data-community-intro-open>Les communautés</button><span class="account-menu-separator" aria-hidden="true"></span><span class="account-menu-heading">Mes communautés</span>${sites.map(item => item.current
    ? `<span class="account-menu-item account-community is-current" aria-current="true">${mark(item)}<span>${esc(item.name)}</span><small>ici</small></span>`
    : `<a class="account-menu-item account-community" href="${esc(item.url)}">${mark(item)}<span>${esc(item.name)}</span></a>`).join('')}`;
}

function renderConnected(user, communities = [], training = false) {
  const train = training ? `<a class="account-menu-item" href="/entrainement.html"${location.pathname.endsWith('/entrainement.html') ? ' aria-current="page"' : ''}>Mon entraînement</a><a class="account-menu-item" href="/stands.html"${location.pathname.endsWith('/stands.html') ? ' aria-current="page"' : ''}>Mémo des circuits</a>` : '';
  const manage = user.role === 'admin' ? `<a class="account-menu-item" href="/members.html">Administration</a>` : '';
  const help = `<a class="account-menu-item" href="/help.html"${isHelp ? ' aria-current="page"' : ''}>Aide</a>`;

  root.innerHTML = `<div class="account-menu">
    <button type="button" class="account-trigger" aria-haspopup="menu" aria-expanded="false">
      ${avatarMarkup(user)}
      <span class="account-trigger-copy"><strong>${esc(user.name)}</strong><small>${roleLabel(user.role)}</small></span>
      <span class="account-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="account-popover" role="menu" hidden>
      <div class="account-popover-profile">${avatarMarkup(user)}<span><strong>${esc(user.name)}</strong><small>${roleLabel(user.role)}</small></span></div>
      ${train}${help}${manage}${communitiesMarkup(communities)}
      <span class="account-menu-separator" aria-hidden="true"></span>
      <button type="button" class="account-menu-item account-menu-logout" data-account-logout>Déconnexion</button>
    </div>
  </div>`;
  bindAvatarFallbacks();
}

// Look of the community of this site (communities platform): its logo and short name next to the language flag, the
// short name before the page title, the icon and banner of its Discord server, its accent color.
function applyCommunity(community, communities = [], openSite = false) {
  if (!community) return;
  // The main address keeps the look of the site, without community name ("Mes communautés" is in the account menu).
  if (openSite) return;
  const look = community.appearance || {};
  document.documentElement.dataset.community = community.slug;
  if (look.accent) { document.documentElement.style.setProperty('--community-accent', look.accent); document.documentElement.dataset.communityAccent = 'true'; }
  if (community.shortName && !document.title.startsWith(`${community.shortName} · `)) document.title = `${community.shortName} · ${document.title}`;
  if (look.logoUrl) {
    for (const image of document.querySelectorAll('.brand-mark')) image.src = look.logoUrl;
    const icon = document.querySelector('link[rel="icon"]'); if (icon) { icon.href = look.logoUrl; icon.type = 'image/png'; }
  }
  if (look.bannerUrl) for (const image of document.querySelectorAll('.hero-banner')) { image.removeAttribute('srcset'); image.src = look.bannerUrl; }
  // The community of this site next to the language flag: its Discord logo and its short name (the other
  // communities are in the account menu).
  const place = document.querySelector('.site-nav-shell .game-space-bar');
  if (place && !place.querySelector('.community-badge')) {
    const badge = document.createElement('span');
    badge.className = 'community-badge';
    badge.dataset.tip = `Communauté ${community.name}`; badge.setAttribute('aria-label', `Communauté ${community.name}`);
    if (look.logoUrl) { const logo = document.createElement('img'); logo.src = look.logoUrl; logo.alt = ''; badge.append(logo); }
    const name = document.createElement('strong'); name.textContent = community.shortName || community.name; badge.append(name);
    place.append(badge);
  }
}

// Main address: a showcase with fictional races. Says so on every page, and where to go for a real community.
function showcaseBanner(platformDiscordUrl) {
  const bar = document.querySelector('.site-nav-shell');
  if (!bar || document.querySelector('.showcase-banner')) return;
  const banner = document.createElement('aside');
  banner.className = 'showcase-banner';
  const label = document.createElement('strong'); label.textContent = 'Vitrine';
  const text = document.createElement('span');
  text.textContent = 'Tu regardes une démonstration d’Endurance Manager : les courses, les équipages et les pilotes sont fictifs.';
  banner.append(label, text);
  // The manager of a Discord server asks for the space of their community (demande-communaute.html).
  const request = document.createElement('a'); request.href = '/demande-communaute.html'; request.textContent = 'Demander un espace pour ta communauté';
  banner.append(request);
  if (/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(platformDiscordUrl || '')) {
    const link = document.createElement('a'); link.href = platformDiscordUrl; link.rel = 'noopener'; link.textContent = 'Rejoindre le Discord d’Endurance Manager';
    banner.append(link);
  }
  bar.after(banner);
}

// Installable app (home screen): the service worker only shows an offline page, it never caches the races.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

async function loadSession() {
  if (!root) return;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw new Error('session');
    const session = await response.json();
    applyCommunity(session.community, Array.isArray(session.communities) ? session.communities : [], session.openSite === true);
    if (session.openSite) showcaseBanner(session.platformDiscordUrl);
    siteCommunityName = session.openSite ? '' : session.community?.name || '';
    if (session.user) {
      renderConnected(session.user, Array.isArray(session.communities) ? session.communities : [], session.training === true);
      // The bell of the races the player is entered in, next to his account (members of the community only).
      if (session.access === 'member') installNotifications(root);
    }
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

// The address already names the open race (#event=…) or My entries: Discord login brings the pilot back there.
function loginReturnPath() {
  return location.pathname + (/^#(?:event=[a-f0-9-]{36}|inscriptions)$/.test(location.hash) ? location.hash : '');
}

root?.addEventListener('click', async event => {
  const login = event.target.closest('.account-discord-login');
  if (login) {
    login.href = `/api/auth/discord?return=${encodeURIComponent(loginReturnPath())}`;
    return;
  }
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
  if (event.target.closest('[data-community-intro-open]')) {
    closeMenu();
    showCommunityIntro({communityName:siteCommunityName});
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
