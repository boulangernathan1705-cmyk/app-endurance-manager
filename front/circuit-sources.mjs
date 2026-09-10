const common = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';

const maps = new Map(Object.entries({
  bahrain: {file:'Circuit Bahrain.svg', scale:1.06, x:0, y:0},
  barcelona: {file:'Circuit Catalunya.svg', scale:1.08, x:0, y:0},
  cota: {file:'Austin Formula One circuit (2).svg', scale:1.08, x:0, y:0},
  daytona: {file:'Daytona International Speedway - Road Course.svg', scale:1.04, x:0, y:0},
  fuji: {file:'Circuit Fuji.svg', scale:1.08, x:0, y:0},
  imola: {file:'Imola 2009.svg', scale:1.05, x:0, y:0},
  interlagos: {file:'Circuit Interlagos.svg', scale:1.08, x:0, y:0},
  'laguna-seca': {file:'Laguna seca layout.svg', scale:1.08, x:0, y:0},
  'le-mans': {file:'Circuit de la Sarthe.svg', scale:1.12, x:0, y:0},
  lusail: {file:'Lusail International Circuit 2023.svg', scale:1.06, x:0, y:0},
  monza: {file:'Circuit Monza.svg', scale:1.08, x:0, y:0},
  'paul-ricard': {file:'Paul Ricard.svg', scale:1.08, x:0, y:0},
  portimao: {file:'Autódromo de Algarve.svg', scale:1.06, x:0, y:0},
  sebring: {file:'Sebring International Raceway.svg', scale:1.1, x:0, y:0},
  silverstone: {file:'Circuit Silverstone.svg', scale:1.08, x:0, y:0},
  spa: {file:'Spa-Francorchamps of Belgium.svg', scale:1.08, x:0, y:0},
  'iracing-adelaide': {file:'Adelaide Street Circuit - short.svg', scale:1.08, x:0, y:0},
  'iracing-mexico': {file:'Autódromo Hermanos Rodríguez 2015.svg', scale:1.08, x:0, y:0},
  'iracing-mugello': {file:'Mugello Racing Circuit track map.svg', scale:1.12, x:0, y:0},
  'iracing-magny-cours': {file:'Circuit de Nevers Magny-Cours.svg', scale:1.1, x:0, y:0},
  'iracing-misano': {file:'Misano World Circuit.svg', scale:1.1, x:0, y:0},
  'iracing-hockenheim': {file:'Circuit Hockenheimring.svg', scale:1.08, x:0, y:0},
  'iracing-indianapolis': {file:'Indianapolis Motor Speedway - road course.svg', scale:1.08, x:0, y:0},
  'iracing-road-atlanta': {file:'Road Atlanta track map.svg', scale:1.34, x:0, y:0},
  'iracing-bathurst': {file:'Mount Panorama street racing circuit in Australia.svg', scale:1.14, x:0, y:0},
  'iracing-nurburgring-gp': {file:'Nürburgring - Grand-Prix-Strecke.svg', scale:1.08, x:0, y:0},
  'iracing-nordschleife': {file:'Circuit Nürburgring-2002-24h.svg', scale:1.18, x:0, y:0},
  'iracing-red-bull-ring': {file:'Circuit Red Bull Ring.svg', scale:1.1, x:0, y:0},
  'iracing-road-america': {file:'Road America.svg', scale:1.14, x:0, y:0},
  'iracing-sonoma': {file:'Sonoma Raceway 2024.svg', scale:1.12, x:0, y:0},
  'iracing-suzuka': {file:'F1 circuits 2014-2018 - Suzuka Circuit (version 2).svg', scale:1.08, x:0, y:0},
  'iracing-thruxton': {file:'Thuxton Motor Racing Circuit map.svg', scale:1.14, x:0, y:0},
  'iracing-vir': {file:'Virginia International Raceway - Full Course.svg', scale:1.16, x:0, y:0},
  'iracing-watkins-glen': {file:'Watkins Glen International Track Map.svg', scale:1.12, x:0, y:0},
  'iracing-zandvoort': {file:'Zandvoort.svg', scale:1.08, x:0, y:0}
}));

const aliases = new Map([
  ['iracing-barcelona', 'barcelona'], ['iracing-cota', 'cota'], ['iracing-daytona', 'daytona'],
  ['iracing-fuji', 'fuji'], ['iracing-imola', 'imola'], ['iracing-interlagos', 'interlagos'],
  ['iracing-laguna-seca', 'laguna-seca'], ['iracing-le-mans', 'le-mans'], ['iracing-monza', 'monza'],
  ['iracing-portimao', 'portimao'], ['iracing-sebring', 'sebring'], ['iracing-silverstone', 'silverstone'],
  ['iracing-spa', 'spa']
]);

function configFor(id) {
  const key = aliases.get(id) || id;
  const config = maps.get(key);
  return config ? {...config, key} : null;
}

function sourceFor(file) {
  return file ? common + encodeURIComponent(file).replace(/%2F/g, '/') : '';
}

function apply(root = document) {
  root.querySelectorAll?.('.circuit-visual img[data-circuit]').forEach(image => {
    const config = configFor(image.dataset.circuit);
    if (!config) return;

    const src = sourceFor(config.file);
    image.dataset.circuitSource = 'commons';
    image.dataset.circuitMap = config.key;
    image.style.setProperty('--circuit-scale', String(config.scale || 1));
    image.style.setProperty('--circuit-x', `${config.x || 0}%`);
    image.style.setProperty('--circuit-y', `${config.y || 0}%`);

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
  observer.observe(app, {childList: true, subtree: true});
}
