// « Nouveautés » page: each pilot sees what concerns him. A line marked for a community shows to its pilots,
// a line "Pour les admins" to its admins (scripts/changelog.mjs marks them); a heading or a day left empty hides.
const page = document.querySelector('.changelog-page');
const same = value => String(value || '').normalize('NFC').toLocaleLowerCase('fr-FR').trim();

function visible(item, audience) {
  if (audience.all) return true;
  const tag = item.dataset.community;
  const mine = tag ? audience.communities.filter(entry => entry.names.some(name => same(name) === same(tag))) : audience.communities;
  if (tag && !mine.length) return false;
  return !item.hasAttribute('data-admin') || mine.some(entry => entry.admin);
}

async function filter() {
  let audience = {all:false, communities:[]};
  try {
    const response = await fetch('/api/changelog-audience', {credentials:'same-origin', cache:'no-store'});
    if (response.ok) audience = await response.json();
  } catch {}
  for (const item of page.querySelectorAll('li[data-admin], li[data-community]')) item.classList.toggle('shown', visible(item, audience));
  const shown = item => !item.matches('[data-admin], [data-community]') || item.classList.contains('shown');
  for (const heading of page.querySelectorAll('h3')) {
    const items = [];
    for (let next = heading.nextElementSibling; next && next.matches('ul'); next = next.nextElementSibling) items.push(...next.children);
    heading.hidden = !items.some(shown);
  }
  for (const section of page.querySelectorAll('.changelog-version'))
    section.hidden = !section.querySelector('p') && ![...section.querySelectorAll('li')].some(shown);
  fold();
}

// The latest versions first: the older ones wait behind « Voir les versions précédentes » (23 000 px of history on a
// phone otherwise, audit 2026-11-09).
const LATEST = 5;
function fold() {
  const older = [...page.querySelectorAll('.changelog-version')].filter(section => !section.hidden).slice(LATEST);
  if (!older.length || page.querySelector('.changelog-more')) return;
  for (const section of older) section.classList.add('is-older');
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'secondary-button changelog-more'; more.textContent = 'Voir les versions précédentes';
  more.addEventListener('click', () => { page.classList.add('all-versions'); more.remove(); });
  older[0].before(more);
  // A link to an older version (#…) opens them all.
  try { if (location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)))?.closest('.is-older')) more.click(); } catch {}
}

if (page) filter();
