const app = document.getElementById('app');
const paletteSize = 12;
const toneByPilot = new Map();
const pilotByTone = new Map();
let timelineObserver;

function normalizePilotName(value) {
  return String(value || '').trim().toLocaleLowerCase('fr-FR');
}

function textOnly(element) {
  if (!element) return '';
  return Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function hashPilot(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toneForPilot(name) {
  const key = normalizePilotName(name);
  if (!key) return 0;
  if (toneByPilot.has(key)) return toneByPilot.get(key);

  const start = hashPilot(key) % paletteSize;
  let tone = start;
  for (let offset = 0; offset < paletteSize; offset++) {
    const candidate = (start + offset) % paletteSize;
    const occupant = pilotByTone.get(candidate);
    if (!occupant || occupant === key) {
      tone = candidate;
      break;
    }
  }
  toneByPilot.set(key, tone);
  if (!pilotByTone.has(tone)) pilotByTone.set(tone, key);
  return tone;
}

function registrationFormPilotName(form) {
  const banner = form.querySelector('.registration-context-banner strong');
  if (banner?.textContent.trim()) return banner.textContent.trim();

  const nameInput = form.querySelector('input[name="pilotName"]');
  if (nameInput?.value.trim()) return nameInput.value.trim();

  const participant = form.querySelector('select[name="participant"]');
  const selected = participant?.selectedOptions?.[0];
  if (selected?.value && selected.textContent.trim()) return selected.textContent.trim();
  return '';
}

function pilotNameForTimeline(timeline) {
  const row = timeline.closest('.pilot-row');
  if (row) {
    const name = textOnly(row.querySelector('.pilot-name'));
    if (name) return name;
  }

  const candidate = timeline.closest('.crew-candidate-action-card, .ux-crew-candidate');
  if (candidate) {
    const name = candidate.querySelector('strong')?.textContent.trim();
    if (name) return name;
  }

  const namedItem = timeline.closest('.crew-preference-item, .unassigned-pilots li, .assignment-wishes');
  if (namedItem) {
    const name = namedItem.querySelector('strong')?.textContent.trim();
    if (name) return name;
  }

  const form = timeline.closest('.registration-form');
  if (form) return registrationFormPilotName(form);
  return '';
}

function applyPilotTone(timeline) {
  if (!(timeline instanceof HTMLElement) || timeline.classList.contains('is-coverage')) return;
  const name = pilotNameForTimeline(timeline);
  const tone = toneForPilot(name || 'pilote');
  for (const className of [...timeline.classList]) {
    if (/^pilot-timeline-tone-\d+$/.test(className)) timeline.classList.remove(className);
  }
  timeline.classList.add(`pilot-timeline-tone-${tone}`);
  if (name) timeline.dataset.pilotTimelineName = name;
}

function decorateTimelines(root = app) {
  if (!root) return;
  if (root instanceof HTMLElement && root.matches('.presence-timeline')) applyPilotTone(root);
  root.querySelectorAll?.('.presence-timeline:not(.is-coverage)').forEach(applyPilotTone);
}

function recolorRegistrationForm(target) {
  const form = target.closest?.('.registration-form');
  if (!form) return;
  form.querySelectorAll('.presence-timeline:not(.is-coverage)').forEach(applyPilotTone);
}

document.addEventListener('input', event => {
  if (event.target.matches?.('input[name="pilotName"]')) recolorRegistrationForm(event.target);
});

document.addEventListener('change', event => {
  if (event.target.matches?.('select[name="participant"]')) recolorRegistrationForm(event.target);
});

if (app) {
  decorateTimelines();
  timelineObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) decorateTimelines(node);
      }
    }
  });
  timelineObserver.observe(app, {childList:true, subtree:true});
}
