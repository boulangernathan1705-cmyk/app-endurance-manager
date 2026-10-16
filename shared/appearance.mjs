// Curated pairs: readable accents on each surface, never used for availability statuses.
export const PALETTES = [
  {id:'emerald', name:'Émeraude', dark:'#57d99a', light:'#147849'},
  {id:'blue', name:'Bleu', dark:'#79b8ff', light:'#205dbb'},
  {id:'cyan', name:'Turquoise', dark:'#52d3d8', light:'#08757b'},
  {id:'violet', name:'Violet', dark:'#c2a0ff', light:'#7442ba'},
  {id:'indigo', name:'Indigo', dark:'#a5afff', light:'#4d50bd'},
  {id:'orange', name:'Orange', dark:'#ffb36b', light:'#a44c09'},
  {id:'red', name:'Rouge', dark:'#ff929a', light:'#b52d40'},
  {id:'rose', name:'Rose', dark:'#f6a2cf', light:'#a52e72'},
  {id:'gold', name:'Or', dark:'#e9ca70', light:'#806008'},
  {id:'slate', name:'Ardoise', dark:'#b0c4d8', light:'#49647d'},
];
export const DEFAULT_PALETTE = 'cyan';
export const paletteById = id => PALETTES.find(item => item.id === id);
export function paletteFor(appearance = {}) {
  return paletteById(appearance.palette) || PALETTES.find(item => [item.dark,item.light].includes(appearance.accent?.toLowerCase())) || paletteById(DEFAULT_PALETTE);
}
export function appearanceInput(input, current = {}) {
  const palette = paletteById(input.palette);
  if (!palette) throw new Error('Choisis une des couleurs proposées.');
  if (!['light','dark'].includes(input.defaultMode)) throw new Error('Choisis le mode clair ou sombre.');
  return {...current, palette:palette.id, accent:palette.dark, defaultMode:input.defaultMode};
}
