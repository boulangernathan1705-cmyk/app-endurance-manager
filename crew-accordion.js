const app = document.getElementById('app');

function pilotNameFromRow(row) {
  const name = row.querySelector('.pilot-name');
  if (!name) return '';
  return Array.from(name.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function addText(parent, className, text, strong = false) {
  const element = document.createElement('span');
  element.className = className;
  const child = strong ? document.createElement('strong') : document.createTextNode(text);
  if (strong) child.textContent = text;
  element.append(child);
  parent.append(element);
  return element;
}

function enhanceCrewGroup(group) {
  if (!(group instanceof HTMLElement) || group.dataset.crewAccordion === 'true') return;

  const groupHeader = group.querySelector(':scope > .crew-pilot-group-header');
  if (!groupHeader) return;

  const teamName = groupHeader.querySelector('strong')?.textContent.trim() || 'Équipage';
  const car = groupHeader.querySelector('span')?.textContent.trim() || 'Voiture à choisir';
  const pilotNames = Array.from(group.querySelectorAll(':scope > .pilot-row'))
    .map(pilotNameFromRow)
    .filter(Boolean);
  const categoryHeader = group.closest('.category-group')?.querySelector(':scope > .category-group-header');
  const categoryLogo = categoryHeader?.querySelector('.category-logo, .category-text-logo');

  const details = document.createElement('details');
  details.className = `${group.className} crew-pilot-accordion`;
  details.dataset.crewAccordion = 'true';

  const summary = document.createElement('summary');
  summary.className = 'crew-pilot-accordion-summary';
  summary.setAttribute('aria-label', `${teamName} · ${pilotNames.join(', ') || 'aucun pilote'} · ${car}`);

  const category = document.createElement('span');
  category.className = 'crew-compact-category';
  category.setAttribute('aria-hidden', 'true');
  if (categoryLogo) category.append(categoryLogo.cloneNode(true));
  summary.append(category);

  addText(summary, 'crew-compact-team', teamName, true);
  addText(summary, 'crew-compact-pilots', pilotNames.join(' · ') || 'Aucun pilote affecté');
  addText(summary, 'crew-compact-car', car);

  const chevron = document.createElement('span');
  chevron.className = 'crew-compact-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  summary.append(chevron);

  const body = document.createElement('div');
  body.className = 'crew-pilot-accordion-body';
  while (group.firstChild) body.append(group.firstChild);

  details.append(summary, body);
  group.replaceWith(details);
}

function enhanceCrewAccordions(root = app) {
  if (!root) return;
  if (root instanceof HTMLElement && root.matches('.crew-pilot-group:not([data-crew-accordion="true"])')) {
    enhanceCrewGroup(root);
  }
  root.querySelectorAll?.('.crew-pilot-group:not([data-crew-accordion="true"])').forEach(enhanceCrewGroup);
}

if (app) {
  enhanceCrewAccordions();
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhanceCrewAccordions(node);
      }
    }
  }).observe(app, { childList: true, subtree: true });
}
