import {esc,state} from './core.mjs';

// Wished team-mates ("A, B, C"): picked among the community's members or typed freely, then an optional comment.
// Racing alone: no team-mate to wish for.
const PREFERRED_PILOTS_MAX=100, REGISTRATION_COMMENT_MAX=200;
const preferredNames=value=>String(value||'').split(',').map(name=>name.trim()).filter(Boolean);
const preferredChip=(name,departureId)=>`<span class="preferred-pilot-chip">${esc(name)}<button type="button" data-preferred-remove="${esc(name)}" data-departure="${departureId}" aria-label="Retirer ${esc(name)}">×</button></span>`;
function preferredOptions(chosen){
  const taken=new Set(chosen.map(name=>name.toLocaleLowerCase('fr-FR')));
  return state.participants.filter(participant=>participant.id!==state.user?.id&&!taken.has(String(participant.name).toLocaleLowerCase('fr-FR'))).map(participant=>`<option value="${esc(participant.name)}"></option>`).join('');
}
export function preferredPilotField(stateDraft,departure){
  const chosen=preferredNames(stateDraft.preferredPilot);
  const pilots=stateDraft.soloDriver?'':`<div class="registration-identity-field preferred-pilots" data-preferred-pilots="${departure.id}"><label class="form-label" for="preferred-entry-${departure.id}">Coéquipiers souhaités <span class="muted">(facultatif)</span></label><div class="preferred-pilot-chips">${chosen.map(name=>preferredChip(name,departure.id)).join('')}</div><div class="preferred-pilot-entry"><input id="preferred-entry-${departure.id}" name="preferredPilotEntry" data-departure="${departure.id}" list="preferred-list-${departure.id}" maxlength="32" placeholder="${state.participants.length?'Choisis un membre ou tape un pseudo':'Pseudo du coéquipier'}" autocomplete="off" enterkeyhint="done"><button type="button" class="secondary-button" data-preferred-add>Ajouter</button></div><datalist id="preferred-list-${departure.id}">${preferredOptions(chosen)}</datalist></div>`;
  return `${pilots}<label class="registration-identity-field registration-comment"><span class="form-label">Commentaire <span class="muted">(facultatif)</span></span><textarea name="comment" data-departure="${departure.id}" maxlength="${REGISTRATION_COMMENT_MAX}" rows="2" placeholder="Un mot pour l’équipage ou l’organisateur">${esc(stateDraft.comment||'')}</textarea></label>`;
}
// Adds the typed / picked name to the draft and redraws the chips in place (same in the page and in the crew builder).
export function addPreferred(field){
  const draft=state.drafts[field.dataset.departure],name=field.value.trim();
  if(!draft||!name)return false;
  const chosen=preferredNames(draft.preferredPilot);
  if(!chosen.some(item=>item.toLocaleLowerCase('fr-FR')===name.toLocaleLowerCase('fr-FR'))){
    const next=[...chosen,name.replace(/,/g,' ').trim()].join(', ');
    if(next.length>PREFERRED_PILOTS_MAX){field.setCustomValidity('Liste trop longue.');field.reportValidity();return false;}
    draft.preferredPilot=next;
  }
  field.value='';field.setCustomValidity('');
  redrawPreferred(field.dataset.departure);
  return true;
}
function redrawPreferred(departureId){
  const boxes=document.querySelectorAll(`[data-preferred-pilots="${departureId}"]`),draft=state.drafts[departureId];
  if(!draft)return;
  const chosen=preferredNames(draft.preferredPilot);
  for(const box of boxes){
    box.querySelector('.preferred-pilot-chips').innerHTML=chosen.map(name=>preferredChip(name,departureId)).join('');
    box.querySelector('datalist').innerHTML=preferredOptions(chosen);
  }
}
if(typeof document!=='undefined'){
  document.addEventListener('keydown',event=>{
    const field=event.target;
    if(field?.name!=='preferredPilotEntry'||!(event.key==='Enter'||event.key===','))return;
    event.preventDefault();addPreferred(field);
  },true);
  // A member picked in the list: added at once.
  document.addEventListener('input',event=>{
    const field=event.target;
    if(field?.name==='comment'&&state.drafts[field.dataset?.departure])state.drafts[field.dataset.departure].comment=field.value;
    if(field?.name!=='preferredPilotEntry')return;
    const typed=event.inputType==='insertText'||String(event.inputType||'').startsWith('delete');
    if(!typed&&state.participants.some(participant=>participant.name===field.value))addPreferred(field);
  },true);
  document.addEventListener('change',event=>{if(event.target?.name==='preferredPilotEntry')addPreferred(event.target);},true);
  document.addEventListener('click',event=>{
    const add=event.target.closest?.('[data-preferred-add]');
    if(add){
      event.preventDefault();event.stopPropagation();
      const field=add.closest('[data-preferred-pilots]')?.querySelector('[name="preferredPilotEntry"]');
      if(field){addPreferred(field);field.focus();}
      return;
    }
    const remove=event.target.closest?.('[data-preferred-remove]');
    if(!remove)return;
    event.preventDefault();event.stopPropagation();
    const draft=state.drafts[remove.dataset.departure];
    if(!draft)return;
    draft.preferredPilot=preferredNames(draft.preferredPilot).filter(name=>name!==remove.dataset.preferredRemove).join(', ');
    redrawPreferred(remove.dataset.departure);
  },true);
}
