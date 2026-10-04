import {nextSession} from '../shared/preparation.mjs';
const root=document.getElementById('preparation-app');
const crewId=new URL(location.href).searchParams.get('crew');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={worked:'Pratiqué',partial:'À compléter',todo:'À faire',unknown:'Sans données',optional:'Facultatif'};
let data,minutes=30,loading=false,view='training';
const path=`/api/crews/${encodeURIComponent(crewId||'')}/preparation`;
const clock=seconds=>seconds==null?'—':`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
async function api(suffix='',method='GET',body){
  const response=await fetch(path+suffix,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Action momentanément indisponible.');return result;
}
function message(text,error=false){const element=root.querySelector('[data-message]');if(element){element.className=`prep-message${error?' is-error':''}`;element.textContent=text;}}
function recommendation(){
  const next=nextSession(data.analysis,data.level,minutes);
  return `<p class="prep-eyebrow">Ta prochaine séance</p><h2>${esc(next.title)}</h2><p>${esc(next.why)}</p><details class="prep-routine" data-section="routine"><summary>Voir les étapes de la séance <span aria-hidden="true">⌄</span></summary><ol>${next.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></details>`;
}
function conditionOptions(value){return [[null,'À confirmer'],[false,'Non'],[true,'Oui']].map(([v,label])=>`<option value="${v===null?'unknown':String(v)}"${v===value?' selected':''}>${label}</option>`).join('');}
const TOPIC_HELP={
  familiarity:'Prendre des repères de freinage et une trajectoire confortable avec la voiture de course.',
  regularity:'Répéter une série de tours propres dans les mêmes conditions, plutôt que chercher un record.',
  stint:'Rouler sans pause ni retour au garage pour découvrir la voiture au fil d’un relais.',
  pits:'Répéter l’entrée, l’arrêt et la sortie des stands.',
  wet:'Pratiquer le freinage, la motricité et la visibilité sur une piste mouillée.',
  night:'Retrouver les repères et l’entrée des stands quand il fait nuit.'
};
function topicStatus(item){return data.analysis.total?item.status:item.status==='optional'?'optional':'unknown';}
function tip(id,text){return `<span class="prep-help"><button type="button" class="prep-help-button" data-help aria-label="Aide" aria-describedby="${id}" aria-expanded="false">?</button><span class="prep-tooltip" id="${id}" role="tooltip">${esc(text)}</span></span>`;}
function progressMarkup(){
  const items=data.analysis.coverage,worked=items.filter(x=>topicStatus(x)==='worked').length;
  return `<section class="prep-progress"><div class="prep-progress-heading"><h2>Ce que tu as travaillé</h2>${tip('progress-help','Vert : le thème a été pratiqué. Orange : il reste du roulage à faire. Rouge : aucune pratique observée sur ce thème. Gris : données absentes ou exercice facultatif. Ces repères ne certifient pas ta maîtrise.')}</div><div class="prep-progress-overview"><strong>${data.analysis.total?`${worked} thème${worked===1?'':'s'} pratiqué${worked===1?'':'s'}`:'Suivi à venir'}</strong><span>${data.analysis.total?`${data.analysis.minutes} min · ${data.analysis.total} tours enregistrés`:'Aucune séance enregistrée'}</span></div><div class="prep-progress-strip" role="img" aria-label="${esc(items.map(x=>x.label+' : '+labels[topicStatus(x)]).join(', '))}">${items.map(item=>`<span class="${topicStatus(item)}" aria-hidden="true"></span>`).join('')}</div><div class="prep-topics">${items.map(item=>{const status=topicStatus(item);return `<details class="prep-topic ${status}" data-section="topic-${item.key}"><summary><span class="prep-dot" aria-hidden="true">${status==='worked'?'✓':status==='todo'?'!':'•'}</span><strong>${esc(item.label)}</strong><span class="prep-status ${status}">${labels[status]}</span><span class="prep-chevron" aria-hidden="true">⌄</span></summary><div><p>${esc(TOPIC_HELP[item.key])}</p><p class="prep-observed"><span>Observation</span>${data.analysis.total?esc(item.evidence):'Aucune donnée reçue pour le moment.'}</p>${status==='unknown'?'<p class="prep-note">Cela ne veut pas dire que tu ne l’as pas travaillé : le site ne peut pas encore le mesurer.</p>':''}</div></details>`;}).join('')}</div>${data.analysis.total?'':'<p class="prep-note">Tu peux déjà suivre la séance conseillée. Le suivi se remplira quand le connecteur sera opérationnel.</p>'}</section>`;
}
function trainingMarkup(){
  const a=data.analysis;
  return `<div class="prep-controls"><label>Ta connaissance du circuit<select data-level><option value="discover"${data.level==='discover'?' selected':''}>Je découvre</option><option value="familiar"${data.level==='familiar'?' selected':''}>Je connais déjà</option></select></label><label>Temps pour cette séance<select data-minutes>${[20,30,45,60].map(n=>`<option value="${n}"${n===minutes?' selected':''}>${n} minutes</option>`).join('')}</select></label></div>
    <section class="prep-next" aria-label="Ta prochaine séance">${recommendation()}</section>
    ${progressMarkup()}
    <details class="prep-details" data-section="sessions"><summary>Voir mes séances${data.sessions.length?' · '+data.sessions.length:''}</summary><div>${data.sessions.length?data.sessions.map(s=>`<div class="prep-session"><span>${esc(new Date(s.startedAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</span><span>${s.minutes} min · ${s.total} tours · rythme ${clock(s.paceSeconds)}</span></div>`).join(''):'<p class="prep-empty">Les séances apparaîtront ici lorsque le connecteur sera opérationnel.</p>'}
      ${a.total?`<ul class="prep-evidence">${a.coverage.map(item=>`<li><strong>${esc(item.label)}</strong> : ${esc(item.evidence)}</li>`).join('')}</ul>`:''}${a.fuelPerLap!=null?`<p class="prep-note">Consommation : ${a.fuelPerLap.toFixed(2)} L/tour sur ${a.fuelSamples} tours comparables.</p>`:''}${a.energyPerLap!=null?`<p class="prep-note">Énergie virtuelle : ${a.energyPerLap.toFixed(2)} %/tour.</p>`:''}<p class="prep-note">Historique des 60 derniers jours, avec cette voiture et ce circuit.</p></div></details>
    <details class="prep-details" data-section="connection"><summary>Suivi automatique · ${data.device.lastSeen?'données reçues':data.device.linked?'liaison créée':'à venir'}</summary><div><p>Le connecteur SimHub est encore un prototype. Il doit être testé en jeu avant de pouvoir enregistrer tes entraînements automatiquement.</p><p class="prep-note">Aucun installateur n’est disponible. La configuration ci-dessous sert aux tests du connecteur ; elle contient ta clé personnelle.</p><div class="prep-actions"><button class="secondary-button" data-device ${data.crew.car?'':'disabled'}>Configuration de test</button>${data.device.linked?'<button class="link-button" data-unlink>Retirer la liaison</button>':''}</div></div></details>`;
}
function crewMarkup(){
  const hasCar=Boolean(data.crew.car);
  const conditionText=key=>data.conditions[key]===true?'Prévu':data.conditions[key]===false?'Non prévu':'À confirmer';
  return `<section class="prep-card"><h2>Notre voiture</h2><p class="prep-car">${esc(data.crew.car||'Voiture à choisir dans l’équipage')}</p><div class="prep-setup">${data.setup?`<div><small>Setup commun</small><strong>${esc(data.setup.name)}</strong></div><a class="primary-button" href="${path}/setup">Télécharger le setup</a>`:'<p class="prep-muted">Le responsable peut ajouter ici le setup utilisé par tous les pilotes.</p>'}</div>${data.manage?`<label class="prep-upload">${data.setup?'Remplacer le setup':'Ajouter le setup'}<input type="file" accept=".svm,.sto" data-setup ${hasCar?'':'disabled'}></label><p class="prep-note">Fichier .svm ou .sto, 128 Ko maximum.</p>`:''}</section>
    <section class="prep-card"><h2>Conditions de course</h2><dl class="prep-conditions"><div><dt>Pluie</dt><dd>${conditionText('wet')}</dd></div><div><dt>Nuit</dt><dd>${conditionText('night')}</dd></div><div><dt>Relais à préparer</dt><dd>${data.conditions.stintMinutes} min</dd></div></dl>${data.manage?`<details class="prep-details" data-section="conditions"><summary>Modifier les conditions</summary><div><p class="prep-note">Ces choix adaptent la routine de tous les pilotes de l’équipage.</p><form data-conditions><div class="prep-fields"><label>Piste mouillée prévue<select name="wet">${conditionOptions(data.conditions.wet)}</select></label><label>Roulage de nuit prévu<select name="night">${conditionOptions(data.conditions.night)}</select></label><label class="prep-wide">Durée du relais en minutes<input name="stintMinutes" type="number" min="20" max="180" value="${data.conditions.stintMinutes}" required></label></div><button class="secondary-button" type="submit">Enregistrer</button></form></div></details>`:''}</section>
    <section class="prep-card"><h2>Nos entraînements</h2><ul class="prep-roster">${data.roster.map(p=>`<li><strong>${esc(p.name)}${p.mine?' · toi':''}</strong><span>${p.minutes?p.minutes+' min de roulage':'Aucune séance enregistrée'}</span></li>`).join('')}</ul></section>`;
}
function render(){
  const back=`/${data.event.game}/#event=${encodeURIComponent(data.event.id)}`;
  root.innerHTML=`<a class="prep-back" href="${back}">← Retour à la course</a><h1>Ma préparation</h1><p class="prep-subtitle">${esc(data.event.name)} · ${esc(data.event.circuitName)}<span>${esc(data.crew.name)}</span></p><div class="prep-tabs" role="group" aria-label="Rubriques de préparation"><button type="button" data-view="training" aria-pressed="${view==='training'}">Mon entraînement</button><button type="button" data-view="crew" aria-pressed="${view==='crew'}">Voiture et équipage</button></div><p data-message role="status" class="prep-message"></p>${view==='training'?trainingMarkup():crewMarkup()}`;
}
async function reload(){const open=[...root.querySelectorAll('details[open]')].map(e=>e.dataset.section);data=await api();render();for(const key of open){const detail=root.querySelector(`[data-section="${key}"]`);if(detail)detail.open=true;}}
async function action(run){if(loading)return;loading=true;try{await run();}catch(error){message(error.message,true);}finally{loading=false;}}
root.addEventListener('change',event=>{
  if(event.target.matches('[data-minutes]')){minutes=Number(event.target.value);root.querySelector('.prep-next').innerHTML=recommendation();return;}
  if(event.target.matches('[data-level]'))action(async()=>{await api('/profile','PATCH',{level:event.target.value});await reload();message('Parcours enregistré.');});
  if(event.target.matches('[data-setup]'))action(async()=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>128000)throw Error('Setup limité à 128 Ko.');
    const response=await fetch(path+'/setup',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Setup-Name':file.name},body:file});
    if(!response.ok)throw Error((await response.json()).error||'Échec de l’envoi.');await reload();message('Setup commun enregistré.');
  });
});
root.addEventListener('submit',event=>{if(!event.target.matches('[data-conditions]'))return;event.preventDefault();const form=new FormData(event.target),flag=key=>form.get(key)==='unknown'?null:form.get(key)==='true';action(async()=>{await api('/conditions','PATCH',{wet:flag('wet'),night:flag('night'),stintMinutes:Number(form.get('stintMinutes'))});await reload();message('Conditions enregistrées.');});});
root.addEventListener('click',event=>{
  const help=event.target.closest('[data-help]');if(help){const open=help.getAttribute('aria-expanded')!=='true';help.setAttribute('aria-expanded',String(open));help.parentElement.classList.toggle('is-open',open);return;}
  for(const help of root.querySelectorAll('[data-help]')){help.setAttribute('aria-expanded','false');help.parentElement.classList.remove('is-open');}
  const tab=event.target.closest('[data-view]');if(tab){view=tab.dataset.view;render();return;}
  if(event.target.closest('[data-device]'))action(async()=>{
    const config=await api('/device','POST'),blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='EnduranceManager.connection.json';link.click();URL.revokeObjectURL(url);await reload();message('Configuration téléchargée. Elle contient ta clé personnelle : conserve-la sur ton PC.');
  });
  if(event.target.closest('[data-unlink]'))action(async()=>{await api('/device','DELETE');await reload();message('Liaison retirée.');});
});
root.addEventListener('keydown',event=>{if(event.key==='Escape')for(const help of root.querySelectorAll('[data-help]')){help.setAttribute('aria-expanded','false');help.parentElement.classList.remove('is-open');}});
if(crewId)reload().catch(error=>{root.innerHTML=`<h1>Préparation indisponible</h1><p>${esc(error.message)}</p><a class="secondary-button" href="/">Retour au site</a>`;});
else root.innerHTML='<h1>Choisis ton équipage</h1><p>Ouvre ta course puis « Préparer la course » dans ton équipage.</p><a class="secondary-button" href="/">Retour au site</a>';
