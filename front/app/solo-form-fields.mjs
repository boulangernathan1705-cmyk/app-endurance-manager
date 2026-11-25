import {state,esc} from './core.mjs';
import {streamUrl} from '../../shared/stream.mjs';

// The community's event types; an event keeps its type even once removed from the list.
export function typeField(chosen){
  if (chosen === 'Grindfest') chosen = 'Gridfest';
  const types=[...state.eventTypes];if(chosen&&!types.includes(chosen))types.push(chosen);
  if(!types.length)return '';
  return `<fieldset class="sim-options"><legend class="form-label">Type d’événement</legend><div class="sim-option-row">${types.map(type=>`<label class="sim-option event-type-option"><input type="radio" name="eventType" value="${esc(type)}" ${type===chosen?'checked':''} required><span>${esc(type)}</span></label>`).join('')}</div></fieldset>`;
}

// An hour and minutes picked as on the start (24 h on every browser), kept in a hidden field « HH:MM ».
const FIVE=Array.from({length:12},(_,index)=>String(index*5).padStart(2,'0'));
export const timeInput=(name,label,value)=>{
  const [hour,minute]=String(value||'21:00').split(':'),minutes=FIVE.includes(minute)?FIVE:[...FIVE,minute].sort();
  return `<div class="form-label time-picker" data-clock><span>${label}</span><span class="time-picker-row" role="group" aria-label="${esc(label)}"><select data-clock-hour aria-label="Heure">${Array.from({length:24},(_,n)=>String(n).padStart(2,'0')).map(item=>`<option value="${item}" ${item===hour?'selected':''}>${item} h</option>`).join('')}</select><span aria-hidden="true">:</span><select data-clock-minute aria-label="Minutes">${minutes.map(item=>`<option value="${item}" ${item===minute?'selected':''}>${item}</option>`).join('')}</select></span><input type="hidden" name="${name}" value="${esc(value||'')}"></div>`;
};
const clockOf=input=>input.closest('[data-clock]');
// Writes « HH:MM » in a picker (its selects and its hidden field).
export function setClock(input,value){
  if(!value)return;const [hour,minute]=value.split(':'),box=clockOf(input),select=box.querySelector('[data-clock-minute]');
  if(![...select.options].some(option=>option.value===minute))select.insertAdjacentHTML('beforeend',`<option value="${minute}">${minute}</option>`);
  box.querySelector('[data-clock-hour]').value=hour;select.value=minute;input.value=value;
}
export const addMinutes=(time,minutes)=>{const [h,m]=String(time||'21:00').split(':').map(Number),at=((h*60+m+minutes)%1440+1440)%1440;return `${String(Math.floor(at/60)).padStart(2,'0')}:${String(at%60).padStart(2,'0')}`;};
// A picker's hidden field and selects are on or off together; its error shows on the hour.
export function clockState(input,on,error=''){
  const box=clockOf(input);box.hidden=!on;input.disabled=!on;box.querySelectorAll('select').forEach(select=>{select.disabled=!on;});
  box.querySelector('[data-clock-hour]').setCustomValidity(on?error:'');
  if(on&&!input.value)input.value=`${box.querySelector('[data-clock-hour]').value}:${box.querySelector('[data-clock-minute]').value}`;
}
// EVENT TDZ (Nathan 2026-11-02): « Sans stream » or « En stream », always answered; streamed, its start and end are asked
// and the link is the community's (Discord setting). It decides the morning poster (@everyone or not) and the 📺 line.
export function streamChoice(details={},editing=false){
  if(!state.eventTdz)return '';
  const on=Boolean(details.streamTime),chosen=editing?(on?'yes':'no'):'',url=streamUrl(state.communityStreamUrl);
  const option=(value,label)=>`<label class="sim-option stream-choice-option"><input type="radio" name="eventStreamed" value="${value}" ${chosen===value?'checked':''} required><span>${label}</span></label>`;
  return `<fieldset class="sim-options stream-choice"><legend class="form-label">Stream</legend><div class="sim-option-row">${option('no','Sans stream')}${option('yes','📺 En stream')}</div></fieldset>
    <div data-stream-times ${on?'':'hidden'}><div class="solo-form-row">${timeInput('eventStreamTime','Début du stream',details.streamTime)}${timeInput('eventStreamEnd','Fin du stream',details.streamEnd)}</div>
    <p class="creation-help stream-choice-link">${url?`Lien : <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https:\/\/(www\.)?/,''))}</a>`:'Aucun lien de stream réglé : ajoute-le dans Administration › Discord.'}</p></div>`;
}
// « 22h → 1h » is the next morning (until 6h); otherwise the end must follow the start.
export const endBefore=(start,end)=>Boolean(start&&end)&&(end===start||(end<start&&end>'06:00'));
export const minutesBetween=(start,end)=>{const [a,b]=[start,end].map(time=>{const [h,m]=String(time).split(':').map(Number);return h*60+m;});return ((b-a)+1440)%1440;};
// Shows the stream times when « En stream » is chosen; hidden fields are disabled so they are neither checked nor sent.
export function syncStream(form){
  const box=form.querySelector('[data-stream-times]');if(!box)return;
  const on=form.querySelector('[name="eventStreamed"]:checked')?.value==='yes',start=form.elements.eventStreamTime,end=form.elements.eventStreamEnd;
  // Just chosen: the stream as the event (a training's window, or the start and two hours), to change if needed.
  if(on&&box.hidden&&!start.value){
    const begin=form.querySelector('.departure-field [name="time"]')?.value||'21:00',training=form.elements.eventEnd&&!form.elements.eventEnd.disabled;
    setClock(start,begin);setClock(end,training?form.elements.eventEnd.value:addMinutes(begin,120));
  }
  box.hidden=!on;clockState(start,on);clockState(end,on,endBefore(start.value,end.value)?'La fin du stream doit être après son début.':'');
}
