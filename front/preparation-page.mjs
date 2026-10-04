import {nextSession} from '../shared/preparation.mjs';
const root=document.getElementById('preparation-app');
const crewId=new URL(location.href).searchParams.get('crew');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={worked:'Travaillé',partial:'À compléter',todo:'À travailler',unknown:'Non mesuré',optional:'Optionnel'};
let data,minutes=30,loading=false;
const path=`/api/crews/${encodeURIComponent(crewId||'')}/preparation`;
const clock=seconds=>seconds==null?'—':`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
async function api(suffix='',method='GET',body){
  const response=await fetch(path+suffix,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Action momentanément indisponible.');return result;
}
function message(text,error=false){const element=root.querySelector('[data-message]');if(element){element.className=`prep-message${error?' is-error':''}`;element.textContent=text;}}
function recommendation(){const next=nextSession(data.analysis,data.level,minutes);return `<div class="prep-next-head"><div><p class="prep-eyebrow">Ta prochaine séance</p><h2>${esc(next.title)}</h2></div><label><span class="sr-only">Temps disponible</span><select data-minutes>${[20,30,45,60].map(n=>`<option value="${n}"${n===minutes?' selected':''}>${n} min</option>`).join('')}</select></label></div><p>${esc(next.why)}</p><ol>${next.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`;}
function conditionOptions(value){return [[null,'À confirmer'],[false,'Non'],[true,'Oui']].map(([v,label])=>`<option value="${v===null?'unknown':String(v)}"${v===value?' selected':''}>${label}</option>`).join('');}
function render(){
  const a=data.analysis,hasCar=Boolean(data.crew.car),back=`/${data.event.game}/#event=${encodeURIComponent(data.event.id)}`;
  root.innerHTML=`<a class="prep-back" href="${back}">← Retour à la course</a><h1>Préparer ${esc(data.event.name)}</h1><p class="prep-subtitle">${esc(data.crew.name)} · ${esc(data.crew.car||'Voiture à choisir')} · ${esc(data.event.circuitName)}</p>
    ${hasCar?'': '<p class="prep-empty">Le responsable doit choisir la voiture de l’équipage pour commencer la préparation.</p>'}
    <div class="prep-setup">${data.setup?`<p><small>Setup commun</small><br><strong>${esc(data.setup.name)}</strong></p><a class="secondary-button" href="${path}/setup">Télécharger</a>`:'<p class="prep-muted">Le setup commun sera disponible ici dès que le responsable l’aura ajouté.</p>'}</div>
    <section class="prep-next" aria-label="Ta prochaine séance">${recommendation()}</section>
    <section aria-label="Ce que tu as travaillé"><h2>Ta préparation</h2><p class="prep-summary">${a.minutes} min · ${a.total} tours enregistrés sur les 60 derniers jours</p><ul class="prep-coverage">${a.coverage.map(item=>`<li><div><strong>${esc(item.label)}</strong><small>${esc(item.evidence)}</small></div><span class="prep-status ${item.status}">${labels[item.status]}</span></li>`).join('')}</ul><p class="prep-note">Travaillé signifie pratiqué, pas maîtrisé. Les données absentes restent « non mesurées ».</p></section>
    <p class="prep-device">${data.device.lastSeen?'● Séances reçues '+esc(new Date(data.device.lastSeen*1000).toLocaleString('fr-FR')):data.device.linked?'○ Connecteur lié · en attente de données':'○ Aucune collecte liée'}</p>
    <p data-message role="status" class="prep-message"></p>
    <details class="prep-details" data-section="sessions"><summary>Mes séances${data.sessions.length?' · '+data.sessions.length:''}</summary><div>${data.sessions.length?data.sessions.map(s=>`<div class="prep-session"><span>${esc(new Date(s.startedAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</span><span>${s.minutes} min · ${s.total} tours · rythme ${clock(s.paceSeconds)}</span></div>`).join(''):'<p class="prep-empty">Tes séances apparaîtront automatiquement après réception du connecteur. Rien à saisir.</p>'}
      ${a.fuelPerLap!=null?`<p class="prep-note">Consommation médiane du groupe de tours comparables : ${a.fuelPerLap.toFixed(2)} L/tour (${a.fuelSamples} tours exploitables). Ce résumé ne remplace pas un calcul de stratégie.</p>`:''}${a.energyPerLap!=null?`<p class="prep-note">Énergie virtuelle médiane : ${a.energyPerLap.toFixed(2)} %/tour.</p>`:''}</div></details>
    <details class="prep-details" data-section="crew"><summary>Mon équipage</summary><div class="prep-table-wrap"><table><caption class="sr-only">Pratique enregistrée des coéquipiers</caption><thead><tr><th>Pilote</th><th>Roulage</th><th>Relais continu</th><th>Nuit</th><th>Mouillé</th></tr></thead><tbody>${data.roster.map(p=>`<tr><td>${esc(p.name)}${p.mine?' · toi':''}</td><td>${p.minutes} min</td><td>${p.longestMinutes} min</td>${['night','wet'].map(key=>`<td>${labels[p.coverage.find(x=>x.key===key)?.status]||'Non requis'}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="prep-note">Pratique enregistrée avec cette voiture et ce circuit. Aucun classement entre pilotes.</p></div></details>
    <details class="prep-details" data-section="settings"><summary>Parcours et connexion${data.manage?' · réglages de l’équipage':''}</summary><div><label>Ton parcours sur ce circuit<select data-level><option value="discover"${data.level==='discover'?' selected':''}>Je découvre la piste</option><option value="familiar"${data.level==='familiar'?' selected':''}>Je connais déjà la piste</option></select></label>
      <h3 style="margin-top:24px">Collecte SimHub · prototype</h3><p class="prep-note">Le connecteur est en validation : aucun installateur n’est encore disponible. La configuration lie ce compte et cette communauté ; elle remplace la liaison précédente. Les résumés seront visibles par ton équipage.</p><div class="prep-actions"><button class="secondary-button" data-device ${hasCar?'':'disabled'}>Télécharger la configuration</button>${data.device.linked?'<button class="link-button" data-unlink>Retirer la liaison</button>':''}</div>
      ${data.manage?`<h3 style="margin-top:24px">Conditions à préparer</h3><p class="prep-note">À renseigner une fois pour l’équipage, d’après les conditions dans le jeu. « À confirmer » ne rend pas l’exercice obligatoire.</p><form data-conditions><div class="prep-fields"><label>Piste mouillée prévue<select name="wet">${conditionOptions(data.conditions.wet)}</select></label><label>Roulage de nuit prévu<select name="night">${conditionOptions(data.conditions.night)}</select></label><label class="prep-wide">Durée indicative d’un relais (minutes)<input name="stintMinutes" type="number" min="20" max="180" value="${data.conditions.stintMinutes}" required></label></div><button class="secondary-button" type="submit">Enregistrer les conditions</button></form><h3 style="margin-top:24px">Setup de référence</h3><label>Fichier commun (.svm ou .sto, 128 Ko maximum)<input type="file" accept=".svm,.sto" data-setup ${hasCar?'':'disabled'}></label><p class="prep-note">Le fichier est commun à l’équipage. La télémétrie ne confirme pas le setup réellement utilisé.</p>`:''}</div></details>`;
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
  if(event.target.closest('[data-device]'))action(async()=>{
    const config=await api('/device','POST'),blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='EnduranceManager.connection.json';link.click();URL.revokeObjectURL(url);await reload();message('Configuration téléchargée. Elle contient ta clé personnelle : conserve-la sur ton PC.');
  });
  if(event.target.closest('[data-unlink]'))action(async()=>{await api('/device','DELETE');await reload();message('Liaison retirée.');});
});
if(crewId)reload().catch(error=>{root.innerHTML=`<h1>Préparation indisponible</h1><p>${esc(error.message)}</p><a class="secondary-button" href="/">Retour au site</a>`;});
else root.innerHTML='<h1>Choisis ton équipage</h1><p>Ouvre ta course puis « Préparer la course » dans ton équipage.</p><a class="secondary-button" href="/">Retour au site</a>';
