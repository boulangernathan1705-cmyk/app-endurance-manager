(() => {
  const game = location.pathname.startsWith('/iracing') ? 'iracing' : 'lmu';
  const labels = {lmu:'Le Mans Ultimate',iracing:'iRacing'};
  globalThis.__ENDURANCE_GAME__ = game;
  document.documentElement.dataset.game = game;

  const applyLabel = () => {
    const label = document.getElementById('game-context-label');
    if (label) label.textContent = labels[game];
    document.title = `${labels[game]} — ENDURANCE MANAGER`;
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', applyLabel, {once:true});
  else applyLabel();
})();
