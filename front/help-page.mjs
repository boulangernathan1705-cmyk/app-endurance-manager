// Standalone help page: the help follows the connected pilot's rights and the community's modules.
async function renderStandaloneHelp() {
  let session = null;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin', cache:'no-store'});
    if (response.ok) session = await response.json();
  } catch {}
  try {
    const module = await import('../help.js?v=7-event-solo');
    module.renderHelp(session);
  } catch {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="help-load-error"><p role="alert">L’aide n’a pas pu se charger.</p><button class="primary-button" type="button">Réessayer</button></div>';
    app.querySelector('button').addEventListener('click', () => location.reload());
  }
}

void renderStandaloneHelp();
