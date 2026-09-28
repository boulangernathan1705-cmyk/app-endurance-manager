// Home page: only newcomers see it. Once a simulator is chosen (cookie em_sim set by its space), the
// server sends "/" and the logo straight to that simulator.
// A signed-in pilot who has not chosen yet (first visit after the Discord login) gets a small window
// to pick their simulator.
// Translation (English) and the language button of the page.
import './i18n.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const SIMS = [
  {href:'/lmu/', badge:'LMU', name:'Le Mans Ultimate', css:'game-lmu'},
  {href:'/iracing/', badge:'iR', name:'iRacing', css:'game-iracing'}
];

function openSimChooser(name) {
  if (document.querySelector('.hub-sim-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'hub-sim-dialog';
  dialog.setAttribute('aria-labelledby', 'hub-sim-title');
  dialog.innerHTML = `<h2 id="hub-sim-title">Bienvenue ${esc(name)} !</h2>
    <p>Sur quelle simu roules-tu ? Le site s’en souviendra, et tu pourras changer à tout moment depuis la barre de navigation.</p>
    <div class="hub-sim-choices">${SIMS.map(sim => `<a class="hub-sim-choice ${sim.css}" href="${sim.href}"><span class="game-badge" aria-hidden="true">${sim.badge}</span><strong>${sim.name}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>`;
  document.body.append(dialog);
  // Closing (Échap) leaves the home page, where the cards offer the same choice.
  dialog.addEventListener('close', () => dialog.remove());
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  dialog.querySelector('a')?.focus();
}

// "Se connecter avec Discord" is only for visitors who are not signed in yet.
async function showSignIn() {
  const box = document.getElementById('hub-login');
  if (!box) return;
  try {
    const session = await (await fetch('/api/session', {credentials:'same-origin', cache:'no-store'})).json();
    if (session.user) {
      box.innerHTML = `<p class="hub-welcome-back">Content de te revoir, <strong>${esc(session.user.name)}</strong>. Choisis ta simu ci-dessous.</p>`;
      document.querySelector('.hub-trust')?.remove();
      if (!/(?:^|;\s*)em_sim=/.test(document.cookie)) openSimChooser(session.user.name);
    }
  } catch {}
  box.hidden = false;
}

void showSignIn();
