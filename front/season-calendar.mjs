// Calendar arithmetic uses Paris civil dates, never the computer's local timezone.
import {parisDay,weekDays} from './week-days.mjs';
const DAY=86400000;
export const monthKey=timestamp=>new Date(parisDay(timestamp)*DAY).toISOString().slice(0,7);
export const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))&&Number(String(value).slice(0,4))>=2000&&Number(String(value).slice(0,4))<=2100;
export function shiftMonth(key,offset){
  if(!validMonth(key))throw Error('Mois invalide.');
  const [year,month]=key.split('-').map(Number);
  return new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);
}
export function seasonMonths(start,length=4){return Array.from({length:length===3?3:4},(_,index)=>shiftMonth(start,index));}
export function monthDays(events,key){
  const start=Date.parse(key+'-01T00:00:00Z')/DAY,end=Date.parse(shiftMonth(key,1)+'-01T00:00:00Z')/DAY;
  const offset=(new Date(start*DAY).getUTCDay()+6)%7,monday=start-offset,days=[];
  // The season includes completed events too. weekDays groups multiple starts of one event on the same day.
  const visible=events.map(event=>({...event,archived:false}));
  for(let day=monday;day<end;day+=7)days.push(...weekDays(visible,day));
  return days.map(day=>({...day,inMonth:day.day>=start&&day.day<end,items:day.day>=start&&day.day<end?day.items:[]}));
}
