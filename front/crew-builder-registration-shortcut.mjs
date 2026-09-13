let activeBuilder={mode:'',departureId:''};

function decorateCrewBuilder(){
  const panel=document.querySelector('[data-crew-builder-panel]');
  if(!panel||activeBuilder.mode!=='create'||!activeBuilder.departureId)return;
  if(panel.querySelector('[data-crew-builder-register-pilot]'))return;
  const cards=panel.querySelectorAll('.crew-builder-form > .crew-builder-card');
  const composition=cards[1];
  if(!composition)return;
  const anchor=composition.querySelector('.crew-builder-pilots');
  if(!anchor)return;

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
}

document.addEventListener('click',event=>{
  const create=event.target.closest?.('[data-crew-builder-open]');
  if(create){
    activeBuilder={mode:'create',departureId:create.dataset.departure||''};
    queueMicrotask(decorateCrewBuilder);
    return;
  }
  const edit=event.target.closest?.('[data-action="edit-crew"]');
  if(edit){
    activeBuilder={mode:'edit',departureId:edit.dataset.departure||''};
    return;
  }
  if(event.target.closest?.('[data-crew-builder-cancel]'))activeBuilder={mode:'',departureId:''};
});

document.addEventListener('endurance:render',()=>queueMicrotask(decorateCrewBuilder));

const app=document.getElementById('app');
if(app){
  const observer=new MutationObserver(()=>decorateCrewBuilder());
  observer.observe(app,{subtree:true,childList:true});
}
