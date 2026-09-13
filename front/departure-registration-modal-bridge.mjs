// Reuse the same "register another driver" modal from the crew builder for the
// departure action shown next to "S’inscrire". This runs before the modal
// handler so the existing shortcut can intercept the same click without
// opening the departure accordion or focusing the driver select.
document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('.ux-summary-registration-other[data-action="new-registration"]');
  if(!trigger)return;
  trigger.dataset.crewBuilderRegisterPilot='true';
},true);
