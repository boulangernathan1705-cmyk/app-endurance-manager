import {state} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=11-multi-filter';
import {normalizeAudienceFilter} from './organization-context.mjs?v=2-multi-filter';

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-organization-entry-open]');
  if(!button)return;
  event.preventDefault();
  const audiences=String(button.dataset.audiences||'general').split(',').map(value=>value.trim()).filter(Boolean);
  state.visibleAudienceIds=normalizeAudienceFilter(state.organizations,audiences);
  state.currentEventId=button.dataset.id;
  state.selectedDepartureId=button.dataset.departure||null;
  state.eventSection='race';state.drafts={};state.pendingCrewJoin=null;state.registrationOpen.clear();
  try{localStorage.setItem('endurance_audience_filter',JSON.stringify([...state.visibleAudienceIds]));}catch{}
  renderEvent();
});
