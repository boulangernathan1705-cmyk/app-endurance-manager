const common = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';

const sources = new Map(Object.entries({
  bahrain: 'Circuit Bahrain.svg',
  barcelona: 'Circuit Catalunya.svg',
  cota: 'F1 circuits 2014-2018 - Circuit of the Americas (version 2).svg',
  daytona: 'Daytona International Speedway - Road Course.svg',
  fuji: 'Circuit Fuji.svg',
  imola: 'Imola 2009.svg',
  interlagos: 'Circuit Interlagos.svg',
  'laguna-seca': 'Laguna seca layout.svg',
  'le-mans': 'Circuit de la Sarthe track map.svg',
  lusail: 'Lusail International Circuit 2023.svg',
  monza: 'Circuit Monza.svg',
  'paul-ricard': 'Paul Ricard.svg',
  portimao: 'Autódromo de Algarve.svg',
  sebring: 'Sebring International Raceway.svg',
  silverstone: 'Circuit Silverstone.svg',
  spa: 'Spa-Francorchamps of Belgium.svg',
  'iracing-adelaide': 'Adelaide Street Circuit - short.svg',
  'iracing-mexico': 'Autódromo Hermanos Rodríguez 2015.svg',
  'iracing-mugello': 'Mugello Racing Circuit track map.svg',
  'iracing-magny-cours': 'Circuit de Nevers Magny-Cours.svg',
  'iracing-misano': 'Misano World Circuit.svg',
  'iracing-hockenheim': 'Circuit Hockenheimring.svg',
  'iracing-indianapolis': 'Indianapolis Motor Speedway - road course.svg',
  'iracing-road-atlanta': 'Road Atlanta track map.svg',
  'iracing-bathurst': 'Mount Panorama street racing circuit in Australia.svg',
  'iracing-nurburgring-gp': 'Nürburgring - Grand-Prix-Strecke.svg',
  'iracing-nordschleife': 'Circuit Nürburgring-2002-24h.svg',
  'iracing-red-bull-ring': 'Circuit Red Bull Ring.svg',
  'iracing-road-america': 'Road America.svg',
  'iracing-sonoma': 'Sonoma Raceway 2024.svg',
  'iracing-suzuka': 'F1 circuits 2014-2018 - Suzuka Circuit (version 2).svg',
  'iracing-thruxton': 'Thuxton Motor Racing Circuit map.svg',
  'iracing-vir': 'Virginia International Raceway - Full Course.svg',
  'iracing-watkins-glen': 'Watkins Glen International Track Map.svg',
  'iracing-zandvoort': 'Zandvoort.svg'
}));

const aliases = new Map([
  ['iracing-barcelona', 'barcelona'], ['iracing-cota', 'cota'], ['iracing-daytona', 'daytona'],
  ['iracing-fuji', 'fuji'], ['iracing-imola', 'imola'], ['iracing-interlagos', 'interlagos'],
  ['iracing-laguna-seca', 'laguna-seca'], ['iracing-le-mans', 'le-mans'], ['iracing-monza', 'monza'],
  ['iracing-portimao', 'portimao'], ['iracing-sebring', 'sebring'], ['iracing-silverstone', 'silverstone'],
  ['iracing-spa', 'spa']
]);

function sourceFor(id) {
  const key = aliases.get(id) || id;
  const file = sources.get(key);
  return file ? common + encodeURIComponent(file).replace(/%2F/g, '/') : '';
}

function apply(root = document) {
  root.querySelectorAll?.('.circuit-visual img[data-circuit]').forEach(image => {
    const src = sourceFor(image.dataset.circuit);
    if (src && image.src !== src) {
      image.dataset.circuitSource = 'commons';
      image.src = src;
    }
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
  observer.observe(app, {childList: true, subtree: true});
}
