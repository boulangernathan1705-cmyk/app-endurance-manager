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
}

if (page) filter();
