import {paletteFor} from '../shared/appearance.mjs';
const html = document.documentElement;
const KEY = 'em-display-mode';
let preferred = '', look = {};
try { preferred = localStorage.getItem(KEY) || ''; } catch {}
function render() {
  const mode = ['light','dark'].includes(preferred) ? preferred : look.defaultMode === 'light' ? 'light' : 'dark';
  html.dataset.theme = mode;
  const palette = paletteFor(look);
  html.style.setProperty('--community-accent', palette[mode]);
  html.style.setProperty('--accent', palette[mode]);
  html.style.setProperty('--pastel', palette.pastel);
  html.dataset.communityAccent = 'true';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#eef2f6' : '#111820');
  for (const button of document.querySelectorAll('[data-display-mode]')) {
    button.textContent = mode === 'light' ? '☾ Sombre' : '☀ Clair';
    button.setAttribute('aria-label', mode === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair');
  }
}
export function applyAppearance(appearance = {}) { look = appearance; render(); }
export function installDisplayMode() {
  const place = document.querySelector('.account-bar') || document.querySelector('.game-space-bar');
  if (!place || document.querySelector('[data-display-mode]')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'display-mode-button'; button.dataset.displayMode = '';
  button.addEventListener('click', () => {
    preferred = html.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, preferred); } catch {}
    render();
  });
  place.prepend(button); render();
}
window.addEventListener('storage', event => { if (event.key === KEY) { preferred = event.newValue || ''; render(); } });
render();
