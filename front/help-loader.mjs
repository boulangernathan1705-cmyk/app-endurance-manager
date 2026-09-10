const HELP_BUTTON_ID = 'help-nav-button';
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

function injectHelpButton() {
  if (!nav || document.getElementById(HELP_BUTTON_ID)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = HELP_BUTTON_ID;
  button.className = 'secondary-button help-nav-button';
  button.textContent = 'Aide';
  button.addEventListener('click', () => openHelp(button));

  const logout = nav.querySelector('[data-action="logout"]');
  const discord = nav.querySelector('.discord-button');
  if (logout) nav.insertBefore(button, logout);
  else if (discord) nav.insertBefore(button, discord);
  else nav.append(button);
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-action]')) return;
  document.getElementById(HELP_BUTTON_ID)?.removeAttribute('aria-current');
}, true);

if (nav) {
  new MutationObserver(injectHelpButton).observe(nav, {childList:true});
  injectHelpButton();
}
