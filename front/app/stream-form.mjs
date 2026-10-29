// A stream is a free-form community event. The native card also serves as its live preview.
import {formSheet,parisToday} from './event-form.mjs';
import {state,esc,api,notifyRender} from './core.mjs';
import {refreshAfterSave} from './refresh.mjs';
import {streamEventCard} from './home-view.mjs';
import {streamDetails,isStream,isStreamLogo,STREAM_LOGO_MAX_LENGTH,STREAM_LOGO_MAX_FILE_SIZE} from '../../shared/stream.mjs';

export function renderStreamForm(event=null){
  state.editingEvent=event?structuredClone(event):null;
  const details=streamDetails(event),departure=event?.departures?.[0]||{};
  const lastUrl=details.streamUrl||state.events.filter(isStream).map(item=>streamDetails(item).streamUrl).find(Boolean)||'';
  const body=formSheet(event,event?'Modifier le stream':'Annoncer un stream','create-event');
  body.innerHTML=`<form class="form-panel event-creation stream-event-form" data-kind="stream-event"><div class="stream-form-layout"><div class="stream-form-fields"><section class="creation-card">
    <div class="creation-card-heading"><span class="creation-step">01</span><h2>L’identité du stream</h2></div>
    <label class="form-label">Nom du streamer <small>(facultatif)</small><input name="streamerName" maxlength="60" value="${esc(details.streamerName || (event?'':state.user?.name || ''))}" placeholder="Ton pseudo"></label>
    <div class="stream-logo-upload"><div class="stream-logo-preview" data-stream-logo-preview></div><div><strong>Ton logo, ton identité</strong><p class="creation-help">Importe le visuel de ton choix. Il conserve ses proportions.</p><label class="secondary-button stream-logo-pick">Importer un logo<input type="file" name="streamLogoFile" accept="image/png,image/jpeg,image/webp" data-stream-logo-file></label><button type="button" class="link-button" data-stream-logo-remove>Retirer</button><small>PNG, JPG ou WebP · 5 Mo max</small></div></div>
    <input type="hidden" name="logoUrl" value="${esc(details.logoUrl)}"><p class="stream-logo-status" data-stream-logo-status role="status"></p>
    <label class="form-label">Lien du stream <small>(facultatif)</small><input name="streamUrl" maxlength="200" value="${esc(lastUrl)}" placeholder="Twitch, YouTube ou Kick"></label>
  </section><section class="creation-card">
    <div class="creation-card-heading"><span class="creation-step">02</span><h2>Le rendez-vous</h2></div>
    <label class="form-label">Titre<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" placeholder="Le programme de ta soirée" required></label>
    <label class="form-label">Simulateur, jeu ou activité <small>(facultatif)</small><input name="activity" maxlength="100" value="${esc(details.activity)}" placeholder="Ex. Automobilista 2, rallye, discussion…"><small>Écris ce que tu veux, sans liste imposée.</small></label>
    <label class="form-label">Description <small>(facultatif)</small><textarea name="description" maxlength="1200" rows="4" placeholder="Présente ton programme, l’ambiance ou les infos à partager…">${esc(details.description)}</textarea></label>
    <div class="solo-form-row"><label class="form-label">Jour<input name="streamDate" type="date" value="${esc(departure.date||'')}" ${event?'':`min="${parisToday()}"`} required></label><label class="form-label">Début du stream<input name="streamTime" type="time" value="${esc(details.streamTime)}"></label></div>
    <label class="sim-option stream-race-toggle"><input type="checkbox" name="streamRace" ${details.isRace?'checked':''}><span>🏁 Je diffuse une course</span></label>
    <div class="stream-race" ${details.isRace?'':'hidden'}><label class="form-label">Départ de la course<input name="raceTime" type="time" value="${esc(details.raceTime)}"></label></div>
    <p class="creation-help">Heures de Paris : indique l’heure du stream ou, pour une course, celle du départ.</p>
  </section></div><aside class="stream-form-preview" aria-label="Aperçu de l’annonce"><h3>Sur le site <small>Aperçu en direct</small></h3><div data-stream-card-preview></div></aside></div><div class="creation-actions"><button type="submit" class="primary-button stream-button">${event?'ENREGISTRER':'ANNONCER LE STREAM'}</button></div></form>`;
  updatePreview(body.querySelector('form'));
  notifyRender();
}
export function streamFormData(form){
  const value=name=>form.elements[name].value.trim(),isRace=form.elements.streamRace.checked;
  const details={streamerName:value('streamerName'),logoUrl:value('logoUrl'),activity:value('activity'),description:value('description'),isRace,
    streamTime:value('streamTime'),raceTime:isRace?value('raceTime'):'',streamUrl:value('streamUrl')};
  const time=[details.streamTime,details.raceTime].filter(Boolean).sort()[0]||'';
  return {name:value('eventName'),format:'solo',sim:'stream',access:'open',rounds:[{circuit:'',durationMinutes:60,categories:[]}],categories:[],details,
    departures:[{id:state.editingEvent?.departures?.[0]?.id,date:value('streamDate'),time,tbd:false}]};
}
function updatePreview(form){
  const event=streamFormData(form),departure=event.departures[0];
  // The preview needs a date tile only; the server resolves the actual Paris start time on save.
  departure.startsAt=departure.date?Date.parse(`${departure.date}T12:00:00Z`):null;
  form.querySelector('[data-stream-card-preview]').innerHTML=streamEventCard(event,{preview:true});
  const panel=form.querySelector('[data-stream-logo-preview]');
  panel.innerHTML=form.querySelector('.is-stream').innerHTML;
  form.querySelector('[data-stream-logo-remove]').hidden=!event.details.logoUrl;
}
function checkTimes(form){
  const time=form.elements.streamTime,missing=!time.value&&!(form.elements.streamRace.checked&&form.elements.raceTime.value);
  time.setCustomValidity(missing?(form.elements.streamRace.checked?'Indique l’heure du stream ou celle du départ.':'Indique l’heure du stream.'):'');
  return !missing;
}
// Compress locally to a bounded raster data URL; the existing event JSON stores it without a new upload endpoint.
async function importLogo(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>STREAM_LOGO_MAX_FILE_SIZE)throw Error('Choisis une image PNG, JPG ou WebP de 5 Mo maximum.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw Error('Cette image ne peut pas être lue. Choisis un autre fichier.');}
  try{
    if(bitmap.width*bitmap.height>40000000)throw Error('Cette image est trop grande. Choisis une version plus petite.');
    const canvas=document.createElement('canvas');
    for(const size of [256,192,128]){
      const scale=Math.min(1,size/bitmap.width,size/bitmap.height);
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.85,.65,.45]){
        const logo=canvas.toDataURL('image/webp',quality);
        if(logo.length<=STREAM_LOGO_MAX_LENGTH&&isStreamLogo(logo))return logo;
      }
    }
    throw Error('Cette image reste trop lourde. Choisis une version plus simple.');
  }finally{bitmap.close();}
}
if(typeof document!=='undefined'){
  document.addEventListener('input',event=>{
    const form=event.target.closest?.('form[data-kind="stream-event"]');if(!form||event.target.type==='file')return;
    form.querySelector('.stream-race').hidden=!form.elements.streamRace.checked;
    checkTimes(form);updatePreview(form);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-stream-logo-remove]'),form=button?.closest('form[data-kind="stream-event"]');if(!form)return;
    form.elements.logoUrl.value='';form.elements.streamLogoFile.value='';form.querySelector('[data-stream-logo-status]').textContent='Logo retiré.';updatePreview(form);
  });
  document.addEventListener('change',async event=>{
    const field=event.target,form=field.closest?.('form[data-kind="stream-event"]');if(!form)return;
    if(!field.matches('[data-stream-logo-file]')||!field.files?.[0])return;
    const status=form.querySelector('[data-stream-logo-status]'),submit=form.querySelector('[type="submit"]');
    field.disabled=true;submit.disabled=true;form.querySelector('[data-stream-logo-remove]').disabled=true;form.dataset.logoBusy='true';status.textContent='Préparation du logo…';
    try{form.elements.logoUrl.value=await importLogo(field.files[0]);status.textContent='Logo prêt.';updatePreview(form);}
    catch(error){status.textContent=error.message;}
    finally{field.value='';field.disabled=false;submit.disabled=false;form.querySelector('[data-stream-logo-remove]').disabled=false;delete form.dataset.logoBusy;}
  });
}
export async function submitStreamEvent(form){
  if(form.dataset.logoBusy)return;
  if(!checkTimes(form)){form.elements.streamTime.reportValidity();return;}
  const editing=state.editingEvent,result=await api(editing?`/api/races/${editing.id}`:'/api/races',editing?'PATCH':'POST',{...streamFormData(form),version:editing?.version});
  if(editing){state.currentEventId=editing.id;state.page='event';}else{state.page='home';state.currentEventId=null;}
  await refreshAfterSave(editing?'Stream modifié.':'Stream annoncé.',result.id);
}
