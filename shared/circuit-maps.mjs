const COMMONS = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';

// Registre unique des cartes utilisées par Endurance Manager.
// Toute modification de source ou de cadrage se fait ici, circuit par circuit.
const BASE = {scale:0.9,x:0,y:0};

export const CIRCUIT_MAPS = Object.freeze({
  bahrain:{file:'Circuit Bahrain.svg'},
  barcelona:{file:'Circuit Catalunya.svg'},
  cota:{file:'Austin Formula One circuit (2).svg',scale:0.82},
  daytona:{file:'Daytona International Speedway - Road Course.svg',scale:0.86},
  fuji:{file:'Circuit Fuji.svg'},
  imola:{file:'Imola 2009.svg',scale:0.86},
  interlagos:{file:'Circuit Interlagos.svg'},
  'laguna-seca':{file:'Laguna seca layout.svg',scale:0.88},
  'le-mans':{file:'Circuit de la Sarthe.svg',scale:0.74},
  lusail:{file:'Lusail International Circuit 2023.svg',scale:0.86},
  monza:{file:'Circuit Monza.svg',scale:0.82},
  'paul-ricard':{file:'Paul Ricard.svg',scale:0.88},
  portimao:{file:'Autódromo de Algarve.svg',scale:0.86},
  sebring:{file:'Sebring International Raceway.svg',scale:0.84},
  silverstone:{file:'Circuit Silverstone.svg',scale:0.88},
  spa:{file:'Spa-Francorchamps of Belgium.svg',scale:0.88},
  'iracing-adelaide':{file:'Adelaide Street Circuit - short.svg',scale:0.86},
  'iracing-mexico':{file:'Autódromo Hermanos Rodríguez 2015.svg',scale:0.84},
  'iracing-mugello':{file:'Mugello Racing Circuit track map.svg',scale:0.82},
  'iracing-magny-cours':{file:'Circuit de Nevers Magny-Cours.svg',scale:0.86},
  'iracing-misano':{file:'Misano World Circuit.svg',scale:0.84},
  'iracing-hockenheim':{file:'Circuit Hockenheimring.svg',scale:0.86},
  'iracing-indianapolis':{file:'Indianapolis Motor Speedway - road course.svg',scale:0.84},
  'iracing-road-atlanta':{file:'Road Atlanta track map.svg',scale:0.76},
  'iracing-bathurst':{file:'Mount Panorama street racing circuit in Australia.svg',scale:0.8},
  'iracing-nurburgring-gp':{file:'Nürburgring - Grand-Prix-Strecke.svg',scale:0.86},
  'iracing-nordschleife':{file:'Circuit Nürburgring-2002-24h.svg',scale:0.8},
  'iracing-red-bull-ring':{file:'Circuit Red Bull Ring.svg',scale:0.86},
  'iracing-road-america':{file:'Road America.svg',scale:0.82},
  'iracing-sonoma':{file:'Sonoma Raceway 2024.svg',scale:0.82},
  'iracing-suzuka':{file:'F1 circuits 2014-2018 - Suzuka Circuit (version 2).svg',scale:0.84},
  'iracing-thruxton':{file:'Thuxton Motor Racing Circuit map.svg',scale:0.82},
  'iracing-vir':{file:'Virginia International Raceway - Full Course.svg',scale:0.8},
  'iracing-watkins-glen':{file:'Watkins Glen International Track Map.svg',scale:0.82},
  'iracing-zandvoort':{file:'Zandvoort.svg',scale:0.86}
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
