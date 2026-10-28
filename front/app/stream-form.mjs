// « Annoncer un stream » (shared/stream.mjs): one screen, a title, the day, the stream's start and, when it is a race,
// its sim and start (one of the two times at least), and the link to the stream (the last one used fills it).
import {formSheet,parisToday} from './event-form.mjs';
import {app,state,esc,api,notifyRender} from './core.mjs';
import {refreshAfterSave} from './refresh.mjs';
import {streamDetails,isStream} from '../../shared/stream.mjs';

export function renderStreamForm(event=null){
  state.editingEvent=event?structuredClone(event):null;
  const details=streamDetails(event),departure=event?.departures?.[0]||{};
  const lastUrl=details.streamUrl||state.events.filter(isStream).map(item=>streamDetails(item).streamUrl).find(Boolean)||'';
  const race=Boolean(details.raceSim),sim=details.raceSim||'lmu';
  const simChoice=(id,label)=>`<label class="sim-option sim-${id}"><input type="radio" name="raceSim" value="${id}" ${sim===id?'checked':''}><span>${label}</span></label>`;
  formSheet(event,event?'Modifier le stream':'Annoncer un stream','create-event').innerHTML=`<form class="form-panel event-creation stream-event-form" data-kind="stream-event"><section class="creation-card">
    <label class="form-label">Titre<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" placeholder="LES 6H DE …" required></label>
    <div class="solo-form-row"><label class="form-label">Jour<input name="streamDate" type="date" value="${esc(departure.date||'')}" ${event?'':`min="${parisToday()}"`} required></label><label class="form-label">Début du stream<input name="streamTime" type="time" value="${esc(details.streamTime)}"></label></div>
    <label class="sim-option stream-race-toggle"><input type="checkbox" name="streamRace" ${race?'checked':''}><span>🏁 C’est une course</span></label>
    <div class="stream-race" ${race?'':'hidden'}><div class="sim-option-row">${simChoice('lmu','LMU')}${simChoice('iracing','iRacing')}</div><label class="form-label">Départ de la course<input name="raceTime" type="time" value="${esc(details.raceTime)}"></label></div>
    <p class="creation-help">Heures de Paris : remplis au moins l’une des deux.</p>
    <label class="form-label">Lien du stream <small>(facultatif)</small><input name="streamUrl" maxlength="200" value="${esc(lastUrl)}" placeholder="Twitch, YouTube ou Kick"></label>
  </section><div class="creation-actions"><button type="submit" class="primary-button">${event?'ENREGISTRER':'ANNONCER LE STREAM'}</button></div></form>`;
  notifyRender();
}
function streamFormData(form){
  const value=name=>form.elements[name].value.trim(),race=form.elements.streamRace.checked;
  const details={streamTime:value('streamTime'),raceSim:race?form.querySelector('[name="raceSim"]:checked')?.value||'lmu':'',raceTime:race?value('raceTime'):'',streamUrl:value('streamUrl')};
  const time=[details.streamTime,details.raceTime].filter(Boolean).sort()[0]||'';
  return {name:value('eventName'),format:'solo',sim:'stream',access:'open',rounds:[{circuit:'',durationMinutes:60,categories:[]}],categories:[],details,
    departures:[{id:state.editingEvent?.departures?.[0]?.id,date:value('streamDate'),time,tbd:false}]};
}
// At least one time: the stream's, or the race's when it is one.
function checkTimes(form){
  const time=form.elements.streamTime,missing=!time.value&&!(form.elements.streamRace.checked&&form.elements.raceTime.value);
  time.setCustomValidity(missing?(form.elements.streamRace.checked?'Indique l’heure du stream ou celle du départ.':'Indique l’heure du stream.'):'');
  return !missing;
}
if(typeof document!=='undefined')document.addEventListener('change',event=>{
  const form=event.target.closest?.('form[data-kind="stream-event"]');if(!form)return;
  if(event.target.name==='streamRace')form.querySelector('.stream-race').hidden=!event.target.checked;
  checkTimes(form);
});
export async function submitStreamEvent(form){
  if(!checkTimes(form)){form.elements.streamTime.reportValidity();return;}
  const editing=state.editingEvent,result=await api(editing?`/api/races/${editing.id}`:'/api/races',editing?'PATCH':'POST',{...streamFormData(form),version:editing?.version});
  if(editing){state.currentEventId=editing.id;state.page='event';}else{state.page='home';state.currentEventId=null;}
  await refreshAfterSave(editing?'Stream modifié.':'Stream annoncé.',result.id);
}
