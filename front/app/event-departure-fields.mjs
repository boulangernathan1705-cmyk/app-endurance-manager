import {button,esc} from './core.mjs';

// A start = a date (native calendar, opened on click) and a time chosen from hour / minute lists
// (5-minute steps, 00 by default). The hidden "time" input keeps the HH:MM value submitEvent reads.
export const MINUTES=Array.from({length:12},(_,index)=>String(index*5).padStart(2,'0'));
export function parisToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
// Common start whose time is not known yet: only its day. Everyone enters there; the real starts are
// added later by editing the race, and each crew then picks its start.
function commonStartField(departure){
  const id=crypto.randomUUID();
  return `<div class="departure-field is-tbd" data-id="${esc(departure.id||'')}" data-tbd="true"><div><label class="form-label" for="date-${id}">Jour de la course</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" ${departure.id?'':`min="${parisToday()}"`} required data-date-picker></div><div class="departure-tbd-note"><span class="form-label">Heure</span><strong>À définir</strong><small>Les pilotes s’inscrivent et forment leurs équipages sur ce départ. Ajoute les vrais horaires plus tard en modifiant la course.</small></div><input type="hidden" name="time" value="${esc(departure.clock||(departure.time&&/^\d{2}:\d{2}$/.test(departure.time)?departure.time:'20:00'))}">${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
export function departureFields(departure={}){
  if(departure.tbd)return commonStartField(departure);
  const id=crypto.randomUUID();
  const [hour='00',minute='00']=String(departure.clock||departure.time||'00:00').split(':');
  const minutes=MINUTES.includes(minute)?MINUTES:[...MINUTES,minute].sort();
  const hours=Array.from({length:24},(_,value)=>String(value).padStart(2,'0'));
  return `<div class="departure-field" data-id="${esc(departure.id||'')}"><div><label class="form-label" for="date-${id}">Date</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" ${departure.id?'':`min="${parisToday()}"`} required data-date-picker></div><div class="time-picker"><span class="form-label" id="time-label-${id}">Heure (Paris)</span><span class="time-picker-row" role="group" aria-labelledby="time-label-${id}"><select name="timeHour" aria-label="Heure">${hours.map(value=>`<option value="${value}" ${value===hour?'selected':''}>${value} h</option>`).join('')}</select><span aria-hidden="true">:</span><select name="timeMinute" aria-label="Minutes">${minutes.map(value=>`<option value="${value}" ${value===minute?'selected':''}>${value}</option>`).join('')}</select></span><input type="hidden" name="time" value="${esc(`${hour}:${minute}`)}"></div>${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
