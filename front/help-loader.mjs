const HELP_BUTTON_ID = 'help-nav-button';
const NAV_STACK_ID = 'help-sim-stack';
const nav = document.getElementById('navigation');
let helpModulePromise = null;
let helpStylesPromise = null;

function ensureHelpStyles() {
  if (helpStylesPromise) return helpStylesPromise;
  helpStylesPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('link[data-help-styles]');
    if (existing) {
      if (existing.sheet) resolve();
      else {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', reject, {once:true});
      }
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/help.css';
    link.dataset.helpStyles = 'true';
    link.addEventListener('load', resolve, {once:true});
    link.addEventListener('error', () => reject(new Error('Impossible de charger les styles de l’aide.')), {once:true});
    document.head.append(link);
  }).catch(error => {
    helpStylesPromise = null;
    throw error;
  });
  return helpStylesPromise;
}

function loadHelpModule() {
  if (!helpModulePromise) helpModulePromise = import('../help.js').catch(error => {
    helpModulePromise = null;
    throw error;
  });
  return helpModulePromise;
}

async function openHelp(button) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    const [, module] = await Promise.all([ensureHelpStyles(), loadHelpModule()]);
    module.renderHelp();
  } catch (error) {
    console.error(error);
    alert('Impossible de charger l’aide. Réessaie dans quelques instants.');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function createNavStack() {
  const stack = document.createElement('div');
  stack.id = NAV_STACK_ID;
  stack.className = 'help-sim-stack';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = HELP_BUTTON_ID;
  button.className = 'secondary-button help-nav-button';
  button.textContent = 'Aide';
  button.addEventListener('click', () => openHelp(button));

  const switcher = document.createElement('div');
  switcher.className = 'nav-game-switcher';
  switcher.setAttribute('aria-label', 'Changer de simulateur');
  switcher.innerHTML = `
    <a class="nav-game-switcher-button nav-game-switcher-lmu" href="/lmu/" aria-label="Accueil Le Mans Ultimate">Le Mans Ultimate</a>
    <a class="nav-game-switcher-button nav-game-switcher-iracing" href="/iracing/" aria-label="Accueil iRacing">iRacing</a>`;

  stack.append(button, switcher);
  return stack;
}

function injectNavStack() {
  if (!nav || document.getElementById(NAV_STACK_ID)) return;
  const stack = createNavStack();
  const logout = nav.querySelector('[data-action="logout"]');
  const discord = nav.querySelector('.discord-button');
  if (logout) nav.insertBefore(stack, logout);
  else if (discord) nav.insertBefore(stack, discord);
  else nav.append(stack);
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-action]')) return;
  document.getElementById(HELP_BUTTON_ID)?.removeAttribute('aria-current');
}, true);

if (nav) {
  new MutationObserver(injectNavStack).observe(nav, {childList:true});
  injectNavStack();
}
