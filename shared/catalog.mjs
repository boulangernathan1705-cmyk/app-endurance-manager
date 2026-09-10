export const GAME_IDS = ['lmu','iracing'];

const SHARED_EVENT_TYPES = {
  special:{label:'Special event',css:'special'},
  lmu:{label:'Championnat LMU',css:'lmu'},
  private:{label:'Championnat privé',css:'private'}
};

const LMU_CIRCUITS = [
  {id:'bahrain',name:'Bahrain International Circuit',file:'bahrain.png'},
  {id:'barcelona',name:'Circuit de Barcelona-Catalunya',file:'barcelone.png'},
  {id:'cota',name:'Circuit of the Americas',file:'cota.png'},
  {id:'daytona',name:'Daytona International Speedway',file:'daytona.png'},
  {id:'fuji',name:'Fuji Speedway',file:'fuji.png'},
  {id:'imola',name:'Autodromo Enzo e Dino Ferrari (Imola)',file:'imola.png'},
  {id:'interlagos',name:'Interlagos',file:'interlagos.png'},
  {id:'laguna-seca',name:'WeatherTech Raceway Laguna Seca',file:'laguna_seca.png'},
  {id:'le-mans',name:'Circuit de la Sarthe (Le Mans)',file:'le_mans.png'},
  {id:'lusail',name:'Lusail International Circuit',file:'lusail_international.png'},
  {id:'monza',name:'Autodromo Nazionale Monza',file:'monza.png'},
  {id:'paul-ricard',name:'Circuit Paul Ricard',file:'paul_ricard_elms.png'},
  {id:'portimao',name:'Algarve International Circuit (Portimão)',file:'algarve.png'},
  {id:'sebring',name:'Sebring International Raceway',file:'sebring.png'},
  {id:'silverstone',name:'Silverstone Circuit',file:'silverstone.png'},
  {id:'spa',name:'Circuit de Spa-Francorchamps',file:'spa_francorchamps.png'}
];

const IRACING_CIRCUITS = [
  {id:'iracing-adelaide',name:'Adelaide Street Circuit',file:'track-placeholder.svg'},
  {id:'iracing-portimao',name:'Algarve International Circuit (Portimão)',file:'algarve.png'},
  {id:'iracing-mexico',name:'Autódromo Hermanos Rodríguez',file:'track-placeholder.svg'},
  {id:'iracing-interlagos',name:'Autódromo José Carlos Pace (Interlagos)',file:'interlagos.png'},
  {id:'iracing-imola',name:'Autodromo Internazionale Enzo e Dino Ferrari',file:'imola.png'},
  {id:'iracing-monza',name:'Autodromo Nazionale Monza',file:'monza.png'},
  {id:'iracing-mugello',name:'Autodromo Internazionale del Mugello',file:'track-placeholder.svg'},
  {id:'iracing-barcelona',name:'Circuit de Barcelona-Catalunya',file:'barcelone.png'},
  {id:'iracing-magny-cours',name:'Circuit de Nevers Magny-Cours',file:'track-placeholder.svg'},
  {id:'iracing-misano',name:'Misano World Circuit Marco Simoncelli',file:'track-placeholder.svg'},
  {id:'iracing-spa',name:'Circuit de Spa-Francorchamps',file:'spa_francorchamps.png'},
  {id:'iracing-le-mans',name:'Circuit des 24 Heures du Mans',file:'le_mans.png'},
  {id:'iracing-cota',name:'Circuit of the Americas',file:'cota.png'},
  {id:'iracing-daytona',name:'Daytona International Speedway',file:'daytona.png'},
  {id:'iracing-fuji',name:'Fuji International Speedway',file:'fuji.png'},
  {id:'iracing-hockenheim',name:'HockenheimRing',file:'track-placeholder.svg'},
  {id:'iracing-indianapolis',name:'Indianapolis Motor Speedway',file:'track-placeholder.svg'},
  {id:'iracing-road-atlanta',name:'Michelin Raceway Road Atlanta',file:'track-placeholder.svg'},
  {id:'iracing-bathurst',name:'Mount Panorama Circuit',file:'track-placeholder.svg'},
  {id:'iracing-nurburgring-gp',name:'Nürburgring Grand-Prix-Strecke',file:'track-placeholder.svg'},
  {id:'iracing-nordschleife',name:'Nürburgring Combined / Nordschleife',file:'track-placeholder.svg'},
  {id:'iracing-red-bull-ring',name:'Red Bull Ring',file:'track-placeholder.svg'},
  {id:'iracing-road-america',name:'Road America',file:'track-placeholder.svg'},
  {id:'iracing-sebring',name:'Sebring International Raceway',file:'sebring.png'},
  {id:'iracing-silverstone',name:'Silverstone Circuit',file:'silverstone.png'},
  {id:'iracing-sonoma',name:'Sonoma Raceway',file:'track-placeholder.svg'},
  {id:'iracing-suzuka',name:'Suzuka International Racing Course',file:'track-placeholder.svg'},
  {id:'iracing-thruxton',name:'Thruxton Circuit',file:'track-placeholder.svg'},
  {id:'iracing-vir',name:'Virginia International Raceway',file:'track-placeholder.svg'},
  {id:'iracing-watkins-glen',name:'Watkins Glen International',file:'track-placeholder.svg'},
  {id:'iracing-laguna-seca',name:'WeatherTech Raceway Laguna Seca',file:'laguna_seca.png'},
  {id:'iracing-zandvoort',name:'Circuit Zandvoort',file:'track-placeholder.svg'},
  {id:'iracing-tbd',name:'Circuit à préciser',file:'track-placeholder.svg'}
];

const LMU_CATEGORIES = {
  Hypercar:{image:'HC.png',css:'hyper'},
  'LMP2 ELMS':{image:'LMP2.png',css:'lmp2'},
  'LMP2 WEC':{image:'LMP2.png',css:'lmp2'},
  LMP3:{image:'P3.webp',css:'lmp3'},
  GT3:{image:'GT3.webp',css:'gt3'},
  GTE:{image:'GTE.webp',css:'gte'}
};

const IRACING_BADGE = 'iracing-category.svg';
const IRACING_CATEGORIES = {
  GTP:{image:IRACING_BADGE,css:'hyper'},
  HYP:{image:IRACING_BADGE,css:'hyper'},
  'LMP2 P217':{image:IRACING_BADGE,css:'lmp2'},
  LMP3:{image:IRACING_BADGE,css:'lmp3'},
  GT3:{image:IRACING_BADGE,css:'gt3'},
  'Porsche Cup':{image:IRACING_BADGE,css:'gt3'},
  GT4:{image:IRACING_BADGE,css:'gt3'},
  TCR:{image:IRACING_BADGE,css:'gt3'},
  M2:{image:IRACING_BADGE,css:'gt3'},
  'Historic LMP2':{image:IRACING_BADGE,css:'lmp2'},
  GT1:{image:IRACING_BADGE,css:'gt3'},
  GT2:{image:IRACING_BADGE,css:'gt3'},
  'GTP Classic':{image:IRACING_BADGE,css:'hyper'},
  'GTO Classic':{image:IRACING_BADGE,css:'gt3'},
  Production:{image:IRACING_BADGE,css:'gt3'},
  Supercars:{image:IRACING_BADGE,css:'gt3'}
};

const LMU_CARS = {
  Hypercar: ['Alpine A424','Aston Martin Valkyrie AMR LMH','BMW M Hybrid V8','Cadillac V-Series.R','Ferrari 499P','Genesis GMR-001 LMDh','Glickenhaus SCG 007','Isotta Fraschini Tipo 6-C','Lamborghini SC63','Peugeot 9X8','Porsche 963','Toyota GR010 Hybrid','Vanwall Vandervell 680'],
  'LMP2 ELMS': ['Oreca 07 Gibson ELMS'],
  'LMP2 WEC': ['Oreca 07 Gibson'],
  LMP3: ['Ligier JS P325','Ginetta G61-LT-P3','Duqueine D09','Adess AD25'],
  GT3: ['Aston Martin Vantage AMR LMGT3','BMW M4 LMGT3','Chevrolet Corvette Z06 LMGT3.R','Ferrari 296 LMGT3','Ford Mustang LMGT3','Lamborghini Huracán LMGT3','Lexus RC F LMGT3','Mercedes-AMG LMGT3','McLaren 720S LMGT3','Porsche 911 GT3 R LMGT3'],
  GTE: ['Aston Martin Vantage GTE','Chevrolet Corvette C8.R','Ferrari 488 GTE','Porsche 911 RSR-19']
};

const IRACING_CARS = {
  GTP: ['Acura ARX-06 GTP','BMW M Hybrid V8 Evo','Cadillac V-Series.R GTP','Ferrari 499P','Porsche 963 GTP'],
  HYP: ['Aston Martin Valkyrie AMR-LMH'],
  'LMP2 P217': ['Dallara P217 LMP2'],
  LMP3: ['Ligier JS P320'],
  GT3: ['Acura NSX GT3 EVO 22','Aston Martin Vantage GT3 EVO','Audi R8 LMS EVO II GT3','BMW M4 GT3 EVO','Chevrolet Corvette Z06 GT3.R','Ferrari 296 GT3','Ford Mustang GT3','Lamborghini Huracán GT3 EVO','McLaren 720S GT3 EVO','Mercedes-AMG GT3 2020','Porsche 911 GT3 R (992)'],
  'Porsche Cup': ['Porsche 911 GT3 Cup (992)','Porsche 911 Cup (992.2)'],
  GT4: ['Aston Martin Vantage GT4','BMW M4 G82 GT4','Ford Mustang GT4','McLaren 570S GT4','Mercedes-AMG GT4','Porsche 718 Cayman GT4 Clubsport MR'],
  TCR: ['Audi RS 3 LMS TCR','Audi RS3 LMS Gen2 TCR','Honda Civic Type R TCR','Hyundai Elantra N TCR','Hyundai Veloster N TCR'],
  M2: ['BMW M2 CS Racing','BMW M2 Racing (G87)'],
  'Historic LMP2': ['HPD ARX-01c'],
  GT1: ['Aston Martin DBR9 GT1','Chevrolet Corvette C6.R GT1'],
  GT2: ['Ford GT GT2'],
  'GTP Classic': ['Nissan GTP ZX-T'],
  'GTO Classic': ['Audi 90 GTO'],
  Production: ['BMW M2 CS Racing','Global Mazda MX-5 Cup','Renault Clio R.S. V','Toyota GR86'],
  Supercars: ['Supercars Chevrolet Camaro Gen 3','Supercars Ford Mustang Gen 3']
};

export const GAME_CATALOGS = {
  lmu:{
    id:'lmu',
    name:'Le Mans Ultimate',
    shortName:'LMU',
    eventTypes:SHARED_EVENT_TYPES,
    circuits:LMU_CIRCUITS,
    categories:LMU_CATEGORIES,
    cars:LMU_CARS
  },
  iracing:{
    id:'iracing',
    name:'iRacing',
    shortName:'iRacing',
    eventTypes:{...SHARED_EVENT_TYPES,lmu:{label:'Championnat iRacing',css:'lmu'}},
    circuits:IRACING_CIRCUITS,
    categories:IRACING_CATEGORIES,
    cars:IRACING_CARS
  }
};

export function catalogForGame(game='lmu') {
  return GAME_CATALOGS[GAME_IDS.includes(game) ? game : 'lmu'];
}

export function gameForEvent(event) {
  return String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
}

export const LEGACY_CIRCUIT_IDS = ['nurburgring'];
export const EVENT_TYPE_IDS = Object.keys(SHARED_EVENT_TYPES);

const browserGame = GAME_IDS.includes(globalThis?.__ENDURANCE_GAME__) ? globalThis.__ENDURANCE_GAME__ : 'lmu';
const browserCatalog = catalogForGame(browserGame);
const serverCatalog = typeof document === 'undefined';
const unique = values => [...new Set(values)];
const mergeCars = () => {
  const output = {};
  for (const catalog of Object.values(GAME_CATALOGS)) {
    for (const [category,list] of Object.entries(catalog.cars)) output[category] = unique([...(output[category] || []),...list]);
  }
  return output;
};

export const EVENT_TYPES = browserCatalog.eventTypes;
export const CATEGORIES = serverCatalog ? unique(Object.values(GAME_CATALOGS).flatMap(catalog => Object.keys(catalog.categories))) : Object.keys(browserCatalog.categories);
export const CIRCUITS = serverCatalog ? Object.values(GAME_CATALOGS).flatMap(catalog => catalog.circuits) : browserCatalog.circuits;
export const CIRCUIT_IDS = unique([...CIRCUITS.map(circuit => circuit.id),...LEGACY_CIRCUIT_IDS]);
export const categories = serverCatalog ? Object.assign({},...Object.values(GAME_CATALOGS).map(catalog => catalog.categories)) : browserCatalog.categories;
export const CARS = serverCatalog ? mergeCars() : browserCatalog.cars;
