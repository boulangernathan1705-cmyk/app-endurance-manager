// Curated pairs: readable accents on each surface, never used for availability statuses.
export const PALETTES = [
  {id:'endurance', name:'Vert pastel', fill:'#c4d8c8', ink:'#27343a', dark:'#c4d8c8', light:'#386047', soft:true},
  {id:'ferrari', name:'Ferrari', fill:'#d92a27', ink:'#ffffff', dark:'#ff8583', light:'#b5201d'},
  {id:'redbull', name:'Red Bull', fill:'#162b60', ink:'#ffffff', dark:'#93acfa', light:'#203d88'},
  {id:'mclaren', name:'McLaren', fill:'#ff8700', ink:'#1c2027', dark:'#ff9e33', light:'#9c4c00'},
  {id:'porsche', name:'Porsche', fill:'#b49049', ink:'#101820', dark:'#dab56a', light:'#7a5e21'},
  {id:'bmw', name:'BMW', fill:'#1675d1', ink:'#ffffff', dark:'#74b6ff', light:'#155db0'},
  {id:'toyota', name:'Toyota', fill:'#d1082a', ink:'#ffffff', dark:'#ff879e', light:'#b30926'},
  {id:'astonmartin', name:'Aston Martin', fill:'#006b52', ink:'#ffffff', dark:'#6fd2b4', light:'#006b52'},
  {id:'lmu', name:'Le Mans Ultimate', fill:'#ef6c22', ink:'#17202c', dark:'#ffac70', light:'#a94b13'},
  {id:'assettocorsa', name:'Assetto Corsa', fill:'#cf233c', ink:'#ffffff', dark:'#ff8596', light:'#b51c35'},
  {id:'iracing', name:'iRacing', fill:'#1e4cb1', ink:'#ffffff', dark:'#8faaff', light:'#1e4cb1'},
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
