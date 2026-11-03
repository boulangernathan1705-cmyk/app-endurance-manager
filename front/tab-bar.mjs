// Phone: the main sections (Accueil, Events, Endurance, Inscriptions, Équipages) in a bar at the bottom of the
// screen, one thumb away (Nathan, 2026-11-03). The bar mirrors the top navigation's own buttons: a tap clicks the
// real one, so every page keeps its behaviour (sim chooser, hash pages). Other tabs (LMU / iRacing, Fiches combo,
// Administration…) stay at the top. On a computer the bar is hidden (styles/tab-bar.css).
const SECTIONS = [
  ['nav-week-button', 'Accueil', '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'],
  ['nav-events-button', 'Events', '<path d="M5 21V4h11l-1.5 4L16 12H5"/>'],
  ['nav-endurance-button', 'Endurance', '<path d="M3 16v-4l2-5h14l2 5v4zM6 16v2M18 16v2"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>'],
  ['nav-entries-button', 'Inscriptions', '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'],
  ['nav-crews-button', 'Équipages', '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.4 5 2.8 5 5.8"/>']
];

const nav = document.getElementById('navigation');
let bar = null, queued = false;

function render() {
  queued = false;
  const found = SECTIONS.map(([css, label, icon]) => [nav.querySelector(`.nav-sections .${css}`), label, icon, css]).filter(([item]) => item);
  if (found.length < 2) { bar?.remove(); bar = null; document.body.classList.remove('has-tab-bar'); return; }
  if (!bar) {
    bar = document.createElement('nav');
    bar.className = 'tab-bar';
    bar.setAttribute('aria-label', 'Sections');
    bar.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]');
      if (!tab) return;
      event.preventDefault();
      nav.querySelector(`.nav-sections .${tab.dataset.tab}`)?.click();
    });
    document.body.append(bar);
    document.body.classList.add('has-tab-bar');
  }
  bar.innerHTML = found.map(([item, label, icon, css]) => {
    const count = item.querySelector('.nav-count')?.textContent.trim();
    const current = item.getAttribute('aria-current') === 'page';
    return `<a href="${item.getAttribute('href') || '#'}" data-tab="${css}"${current ? ' aria-current="page"' : ''}>`
      + `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span>${count ? `<em aria-label="${count} à traiter">${count}</em>` : ''}</a>`;
  }).join('');
}

function queue() { if (!queued) { queued = true; requestAnimationFrame(render); } }

if (nav) {
  new MutationObserver(queue).observe(nav, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-current', 'class']});
  queue();
}
