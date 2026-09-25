// Standalone help page: the help content adapts to the connected pilot's role.
async function renderStandaloneHelp() {
  let user = null;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin', cache:'no-store'});
    if (response.ok) user = (await response.json()).user || null;
  } catch {}
  const module = await import('../help.js?v=3-session-role');
  module.renderHelp(user);
}

void renderStandaloneHelp();
