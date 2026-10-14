const app = document.getElementById('app');

// Availability has one shared colour. The current pilot is highlighted by the card's border.
// Coverage retains its separate colours, which indicate the number of available pilots.
function decorateTimelines(root = app) {
  if (!root) return;
  const timelines = [...root.querySelectorAll('.presence-timeline:not(.is-coverage)')];
  if (root.matches?.('.presence-timeline:not(.is-coverage)')) timelines.unshift(root);
  for (const timeline of timelines) {
    for (const name of [...timeline.classList]) if (/^pilot-timeline-tone-\d+$/.test(name)) timeline.classList.remove(name);
    timeline.classList.add('pilot-timeline-tone-0');
  }
}

document.addEventListener('endurance:render', () => decorateTimelines());
if (app) queueMicrotask(() => decorateTimelines());
