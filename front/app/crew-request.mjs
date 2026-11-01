// « Demander un équipage » (Nathan 2026-11-01): creating crews is for the organisers. A pilot entered on a start
// without a crew proposes one (name, category, car, teammates among the pilots alone); every organiser is told on
// the site (no Discord ping), checks it on the « Équipages » page and creates it. The pilot does not manage it.
import {state,esc,api,CARS,showError} from './core.mjs';
import {refreshAfterSave} from './refresh.mjs';
import {timeLabel} from '../dates.mjs';

let open=null; // {eventId, departureId, category, car, name, mates:Set}

const freeRegs=departure=>{
  const assigned=new Set((departure.crews||[]).flatMap(crew=>crew.registrationIds||[]).map(String));
  return (departure.availability||[]).filter(reg=>!reg.foreign&&reg.status!=='unavailable'&&!assigned.has(String(reg.id)));
};
const current=()=>{
  const event=state.events.find(item=>item.id===open?.eventId),departure=event?.departures.find(item=>item.id===open?.departureId);
  return {event,departure};
};
const close=()=>{open=null;document.querySelector('[data-crew-request]')?.remove();};

function markup(){
  const {event,departure}=current();
  if(!event||!departure)return '';
  const free=freeRegs(departure),mine=free.filter(reg=>reg.mine);
  const categories=[...new Set(mine.map(reg=>reg.category))];
  if(!categories.includes(open.category))open.category=categories[0]||'';
  const cars=CARS[open.category]||[];
  if(!cars.includes(open.car))open.car='';
  const mates=free.filter(reg=>!reg.mine&&reg.category===open.category);
  const sent=(state.crewRequests||[]).find(item=>item.mine&&item.departureId===departure.id);
  return `<div class="crew-builder-overlay" data-crew-request><section class="crew-builder-panel registration-sheet crew-request-sheet" role="dialog" aria-modal="true" aria-labelledby="crew-request-title">
    <div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="crew-request-title" tabindex="-1">Demander un équipage</h2><p>${esc(event.name)} · départ ${esc(timeLabel(departure.time))}</p></div><button type="button" class="registration-close-button" data-crew-request-close aria-label="Fermer">×</button></div>
    <form class="crew-builder-form" data-crew-request-form>
      ${sent?`<p class="registration-step-help">Ta demande « ${esc(sent.name)} » attend un organisateur. En envoyer une autre la remplace.</p>`:''}
      <label>Nom de l’équipage<input name="requestName" maxlength="60" required value="${esc(open.name)}" placeholder="Ex. Équipage Alpha"></label>
      ${categories.length>1?`<fieldset class="crew-request-field"><legend class="form-label">Catégorie</legend><div class="crew-request-choices">${categories.map(category=>`<label><input type="radio" name="requestCategory" value="${esc(category)}" ${category===open.category?'checked':''}><span>${esc(category)}</span></label>`).join('')}</div></fieldset>`:''}
      <label>Voiture<select name="requestCar"><option value="">À choisir plus tard</option>${cars.map(car=>`<option value="${esc(car)}" ${car===open.car?'selected':''}>${esc(car)}</option>`).join('')}</select></label>
      <fieldset class="crew-request-field"><legend class="form-label">Avec qui ? <small>facultatif</small></legend>
        ${mates.length?mates.map(reg=>`<label class="crew-request-mate"><input type="checkbox" name="requestMate" value="${esc(reg.id)}" ${open.mates.has(reg.id)?'checked':''}><strong>${esc(reg.name)}</strong></label>`).join(''):`<p class="registration-step-help">Aucun autre pilote seul en ${esc(open.category)} sur ce départ.</p>`}
      </fieldset>
      <p class="crew-request-note">Les organisateurs reçoivent ta demande sur le site, sans ping Discord. Ils la vérifient et créent l’équipage ; tu reçois une notification.</p>
      <p class="creation-error" data-crew-request-error hidden></p>
      <div class="registration-step-nav">${sent?`<button type="button" class="link-button" data-action="crew-request-cancel" data-id="${esc(sent.id)}">Annuler ma demande</button>`:''}<button type="button" class="secondary-button" data-crew-request-close>Fermer</button><button type="submit" class="primary-button">Envoyer la demande</button></div>
    </form>
  </section></div>`;
}
function render(){
  const html=markup();
  if(!html){close();return;}
  const old=document.querySelector('[data-crew-request]');
  const holder=document.createElement('div');holder.innerHTML=html;
  const node=holder.firstElementChild;
  old?old.replaceWith(node):document.body.append(node);
  if(!old)node.querySelector('#crew-request-title')?.focus({preventScroll:true});
}

export function openCrewRequest(event,departureId){
  const departure=event?.departures.find(item=>item.id===departureId);
  if(!departure)return;
  const sent=(state.crewRequests||[]).find(item=>item.mine&&item.departureId===departureId);
  const mine=freeRegs(departure).find(reg=>reg.mine);
  open={eventId:event.id,departureId,name:sent?.name||'',category:sent?.category||mine?.category||'',car:sent?.car||'',mates:new Set((sent?.registrationIds||[]).slice(1))};
  render();
}
export async function cancelCrewRequest(id){
  if(!confirm('Annuler ta demande d’équipage ?'))return false;
  await api(`/api/crew-requests/${id}/cancel`,'POST',{});
  close();
  return true;
}

if(typeof document!=='undefined'){
  document.addEventListener('click',event=>{
    if(!open)return;
    if(event.target.closest('[data-crew-request-close]')||event.target.matches?.('[data-crew-request]')){event.preventDefault();close();}
  });
  document.addEventListener('keydown',event=>{if(open&&event.key==='Escape')close();});
  document.addEventListener('input',event=>{if(open&&event.target.name==='requestName')open.name=event.target.value;});
  document.addEventListener('change',event=>{
    if(!open||!event.target.closest('[data-crew-request-form]'))return;
    const field=event.target;
    if(field.name==='requestCategory'){open.category=field.value;open.car='';open.mates.clear();render();}
    else if(field.name==='requestCar')open.car=field.value;
    else if(field.name==='requestMate')field.checked?open.mates.add(field.value):open.mates.delete(field.value);
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest?.('[data-crew-request-form]');
    if(!form||!open)return;
    event.preventDefault();
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      open.name=form.elements.requestName.value.trim();
      if(!open.name)throw Error('Indique le nom de l’équipage.');
      await api(`/api/events/${open.eventId}/departures/${open.departureId}/crew-requests`,'POST',{name:open.name,category:open.category,car:open.car,registrationIds:[...open.mates]});
      close();
      await refreshAfterSave('Demande envoyée aux organisateurs.');
    }catch(error){
      const box=form.querySelector('[data-crew-request-error]');
      if(box){box.textContent=error?.message||'Impossible d’envoyer la demande.';box.hidden=false;}else showError(error);
      submit.disabled=false;
    }
  });
}
