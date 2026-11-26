import {app,state,esc,button,contextHelpMarker as helpContext} from './core.mjs';
import {renderHome} from './home-view.mjs';
import {renderEvent} from './event-view.mjs';

// Creating or editing a race or an event: a step-by-step window over the page, as entering a race. The page
// behind stays the list (or the event being edited); « Fermer » goes back to it. Returns where the form goes.
export function formSheet(event,title,helpTopic='create-race'){
  if(event&&state.events.some(item=>item.id===event.id)){state.currentEventId=event.id;renderEvent();}else renderHome();
  state.page='form';
  const overlay=document.createElement('section');
  overlay.className='form-sheet-overlay';
  overlay.innerHTML=`<div class="registration-sheet form-sheet" role="dialog" aria-modal="true" aria-labelledby="form-sheet-title"><div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="form-sheet-title" tabindex="-1">${esc(title)}</h2></div><span class="registration-workspace-actions">${helpContext(helpTopic)}${button('close-form','Fermer',event?`data-id="${event.id}" aria-label="Fermer"`:'aria-label="Fermer"','secondary-button registration-close-button')}</span></div><div class="form-sheet-body"></div></div>`;
  app.append(overlay);
  requestAnimationFrame(()=>overlay.querySelector('h2')?.focus({preventScroll:true}));
  return overlay.querySelector('.form-sheet-body');
}
