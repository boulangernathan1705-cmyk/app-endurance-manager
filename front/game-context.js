(() => {
  const game = location.pathname.startsWith('/iracing') ? 'iracing' : 'lmu';
  const labels = {lmu:'Le Mans Ultimate',iracing:'iRacing'};
  globalThis.__ENDURANCE_GAME__ = game;
  document.documentElement.dataset.game = game;
  // Remembers the simulator the pilot chose: next time, the home page sends them straight here
  // (the logo also leads there; the navigation bar switches between simulators).
  // The events calendar (every sim) and a shared event are not a choice: « Endurance » asks for it then.
  const chosen = /(?:^|;\s*)em_sim=/.test(document.cookie);
  if (chosen || !/^#(solo|event=)/.test(location.hash)) {
    try { document.cookie = `em_sim=${game}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch {}
  }

  const applyLabel = () => {
    const label = document.getElementById('game-context-label');
    if (label) label.textContent = labels[game];
    document.title = `${labels[game]} — ENDURANCE MANAGER`;
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', applyLabel, {once:true});
  else applyLabel();
})();
