// Standalone help page: the help follows the connected pilot's rights and the community's modules.
async function renderStandaloneHelp() {
  let session = null;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin', cache:'no-store'});
    if (response.ok) session = await response.json();
  } catch {}
  const module = await import('../help.js?v=4-site-tour');
  module.renderHelp(session);
}

void renderStandaloneHelp();
