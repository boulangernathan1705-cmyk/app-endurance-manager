// Curated pairs: readable accents on each surface, never used for availability statuses.
export const PALETTES = [
  {id:'endurance', name:'Endurance Manager', pastel:'#c4deda', dark:'#c4deda', light:'#34635e'},
  {id:'ferrari', name:'Ferrari', pastel:'#e5c5c3', dark:'#e5c5c3', light:'#7a4341'},
  {id:'redbull', name:'Red Bull', pastel:'#cad0e1', dark:'#cad0e1', light:'#465372'},
  {id:'mclaren', name:'McLaren', pastel:'#ecd2bc', dark:'#ecd2bc', light:'#79533a'},
  {id:'porsche', name:'Porsche', pastel:'#e4d9be', dark:'#e4d9be', light:'#6c5f3e'},
  {id:'bmw', name:'BMW', pastel:'#c6d7e2', dark:'#c6d7e2', light:'#3d5c72'},
  {id:'toyota', name:'Toyota', pastel:'#e4cccd', dark:'#e4cccd', light:'#754e53'},
  {id:'astonmartin', name:'Aston Martin', pastel:'#c7d9cf', dark:'#c7d9cf', light:'#3a604d'},
  {id:'lmu', name:'Le Mans Ultimate', pastel:'#e5d3bd', dark:'#e5d3bd', light:'#715638'},
  {id:'assettocorsa', name:'Assetto Corsa', pastel:'#ddc4c9', dark:'#ddc4c9', light:'#724650'},
  {id:'iracing', name:'iRacing', pastel:'#c5d3e7', dark:'#c5d3e7', light:'#405a7b'},
];
export const DEFAULT_PALETTE = 'endurance';
// Existing community choices remain valid when moving from generic colours to racing themes.
const LEGACY = {emerald:'astonmartin', blue:'iracing', cyan:'endurance', violet:'redbull', indigo:'bmw', orange:'mclaren', red:'ferrari', rose:'toyota', gold:'porsche', slate:'lmu'};
export const paletteById = id => PALETTES.find(item => item.id === (LEGACY[id] || id));
export function paletteFor(appearance = {}) {
  return paletteById(appearance.palette) || PALETTES.find(item => [item.dark,item.light].includes(appearance.accent?.toLowerCase())) || paletteById(DEFAULT_PALETTE);
}
export function appearanceInput(input, current = {}) {
  const palette = paletteById(input.palette);
  if (!palette) throw new Error('Choisis une des couleurs proposées.');
  if (!['light','dark'].includes(input.defaultMode)) throw new Error('Choisis le mode clair ou sombre.');
  return {...current, palette:palette.id, accent:palette.dark, defaultMode:input.defaultMode};
}
