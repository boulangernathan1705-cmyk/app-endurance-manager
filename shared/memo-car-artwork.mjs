// Local LMU memo artwork only. Keep the catalogue labels distinct; never guess a model.
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const entries = [
  [
    "Alpine A424",
    "alpine-a424"
  ],
  [
    "Aston Martin Valkyrie AMR LMH",
    "aston-martin-valkyrie"
  ],
  [
    "BMW M Hybrid V8",
    "bmw-m-hybrid-v8"
  ],
  [
    "Cadillac V-Series.R",
    "cadillac-v-series-r"
  ],
  [
    "Ferrari 499P",
    "ferrari-499p"
  ],
  [
    "Genesis GMR-001 LMDh",
    "genesis-gmr-001"
  ],
  [
    "Glickenhaus SCG 007",
    "glickenhaus-scg-007"
  ],
  [
    "Isotta Fraschini Tipo 6-C",
    "isotta-fraschini-tipo-6-c"
  ],
  [
    "Lamborghini SC63",
    "lamborghini-sc63"
  ],
  [
    "Peugeot 9X8",
    "peugeot-9x8"
  ],
  [
    "Peugeot 9X8 Evo",
    "peugeot-9x8-evo"
  ],
  [
    "Porsche 963",
    "porsche-963"
  ],
  [
    "Toyota GR010 Hybrid",
    "toyota-gr010"
  ],
  [
    "Vanwall Vandervell 680",
    "vanwall-vandervell-680"
  ],
  [
    "Oreca 07 Gibson ELMS",
    "oreca-07"
  ],
  [
    "Oreca 07 Gibson",
    "oreca-07"
  ],
  [
    "Ligier JS P325",
    "ligier-js-p325"
  ],
  [
    "Ginetta G61-LT-P3",
    "ginetta-g61"
  ],
  [
    "Duqueine D09",
    "duqueine-d09"
  ],
  [
    "Adess AD25",
    "adess-ad25"
  ],
  [
    "Aston Martin Vantage AMR LMGT3",
    "aston-martin-vantage-gt3"
  ],
  [
    "BMW M4 LMGT3",
    "bmw-m4-gt3"
  ],
  [
    "Chevrolet Corvette Z06 LMGT3.R",
    "corvette-z06-gt3"
  ],
  [
    "Ferrari 296 LMGT3",
    "ferrari-296-gt3"
  ],
  [
    "Ford Mustang LMGT3",
    "ford-mustang-gt3"
  ],
  [
    "Lamborghini Huracán LMGT3",
    "lamborghini-huracan-gt3"
  ],
  [
    "Lexus RC F LMGT3",
    "lexus-rc-f-gt3"
  ],
  [
    "Mercedes-AMG LMGT3",
    "mercedes-amg-gt3"
  ],
  [
    "McLaren 720S LMGT3",
    "mclaren-720s-gt3"
  ],
  [
    "Porsche 911 GT3 R LMGT3",
    "porsche-911-gt3-r"
  ],
  [
    "Aston Martin Vantage GTE",
    "aston-martin-vantage-gte"
  ],
  [
    "Chevrolet Corvette C8.R",
    "corvette-c8-r"
  ],
  [
    "Ferrari 488 GTE",
    "ferrari-488-gte"
  ],
  [
    "Porsche 911 RSR-19",
    "porsche-911-rsr-19"
  ]
];
const ids = new Map(entries.map(([name,id])=>[normalize(name),id]));
export const memoCarArtworkId = name => ids.get(normalize(name)) || '';
// Enable an ID only in the same commit as its licensed WebP and credit record.
export const AVAILABLE_MEMO_CAR_ARTWORK = Object.freeze([]);
const available = new Set(AVAILABLE_MEMO_CAR_ARTWORK);
export function memoCarArtwork(name) {
  const id = memoCarArtworkId(name);
  return available.has(id) ? '/images/memo-cars/'+id+'.webp' : '';
}
