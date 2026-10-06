// With the events calendar as home page, the simulator is chosen the first time the pilot opens « Endurance »
// (then remembered by the em_sim cookie; the LMU / iRacing switch changes it).
export const simChosen=()=>/(?:^|;\s*)em_sim=(lmu|iracing)(?:;|$)/.test(document.cookie);
export function openSimChooser(){
  if(document.querySelector('.hub-sim-dialog'))return;
  const sims=[['lmu','LMU','Le Mans Ultimate'],['iracing','iR','iRacing']];
  const dialog=document.createElement('dialog');
  dialog.className='hub-sim-dialog';
  dialog.setAttribute('aria-labelledby','sim-chooser-title');
  dialog.innerHTML=`<h2 id="sim-chooser-title">Endurance</h2><p>Sur quelle simu roules-tu ? Le site s’en souviendra.</p><div class="hub-sim-choices">${sims.map(([id,badge,name])=>`<a class="hub-sim-choice game-${id}" href="/${id}/"><span class="game-badge" aria-hidden="true">${badge}</span><strong>${name}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>`;
  document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  dialog.querySelector('a')?.focus();
}
