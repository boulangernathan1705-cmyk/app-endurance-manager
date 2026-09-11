const nav = document.getElementById('navigation');
const home = nav?.querySelector('[data-action="home"]');

function roleLabel(role) {
  return role === 'admin' ? 'Administrateur' : role === 'organizer' ? 'Organisateur' : 'Pilote';
}

async function renderStandaloneHelp() {
  try {
    const response = await fetch('/api/session', {credentials:'same-origin', cache:'no-store'});
    const session = response.ok ? await response.json() : {user:null};
    if (nav) {
      const account = document.createElement('span');
      account.className = 'account-name';
      account.textContent = session.user?.name || '';
      const small = document.createElement('small');
      small.textContent = session.user ? roleLabel(session.user.role) : '';
      account.append(small);
      nav.append(account);
    }
  } catch {}

  home?.addEventListener('click', () => {
    const referrer = document.referrer;
    try {
      const url = referrer ? new URL(referrer) : null;
      if (url && url.origin === location.origin && !url.pathname.endsWith('/help.html')) {
        location.assign(url.pathname + url.search + url.hash);
        return;
      }
    } catch {}
    location.assign('/');
  });

  const module = await import('../help.js');
  module.renderHelp();
}

void renderStandaloneHelp();
