// Crew preparation (module « Préparation des équipages », server/crew-preparation.mjs): in an opened crew, the
// common setup and, for each pilot, a short checklist with his lap time and consumption.
import {esc,api} from './core.mjs';
import {parseLap,lapLabel,crewEstimate} from '../../shared/crew-preparation.mjs';

const number=value=>String(value).replace('.',',');

export const CHECKS=[
  ['setup','Setup chargé','Le setup commun est installé et essayé dans le jeu.'],
  ['stint','Relais complet','Un relais entier roulé sans s’arrêter, à la durée prévue.'],
  ['pit','Arrêt aux stands','Arrêt avec plein et changement de pilote répété.'],
  ['conditions','Nuit et pluie','Roulé de nuit et sous la pluie si la course en prévoit.']
];
const isIracing=event=>String(event.circuit||'').startsWith('iracing-');

function dots(checks){
  return `<span class="crew-prep-dots">${CHECKS.map(([key,label])=>`<i class="${checks.includes(key)?'is-done':''}" data-tip="${esc(label)}${checks.includes(key)?' : fait':' : à faire'}" aria-label="${esc(label)}${checks.includes(key)?' : fait':' : à faire'}"></i>`).join('')}</span>`;
}
function ownForm(crew,reg,entry){
  return `<form class="crew-prep-form" data-prep-form data-crew="${crew.id}" data-registration="${reg.id}">
    <fieldset class="crew-prep-checks"><legend>Ma préparation</legend>${CHECKS.map(([key,label,help])=>`<label data-tip="${esc(help)}"><input type="checkbox" name="checks" value="${key}" ${entry.checks.includes(key)?'checked':''}><span>${esc(label)}</span></label>`).join('')}</fieldset>
    <div class="crew-prep-values">
      <label><span>Mon tour moyen</span><input name="lap" inputmode="decimal" placeholder="1:54.300" value="${esc(lapLabel(entry.lapMs))}"></label>
      <label><span>Conso par tour</span><input name="fuel" inputmode="decimal" placeholder="${'L ou %'}" value="${entry.fuel?esc(number(entry.fuel)):''}"></label>
      <button type="submit" class="secondary-button">Enregistrer</button>
    </div>
  </form>`;
}

export function crewPreparation(event,crew,regs){
  const prep=crew.preparation;
  if(!prep)return '';
  const entryOf=reg=>prep.pilots[reg.id]||{checks:[],lapMs:null,fuel:null};
  const ready=regs.filter(reg=>entryOf(reg).checks.length===CHECKS.length).length;
  const extension=isIracing(event)?'.sto':'.svm';
  const setup=prep.setup;
  const otherCar=setup&&setup.car&&crew.car&&setup.car!==crew.car;
  const setupLine=setup
    ?`<a class="crew-prep-file" href="/api/crews/${crew.id}/setup" download="${esc(setup.name)}">${esc(setup.name)}</a>${otherCar?`<span class="crew-prep-warning" role="note">Fait pour ${esc(setup.car)}</span>`:''}`
    :`<span class="crew-prep-muted">${crew.canManage?'Aucun setup partagé.':'Le responsable n’a pas encore partagé de setup.'}</span>`;
  const manage=crew.canManage?`<label class="link-button crew-prep-upload">${setup?'Remplacer':'Partager un setup'}<input type="file" accept="${extension}" data-prep-setup data-crew="${crew.id}" hidden></label>${setup?`<button type="button" class="link-button" data-action="prep-remove-setup" data-crew="${crew.id}">Retirer</button>`:''}`:'';
  const rows=regs.map(reg=>{const entry=entryOf(reg);return `<li class="${reg.mine?'is-mine':''}"><span class="crew-prep-name">${esc(reg.name)}</span>${dots(entry.checks)}<span class="crew-prep-lap">${entry.lapMs?esc(lapLabel(entry.lapMs)):'—'}</span><span class="crew-prep-fuel">${entry.fuel?esc(number(entry.fuel)):'—'}</span></li>`;}).join('');
  const estimate=crewEstimate(regs.map(entryOf),event.durationMinutes||event.durationHours*60);
  const summary=estimate?`<p class="crew-prep-estimate">Rythme moyen <strong>${esc(lapLabel(estimate.lapMs))}</strong> · environ <strong>${estimate.raceLaps} tours</strong>${estimate.fuel?` · conso moyenne ${esc(number(estimate.fuel))} par tour, soit environ <strong>${estimate.raceFuel}</strong> pour la course`:''}</p>`:'';
  const own=regs.find(reg=>reg.mine);
  return `<section class="crew-prep" aria-label="Préparation de l’équipage">
    <div class="crew-prep-head"><strong>Préparation</strong><span class="crew-prep-ready">${ready}/${regs.length} pilote${regs.length>1?'s':''} prêt${ready>1?'s':''}</span></div>
    <div class="crew-prep-setup"><span class="crew-prep-label">Setup commun</span>${setupLine}${manage}</div>
    ${regs.length?`<ul class="crew-prep-pilots"><li class="crew-prep-legend" aria-hidden="true"><span></span><span>Check-list</span><span>Tour</span><span>Conso</span></li>${rows}</ul>`:''}
    ${summary}
    ${own?ownForm(crew,own,entryOf(own)):''}
  </section>`;
}

export async function savePreparation(form){
  const lapMs=parseLap(form.elements.lap.value);
  if(Number.isNaN(lapMs))throw Error('Écris ton tour comme 1:54.300.');
  const fuelText=String(form.elements.fuel.value||'').trim().replace(',','.');
  const fuel=fuelText?Number(fuelText):null;
  if(fuelText&&!(fuel>0&&fuel<=100))throw Error('Écris ta conso par tour comme 2,85.');
  const checks=[...form.querySelectorAll('[name="checks"]:checked')].map(input=>input.value);
  await api(`/api/crews/${form.dataset.crew}/preparation/${form.dataset.registration}`,'PUT',{checks,lapMs,fuel});
}
export async function uploadSetup(input){
  const file=input.files?.[0];
  if(!file)return false;
  if(file.size>200000)throw Error('Setup trop lourd (200 Ko au plus).');
  const response=await fetch(`/api/crews/${input.dataset.crew}/setup`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Setup-Name':encodeURIComponent(file.name)},body:file});
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||'Le setup n’a pas pu être envoyé.');
  return true;
}
export async function removeSetup(crewId){
  if(!confirm('Retirer le setup commun de cet équipage ?'))return false;
  await api(`/api/crews/${crewId}/setup`,'DELETE');
  return true;
}
