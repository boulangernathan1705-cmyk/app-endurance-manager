import {circuitMapConfig,circuitMapSource} from '../shared/circuit-maps.mjs';

function apply(root = document) {
  root.querySelectorAll?.('.circuit-visual img[data-circuit]').forEach(image => {
    const config = circuitMapConfig(image.dataset.circuit);
    if (!config) return;

    image.dataset.circuitSource = 'commons';
    image.dataset.circuitMap = config.key;
    image.style.setProperty('--circuit-scale', String(config.scale));
    image.style.setProperty('--circuit-x', `${config.x}%`);
    image.style.setProperty('--circuit-y', `${config.y}%`);

    const src = circuitMapSource(config.file);
    if (src && image.src !== src) image.src = src;
  });
}

apply();

const app = document.getElementById('app');
if (app) {
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.circuit-visual img[data-circuit]')) apply(node.parentElement || node);
        else if (node.querySelector?.('.circuit-visual img[data-circuit]')) apply(node);
      }
    }
  });
  observer.observe(app,{childList:true,subtree:true});
}
