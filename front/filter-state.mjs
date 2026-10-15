// Filter choices belong to a screen, community and account, never to the whole browser.
export function filterStorageKey(section,{game='all',communityId='',userId=''}={}){
  return ['em_filters_v3',section,game,communityId||'site',userId||'guest'].map(encodeURIComponent).join(':');
}
export const filterSelection=(value,allowed)=>Array.isArray(value)?[...new Set(value.filter(item=>typeof item==='string'&&allowed.includes(item)))]:[];
export const filterValue=(value,allowed,fallback='')=>allowed.includes(value)?value:fallback;
export function readFilterState(key,fallback={}){
  try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch{return fallback;}
}
export function writeFilterState(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function filterDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}
export function setFilterDate(filters,field,value){
  if(!['from','to'].includes(field))return;
  filters[field]=filterDate(value);
  if(filters.from&&filters.to&&filters.from>filters.to)filters[field==='from'?'to':'from']=filters[field];
}
