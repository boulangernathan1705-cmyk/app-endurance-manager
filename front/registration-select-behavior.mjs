import {state} from './app/core.mjs';
import {renderEvent} from './app/event-view.mjs?v=9-one-course-page';

// The "Register another driver" shortcut must open the registration form without
// programmatically focusing the driver <select>. On mobile Safari, focusing a
// select immediately opens the native picker, which makes the "Choose a driver"
// placeholder impossible to see before the user explicitly taps it.
document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('.ux-summary-registration-other[data-action="new-registration"]');
  if(!trigger||trigger.disabled)return;

  const currentEvent=state.events.find(item=>item.id===state.currentEventId);
  const departure=currentEvent?.departures.find(item=>item.id===trigger.dataset.departure);
  if(!currentEvent||!departure||departure.startsAt<=Date.now())return;

  event.preventDefault();
  event.stopPropagation();

  state.pendingCrewJoin=null;
  state.selectedDepartureId=departure.id;
  state.drafts[departure.id]={
    name:'',status:'',preferredPilot:'',forOther:!!state.user,
    participantUserId:null,participantId:null,
    category:'',cars:[],carAny:false,id:null,version:null,mode:'pilot'
  };
  state.registrationOpen.add(departure.id);
  renderEvent();
},true);
