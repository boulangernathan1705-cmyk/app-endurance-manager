// Crew preparation (server/crew-preparation.mjs, front/app/preparation.mjs): what the browser and the server share.
export const PREPARATION_CHECKS=['setup','stint','pit','conditions'];

// « 1:54.300 », « 1:54,3 » or « 114.3 » → milliseconds; '' → null; anything else → NaN.
export function parseLap(value){
  const text=String(value||'').trim().replace(',','.');
  if(!text)return null;
  const match=text.match(/^(?:(\d{1,2}):)?(\d{1,4}(?:\.\d{1,3})?)$/);
  if(!match||(match[1]&&Number(match[2])>=60))return NaN;
  return Math.round((Number(match[1]||0)*60+Number(match[2]))*1000);
}
export function lapLabel(ms){
  if(!ms)return '';
  const minutes=Math.floor(ms/60000),seconds=(ms%60000)/1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6,'0')}`;
}

// The crew's pace: the average of the lap times typed, the laps it makes over the race and the fuel it needs.
export function crewEstimate(entries,durationMinutes){
  const laps=entries.map(entry=>entry.lapMs).filter(Boolean),fuels=entries.map(entry=>entry.fuel).filter(Boolean);
  if(!laps.length)return null;
  const lapMs=Math.round(laps.reduce((a,b)=>a+b,0)/laps.length);
  const raceLaps=Math.ceil(durationMinutes*60000/lapMs);
  const fuel=fuels.length?Math.round(fuels.reduce((a,b)=>a+b,0)/fuels.length*100)/100:null;
  return {lapMs,raceLaps,fuel,raceFuel:fuel?Math.ceil(fuel*raceLaps):null};
}
