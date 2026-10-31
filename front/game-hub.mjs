// Home page: only newcomers see it. Once a simulator is chosen (cookie em_sim set by its space), the
// server sends "/" and the logo straight to that simulator.
// A signed-in pilot who has not chosen yet picks their simulator on the page's own cards (no second window
// asking the same question on top of them).
// Translation (English) and the language button of the page.
import './i18n.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// "Se connecter avec Discord" is only for visitors who are not signed in yet.
async function showSignIn() {
  const box = document.getElementById('hub-login');
  if (!box) return;
  try {
    const session = await (await fetch('/api/session', {credentials:'same-origin', cache:'no-store'})).json();
    if (session.user) {
      box.innerHTML = `<p class="hub-welcome-back">Content de te revoir, <strong>${esc(session.user.name)}</strong>. Choisis ta simu ci-dessous.</p>`;
      document.querySelector('.hub-trust')?.remove();
    }
  } catch {}
  box.hidden = false;
}

void showSignIn();
