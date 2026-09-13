let activeBuilder={mode:'',departureId:''};
let decorateTimer=0;

function decorateCrewBuilder(){
  const panel=document.querySelector('[data-crew-builder-panel]');
  if(!panel||activeBuilder.mode!=='create'||!activeBuilder.departureId)return false;
  if(panel.querySelector('[data-crew-builder-register-pilot]'))return true;
  const cards=panel.querySelectorAll('.crew-builder-form > .crew-builder-card');
  const composition=cards[1];
  if(!composition)return false;
  const anchor=composition.querySelector('.crew-builder-pilots');
  if(!anchor)return false;

  const actions=document.createElement('div');
  actions.className='crew-builder-composition-actions';
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary-button crew-builder-register-pilot';
  button.dataset.action='new-registration';
  button.dataset.departure=activeBuilder.departureId;
  button.dataset.mode='pilot';
  button.dataset.crewBuilderRegisterPilot='true';
  button.textContent='Inscrire un autre pilote';
  actions.append(button);
  anchor.before(actions);
  return true;
}

function scheduleDecoration(attempt=0){
  clearTimeout(decorateTimer);
  if(decorateCrewBuilder()||activeBuilder.mode!=='create'||attempt>=20)return;
  decorateTimer=setTimeout(()=>scheduleDecoration(attempt+1),50);
}

document.addEventListener('click',event=>{
  const create=event.target.closest?.('[data-crew-builder-open]');
  if(create){
    activeBuilder={mode:'create',departureId:create.dataset.departure||''};
    scheduleDecoration();
    return;
  }
  const edit=event.target.closest?.('[data-action="edit-crew"]');
  if(edit){
    clearTimeout(decorateTimer);
    activeBuilder={mode:'edit',departureId:edit.dataset.departure||''};
    return;
  }
  if(event.target.closest?.('[data-crew-builder-cancel]')){
    clearTimeout(decorateTimer);
    activeBuilder={mode:'',departureId:''};
  }
});

document.addEventListener('endurance:render',()=>scheduleDecoration());
