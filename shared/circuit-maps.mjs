const COMMONS = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';

// Registre unique des cartes utilisées par Endurance Manager.
// Toute modification de source ou de cadrage se fait ici, circuit par circuit.
// Les valeurs mobile* permettent d'ajuster le rendu téléphone indépendamment du desktop.
const BASE = {scale:0.9,x:0,y:0,mobileScale:1.08,mobileX:0,mobileY:0};

export const CIRCUIT_MAPS = Object.freeze({
  bahrain:{file:'Circuit Bahrain.svg',mobileScale:1.12},
  barcelona:{file:'Circuit Catalunya.svg',mobileScale:1.12},
  cota:{file:'Austin Formula One circuit (2).svg',scale:0.82,mobileScale:1.18,mobileX:1,mobileY:1},
  daytona:{file:'Daytona International Speedway - Road Course.svg',scale:0.86,mobileScale:1.12},
  fuji:{file:'Circuit Fuji.svg',mobileScale:1.12},
  imola:{file:'Imola 2009.svg',scale:0.86,mobileScale:1.12},
  interlagos:{file:'Circuit Interlagos.svg',mobileScale:1.12},
  'laguna-seca':{file:'Laguna seca layout.svg',scale:0.88,mobileScale:1.12},
  'le-mans':{file:'Circuit de la Sarthe.svg',scale:0.74,mobileScale:1.22,mobileX:0,mobileY:1},
  lusail:{file:'Lusail International Circuit 2023.svg',scale:0.86,mobileScale:1.12},
  monza:{file:'Circuit Monza.svg',scale:0.82,mobileScale:1.2,mobileX:-1,mobileY:1},
  'paul-ricard':{file:'Paul Ricard.svg',scale:0.88,mobileScale:1.12},
  portimao:{file:'Autódromo de Algarve.svg',scale:0.86,mobileScale:1.12},
  sebring:{file:'Sebring International Raceway.svg',scale:0.84,mobileScale:1.14},
  silverstone:{file:'Circuit Silverstone.svg',scale:0.88,mobileScale:1.12},
  spa:{file:'Spa-Francorchamps of Belgium.svg',scale:0.88,mobileScale:1.12},
  'iracing-adelaide':{file:'Adelaide Street Circuit - short.svg',scale:0.86,mobileScale:1.12},
  'iracing-mexico':{file:'Autódromo Hermanos Rodríguez 2015.svg',scale:0.84,mobileScale:1.12},
  'iracing-mugello':{file:'Mugello Racing Circuit track map.svg',scale:0.82,mobileScale:1.16},
  'iracing-magny-cours':{file:'Circuit de Nevers Magny-Cours.svg',scale:0.86,mobileScale:1.12},
  'iracing-misano':{file:'Misano World Circuit.svg',scale:0.84,mobileScale:1.14},
  'iracing-hockenheim':{file:'Circuit Hockenheimring.svg',scale:0.86,mobileScale:1.12},
  'iracing-indianapolis':{file:'Indianapolis Motor Speedway - road course.svg',scale:0.84,mobileScale:1.12},
  'iracing-road-atlanta':{file:'Road Atlanta track map.svg',scale:0.76,mobileScale:1.24,mobileX:0,mobileY:0},
  'iracing-bathurst':{file:'Mount Panorama street racing circuit in Australia.svg',scale:0.8,mobileScale:1.16},
  'iracing-nurburgring-gp':{file:'Nürburgring - Grand-Prix-Strecke.svg',scale:0.86,mobileScale:1.12},
  'iracing-nordschleife':{file:'Circuit Nürburgring-2002-24h.svg',scale:0.8,mobileScale:1.16},
  'iracing-red-bull-ring':{file:'Circuit Red Bull Ring.svg',scale:0.86,mobileScale:1.12},
  'iracing-road-america':{file:'Road America.svg',scale:0.82,mobileScale:1.16},
  'iracing-sonoma':{file:'Sonoma Raceway 2024.svg',scale:0.82,mobileScale:1.16},
  'iracing-suzuka':{file:'F1 circuits 2014-2018 - Suzuka Circuit (version 2).svg',scale:0.84,mobileScale:1.14},
  'iracing-thruxton':{file:'Thuxton Motor Racing Circuit map.svg',scale:0.82,mobileScale:1.16},
  'iracing-vir':{file:'Virginia International Raceway - Full Course.svg',scale:0.8,mobileScale:1.18},
  'iracing-watkins-glen':{file:'Watkins Glen International Track Map.svg',scale:0.82,mobileScale:1.16},
  'iracing-zandvoort':{file:'Zandvoort.svg',scale:0.86,mobileScale:1.12}
});

export const CIRCUIT_MAP_ALIASES = Object.freeze({
  'iracing-barcelona':'barcelona',
  'iracing-cota':'cota',
  'iracing-daytona':'daytona',
  'iracing-fuji':'fuji',
  'iracing-imola':'imola',
  'iracing-interlagos':'interlagos',
  'iracing-laguna-seca':'laguna-seca',
  'iracing-le-mans':'le-mans',
  'iracing-monza':'monza',
  'iracing-portimao':'portimao',
  'iracing-sebring':'sebring',
  'iracing-silverstone':'silverstone',
  'iracing-spa':'spa'
});

export function circuitMapConfig(id) {
  const key = CIRCUIT_MAP_ALIASES[id] || id;
  const config = CIRCUIT_MAPS[key];
  if (!config) return null;
  return {...BASE,...config,key};
}

export function circuitMapSource(file) {
  return file ? COMMONS + encodeURIComponent(file).replace(/%2F/g,'/') : '';
}
