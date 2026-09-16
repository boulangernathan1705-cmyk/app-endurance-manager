import {state} from './core.mjs';
import {renderEvent} from './event-view.mjs?v=10-organizations';

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-organization-entry-open]');
  if(!button)return;
  event.preventDefault();
  state.selectedOrganizationId=button.dataset.organization||null;
  state.currentEventId=button.dataset.id;
  state.selectedDepartureId=button.dataset.departure||null;
  state.eventSection='race';state.drafts={};state.pendingCrewJoin=null;state.registrationOpen.clear();
  try{localStorage.setItem('endurance_organization_context',state.selectedOrganizationId||'general');}catch{}
  renderEvent();
});
