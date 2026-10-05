// « Mon entraînement » (server/training.mjs): the pilot's own LMU sessions turned into a guide. The sync program sends
// them on its own; dropping a results file here does the same by hand.
import {shortDateLabel, timeAt} from './dates.mjs';
import {todaySession, lapLabel, levelOf, levelBands} from '../shared/training.mjs';

const app = document.getElementById('training-app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');
const stamp = ms => `${shortDateLabel(ms)} · ${timeAt(ms)}`;
const KINDS = {Practice1:'Essais', Practice2:'Essais', Practice3:'Essais', Practice4:'Essais', Qualify:'Qualif', Warmup:'Warm-up', Race:'Course'};
const MINUTES = [20, 30, 45, 60, 90];
const view = {track:null, carClass:null, minutes:readMinutes(), data:null, busy:'', simhub:'', method:'simhub',sessionsOpen:false,linkOpen:null};
let loadController;

function readMinutes() { try { const value = Number(localStorage.getItem('training-minutes')); return MINUTES.includes(value) ? value : 30; } catch { return 30; } }

async function call(path, options = {}) {
  let response;
  try { response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, headers:{Accept:'application/json', ...(options.headers || {})}}); }
  catch { throw Object.assign(Error('Connexion au site impossible. Vérifie ta connexion puis réessaie.'), {status:0}); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || `Action impossible (${response.status}).`), {status:response.status});
  return result;
}

async function load() {
  loadController?.abort();
  const controller=new AbortController();loadController=controller;
  const query = new URLSearchParams();
  if (view.track) query.set('track', view.track);
  if (view.carClass) query.set('class', view.carClass);
  try {
    const data = await call(`/api/training?${query}`,{signal:controller.signal});
    if(controller.signal.aborted)return;
    view.data=data;
    view.track = view.data.track?.key || null; view.carClass = view.data.carClass || null;
    render();
  } catch (error) { if(!controller.signal.aborted)renderError(error); }
}

function renderError(error) {
  const login = error.status === 401 ? `<a class="primary-button" href="/api/auth/discord?return=${encodeURIComponent('/entrainement.html')}">Se connecter avec Discord</a>` : '<a class="secondary-button" href="/">Retour à l’accueil</a>';
  app.innerHTML = `<section class="members-panel members-error"><h1>Mon entraînement</h1><p>${esc(error.message)}</p>${login}</section>`;
}

const daysUntil = ms => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));

function hero(data) {
  const race = data.race, days = race ? daysUntil(race.startsAt) : null;
  const tracks = data.tracks.length > 1 ? '<label class="training-select">Circuit<select data-track>' + data.tracks.map(t => '<option value="'+esc(t.key)+'"'+(t.key===view.track?' selected':'')+'>'+esc(t.venue)+'</option>').join('')+'</select></label>' : '';
  const classes = data.classes.length > 1 ? '<label class="training-select">Catégorie<select data-class>'+data.classes.map(c=>'<option'+(c===view.carClass?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label>' : '';
  return '<header class="preparation-head"><p class="memo-kicker">Entraînement · Ma préparation</p><h1>'+esc(race?.name || 'Mon entraînement')+'</h1><p class="preparation-sub">'+(race ? 'Départ <strong>'+esc(stamp(race.startsAt))+'</strong><span>'+days+' jour'+(days>1?'s':'')+' pour se préparer</span>' : esc(data.track?.venue || 'Roule, le guide fait le reste.'))+'<span>'+esc(data.crew?.car || data.analysis.last?.car || data.carClass || '')+'</span><a href="/stands.html">Mémo du circuit</a></p><p class="memo-key"><span class="is-you"><i class="dot"></i>Toi</span>'+(data.crew?'<span class="is-pilots"><i class="dot"></i>L’équipage</span>':'')+'<span class="is-game"><i class="dot"></i>Le jeu</span></p>'+(tracks||classes?'<div class="training-filters">'+tracks+classes+'</div>':'')+'</header>';
}

const figure = (label, value, note = '', source = 'is-you', noteSource = '') => '<div class="memo-row"><dt>'+esc(label)+'</dt><dd class="'+source+'">'+esc(value)+'<small class="'+noteSource+'">'+esc(note)+'</small></dd></div>';
const average = values => { const list=values.filter(v=>Number.isFinite(v)); return list.length?list.reduce((a,b)=>a+b,0)/list.length:null; };
const relative = at => { const days=Math.floor((Date.now()-at)/86400000); return days<=0?'aujourd’hui':days===1?'hier':'il y a '+days+' jours'; };
function crewTable(data) {
  if (!data.crew) return '';
  return '<section class="training-card preparation-crew"><h2>Où en est l’équipage</h2><div class="memo-table-wrap"><table class="memo-table"><caption>Préparation de '+esc(data.crew.name)+'</caption><thead><tr>'+['Pilote','Programme','Meilleur tour','Rythme','Niveau','Conso / tour','Dernière séance'].map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+data.crew.pilots.map(p=>'<tr class="'+(p.you?'is-you-row':'is-pilots')+'"><th scope="row">'+esc(p.you?'Toi':p.name)+'</th><td><span class="preparation-progress" aria-hidden="true">'+p.steps.map(step=>'<i class="'+(step.done?'is-done':'')+'"></i>').join('')+'</span>'+p.steps.filter(step=>step.done).length+'/'+p.steps.length+'</td><td>'+lapLabel(p.best)+'</td><td>'+lapLabel(p.pace)+'</td><td>'+(p.level?'<span class="memo-chip">'+esc(p.level)+'</span>':'—')+'</td><td>'+(p.fuel?num(p.fuel,2)+' L':'—')+'</td><td>'+(p.last?relative(p.last.at)+'<small>'+p.last.laps+' tours</small>':'—')+'</td></tr>').join('')+'</tbody></table></div><p class="training-note">Visible seulement par les pilotes de l’équipage.</p></section>';
}
function lapCard(data) {
  const a=data.analysis;
  const losses=a.sectors.map((v,i)=>v?{sector:i+1,gap:v.median-v.best}:null).filter(Boolean).sort((a,b)=>b.gap-a.gap);
  const paces=[a.median,...(data.crew?.pilots.map(p=>p.pace)||[])].filter(v=>Number.isFinite(v)&&v>0);
  const low=paces.length?Math.min(...paces)-0.5:0, high=paces.length?Math.max(...paces)+0.5:0;
  const band=high?'<div class="preparation-pace"><h3>Rythme de course</h3><div class="memo-band">'+(data.crew?'<span class="memo-iqr" style="left:'+((Math.min(...paces)-low)/(high-low)*100)+'%;width:'+((Math.max(...paces)-Math.min(...paces))/(high-low)*100)+'%"></span>':'')+(data.crew?.pilots||[]).filter(p=>!p.you&&p.pace).map(p=>'<span class="memo-you preparation-peer" style="left:'+((p.pace-low)/(high-low)*100)+'%" title="'+esc(p.name+' · '+lapLabel(p.pace))+'"></span>').join('')+(a.median?'<span class="memo-you" style="left:'+((a.median-low)/(high-low)*100)+'%" title="Ton rythme"></span>':'')+'</div><div class="memo-scale"><span>'+lapLabel(low)+'</span>'+(data.crew?'<span>L’équipage</span>':'')+'<span>'+lapLabel(high)+'</span></div></div>':'';
  return '<section class="training-card"><h2>Mes chronos</h2><dl>'+figure('Meilleur tour',lapLabel(a.best))+figure('Rythme de course',lapLabel(a.median),'tour médian')+figure('Secteurs à gagner',losses.length?'S'+losses[0].sector+' +'+num(losses[0].gap,2)+' s':'—',losses.length?'sur ton meilleur S'+losses[0].sector:'')+'</dl>'+band+'</section>';
}
function consumption(data) {
  const a=data.analysis,l=data.live;
  const energy=l?.energyPerLap ?? a.energyPerLap, litres=l?.fuelPerLap ?? a.fuelLitres;
  const wear=average(l?.compounds?.[0]?.wear || []);
  const team=average(data.crew?.pilots.map(p=>p.energy)||[]);
  const laps=l?.energyLaps ?? l?.tankLaps ?? a.tankLaps;
  return '<section class="training-card"><h2>Conso et pneus</h2><dl>'+figure('Énergie / tour',energy?num(energy,2)+' %':'—',team?'équipage '+num(team,2)+' %':'')+figure('Carburant / tour',litres?num(litres,2)+' L':'—',data.game?.fuel?'jeu '+num(data.game.fuel,2)+' L':'','is-you','is-game')+figure('Usure / tour',wear!==null?num(wear,2)+' %':'—',wear!==null?'moyenne des pneus · '+(l.compounds[0].name||''):'')+figure('Relais',laps?laps+' tours':'—',l?.energyLaps?'avec 100 % d’énergie':laps?'avec un plein':'')+'</dl></section>';
}

function today(data) {
  const plan=todaySession(data.analysis,data.steps,{minutes:view.minutes,daysLeft:data.race?daysUntil(data.race.startsAt):null});
  const next=data.steps.find(s=>!s.done);
  const peers=(data.crew?.pilots||[]).filter(p=>!p.you&&p.pace).sort((a,b)=>a.pace-b.pace);
  const bands=data.reference?levelBands(data.reference):[];
  const level=levelOf(data.analysis.median,data.reference), index=bands.findIndex(b=>b.name===level), goal=index>0?bands[index-1]:null;
  return '<section class="training-card training-today"><h2>Séance du jour</h2><div class="preparation-session"><p class="memo-big">'+view.minutes+'<span>min · '+esc(plan.focus.toLowerCase())+'</span></p><p>'+esc(next?.advice || plan.blocks.map(b=>b.tip).join(' '))+'</p></div><div class="training-chips" role="group" aria-label="Temps disponible">'+MINUTES.map(m=>'<button type="button" data-minutes="'+m+'" aria-pressed="'+(m===view.minutes)+'">'+m+' min</button>').join('')+'</div><dl>'+figure('Ton objectif',goal?.name||level||'Construire ton rythme',goal?.to?lapLabel(goal.to)+' en course':data.analysis.median?'Garder un rythme régulier':'Ajoute ta première séance')+(peers[0]&&data.analysis.median?figure('Écart avec '+peers[0].name,(data.analysis.median-peers[0].pace>=0?'+':'')+num(data.analysis.median-peers[0].pace,3)+' s','au rythme de course'): '')+'</dl><details class="preparation-details"><summary>Déroulé de la séance</summary><ol class="training-blocks">'+plan.blocks.map(b=>'<li><strong>'+b.laps+' tours</strong><span><b>'+esc(b.title)+'</b>'+esc(b.tip)+'</span></li>').join('')+'</ol></details></section>';
}

function program(data) {
  const next=data.steps.find(s=>!s.done)?.key;
  return '<section class="training-card"><h2>Programme</h2><ol class="training-steps">'+data.steps.map((step,i)=>'<li class="'+(step.done?'is-done':'')+(step.key===next?' is-current':'')+'"><span class="training-step-mark" aria-hidden="true">'+(i+1)+'</span><div><strong>'+esc(step.title)+'</strong><p>'+esc(step.proof || (step.key==='simulation'?'Avant la course':step.key==='pit'?'À faire : arrêt aux stands':step.advice))+'</p></div><div class="preparation-marks">'+(data.crew?.pilots||[]).filter(p=>!p.you).map(p=>'<span class="preparation-initial '+(p.steps.find(s=>s.key===step.key)?.done?'is-done':'')+'" title="'+esc(p.name)+'">'+esc(p.name.slice(0,3))+'</span>').join('')+(step.auto?'':'<label class="training-tick"><input type="checkbox" data-step="'+esc(step.key)+'" '+(step.manual?'checked ':'')+(!data.track?'disabled ':'')+'aria-label="Valider : '+esc(step.title)+'"></label>')+'</div></li>').join('')+'</ol></section>';
}



// Online, every driver of a results file is marked as the player: the pilot's name in LMU tells which one he is.
function lmuName(data) {
  const pending = data.pending;
  if (pending) return `<form class="training-name is-pending" data-name-form><p><strong>${pending.files} séance${pending.files > 1 ? 's' : ''} en ligne attend${pending.files > 1 ? 'ent' : ''} ton nom.</strong> En multijoueur, LMU met tous les pilotes dans le fichier : choisis lequel est toi.</p>
    <div class="training-code"><select name="lmuName" aria-label="Ton nom dans LMU">${pending.drivers.map(name => `<option${name === data.lmuName ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select><button type="submit" class="primary-button">C’est moi</button></div></form>`;
  return `<form class="training-name" data-name-form><label for="training-lmu-name">Ton nom dans LMU</label>
    <div class="training-code"><input id="training-lmu-name" name="lmuName" type="text" maxlength="60" value="${esc(data.lmuName || '')}" placeholder="Tel qu’il apparaît en course"><button type="submit" class="secondary-button">Enregistrer</button></div>
    <small>Sert à retrouver tes tours dans les séances en ligne. Le synchroniseur le trouve tout seul.</small></form>`;
}

function sync(data) {
  const device=data.device;
  const received=device.lastSeen?'<p class="training-linked"><span aria-hidden="true">●</span> Dernière séance reçue : '+esc(stamp(device.lastSeen*1000))+'</p>':device.linked?'<p class="training-note">Code de liaison créé. La connexion sera confirmée à la réception de ta première séance.</p>':'<p>Choisis une méthode pour envoyer tes séances LMU automatiquement.</p>';
  const simhub='<ol class="training-howto"><li><strong>Installe le plugin Endurance Manager dans SimHub.</strong><p>Ferme SimHub, copie le fichier EnduranceManager.SimHub.dll fourni par ton organisateur dans le dossier de SimHub, puis relance SimHub et accepte le plugin.</p></li><li><strong>Relie le plugin à ton compte.</strong><p>Clique sur « Créer mon code », copie-le, puis dans SimHub ouvre Endurance Manager et colle le code de liaison.</p>'+(view.simhub?'<div class="training-code"><input type="text" readonly value="'+esc(view.simhub)+'" aria-label="Code de liaison SimHub" data-code><button type="button" class="secondary-button" data-copy>Copier le code</button></div>':'<button type="button" class="primary-button" data-simhub>'+ (device.linked?'Créer un nouveau code':'Créer mon code')+'</button>')+'</li><li><strong>Vérifie avec une courte séance.</strong><p>Lance LMU avec SimHub ouvert, roule quelques tours puis reviens au menu du jeu. Ta séance arrive ici après environ une à deux minutes. Recharge cette page pour la voir.</p></li></ol>';
  const windows='<ol class="training-howto"><li><strong>Télécharge ton synchroniseur personnel.</strong><form method="post" action="/api/training/sync"><button type="submit" class="primary-button">Télécharger le synchroniseur Windows</button></form><p>Le fichier est déjà lié à ton compte. Garde-le sur le PC où tu joues à LMU.</p></li><li><strong>Lance-le une première fois.</strong><p>Double-clique sur EnduranceManagerSync.exe. Il fonctionne sans fenêtre et démarre ensuite avec Windows. Vérifie que le fichier vient bien de ce site avant de l’autoriser si Windows affiche un avertissement.</p></li><li><strong>Roule puis vérifie l’arrivée d’une séance.</strong><p>Reviens au menu LMU après quelques tours. Attends une à deux minutes puis recharge cette page : la dernière séance reçue doit apparaître ci-dessus.</p></li></ol>';
  return '<section class="training-sync"><h2>Relier mon jeu</h2>'+received+'<div class="training-methods" role="group" aria-label="Méthode de liaison"><button type="button" data-method="simhub" aria-pressed="'+(view.method==='simhub')+'">Avec SimHub</button><button type="button" data-method="windows" aria-pressed="'+(view.method==='windows')+'">Sans SimHub · Windows</button></div>'+(view.method==='simhub'?simhub:windows)+'<p class="training-note">Utilise une seule méthode. Créer un code ou télécharger un nouveau synchroniseur remplace la liaison précédente.</p><details class="training-troubleshooting"><summary>La séance n’arrive pas ?</summary><ul><li>Vérifie que LMU et SimHub sont ouverts sur le même PC, ou que le synchroniseur Windows est lancé.</li><li>Reviens au menu du jeu et attends deux minutes : les échantillons restent sur ton PC pendant que tu roules.</li><li>Si tu as recréé un code, colle le nouveau dans SimHub. Pour le synchroniseur, lance le dernier fichier téléchargé.</li><li>Si une séance en ligne attend ton nom LMU, renseigne-le ci-dessous.</li></ul>'+lmuName(data)+'</details><details class="training-troubleshooting"><summary>Importer un fichier manuellement</summary><p class="training-note">Pour une séance manquante, dépose son fichier XML depuis Steam › steamapps › common › Le Mans Ultimate › UserData › Log › Results.</p><label class="training-drop" data-drop><input type="file" accept=".xml" multiple data-file><strong>Choisir ou déposer des fichiers XML</strong></label></details>'+(device.linked?'<button type="button" class="secondary-button" data-unlink>Retirer la liaison</button>':'')+(view.busy?'<p class="training-busy" role="status">'+esc(view.busy)+'</p>':'')+'</section>';
}

function sessions(data) {
  if (!data.sessions.length) return '';
  return '<details class="training-card preparation-sessions" data-fold="sessions"'+(view.sessionsOpen?' open':'')+'><summary>Mes séances <span>'+data.sessions.length+(data.sessions.length===1?' séance récente':' dernières')+'</span></summary><ul class="training-sessions">'+data.sessions.map(item=>'<li><div><small>'+esc(relative(item.at))+'</small><span>'+esc(item.venue+' · '+item.car+' · '+(KINDS[item.kind]||item.kind))+'</span></div><span>'+item.laps+' tours</span><button type="button" class="training-delete" data-delete="'+esc(item.id)+'" aria-label="Supprimer la séance du '+esc(stamp(item.at))+'">✕</button></li>').join('')+'</ul></details>';
}

function render() {
  const data=view.data;
  app.innerHTML=hero(data)+crewTable(data)+(data.analysis.totalLaps?'':'<section class="training-card training-welcome"><h2>Ta première séance</h2><p>Relie ton jeu puis roule dans Le Mans Ultimate. Tes données rempliront cette préparation.</p></section>')+'<div class="preparation-grid">'+program(data)+today(data)+lapCard(data)+consumption(data)+'</div>'+sessions(data)+'<p class="training-note training-analysis-window">Chiffres calculés sur les '+(data.analysisWindow||5)+' dernières séances du circuit et de la catégorie sélectionnés.</p><details class="training-card preparation-details" data-fold="link"'+((view.linkOpen??!data.device.linked)||data.pending||view.busy||view.simhub?' open':'')+'><summary>Liaison du jeu</summary>'+sync(data)+'</details>';
}


async function upload(files) {
  const list = [...files].filter(file => /\.xml$/i.test(file.name));
  if (!list.length) { view.busy = 'Choisis un fichier .xml du dossier Results.'; render(); return; }
  let added = 0, errors = [];
  for (const [index, file] of list.entries()) {
    view.busy = `Envoi ${index + 1} / ${list.length}…`; render();
    try { const result = await call('/api/training/sessions', {method:'POST', headers:{'Content-Type':'application/xml'}, body:file}); if (result.created) added++; else if (result.pending) errors.push(`${file.name} : choisis ton nom ci-dessus.`); }
    catch (error) { errors.push(`${file.name} : ${error.message}`); }
  }
  view.busy = [added ? `${added} séance${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}.` : 'Aucune nouvelle séance.', ...errors].join(' ');
  await load();
}

async function act(task) {
  try { await task(); await load(); } catch (error) { view.busy = error.message; render(); }
}

app.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-track]')) { view.track = target.value; view.carClass = null; load(); }
  else if (target.matches('[data-class]')) { view.carClass = target.value; load(); }
  else if (target.matches('[data-file]')) upload(target.files);
  else if (target.matches('[data-step]')) act(() => call('/api/training/marks', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({track:view.track, step:target.dataset.step, done:target.checked})}));
});
app.addEventListener('click', event => {
  const method=event.target.closest('[data-method]');
  if(method){view.method=method.dataset.method;view.linkOpen=true;render();return;}
  const minutes = event.target.closest('[data-minutes]');
  if (minutes) { view.minutes = Number(minutes.dataset.minutes); try { localStorage.setItem('training-minutes', String(view.minutes)); } catch {} render(); return; }
  const remove = event.target.closest('[data-delete]');
  if (remove && confirm('Supprimer cette séance ?')) act(() => call(`/api/training/sessions/${remove.dataset.delete}`, {method:'DELETE'}));
  if(event.target.closest('[data-simhub]')){view.busy='Création du code…';render();call('/api/training/sync/code',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(result=>{view.simhub=result.code;view.data.device={linked:true,lastSeen:null};view.busy='';render();}).catch(error=>{view.busy=error.message;render();});}
  if(event.target.closest('[data-copy]')){const input=app.querySelector('[data-code]');input.select();if(navigator.clipboard)navigator.clipboard.writeText(input.value).then(()=>{view.busy='Code copié. Colle-le maintenant dans SimHub.';render();}).catch(()=>{view.busy='Sélectionne le code puis copie-le avec Ctrl+C.';render();});}
  if (event.target.closest('[data-unlink]') && confirm('Retirer la liaison ? Le plugin et le synchroniseur n’enverront plus de séances.')) act(async()=>{await call('/api/training/sync',{method:'DELETE'});view.simhub='';view.busy='Liaison retirée.';});
});
app.addEventListener('submit', event => {
  const form = event.target.closest('[data-name-form]');
  if (!form) return;
  event.preventDefault();
  const name = new FormData(form).get('lmuName');
  act(async () => {
    const result = await call('/api/training/profile', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lmuName:name})});
    view.busy = result.added ? `${result.added} séance${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}.` : 'Nom enregistré.';
  });
});
app.addEventListener('dragover', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); zone.classList.add('is-over'); } });
app.addEventListener('dragleave', event => event.target.closest('[data-drop]')?.classList.remove('is-over'));
app.addEventListener('drop', event => { const zone = event.target.closest('[data-drop]'); if (zone) { event.preventDefault(); upload(event.dataTransfer.files); } });

app.addEventListener('toggle',event=>{if(!app.contains(event.target))return;const fold=event.target.dataset.fold;if(fold==='sessions')view.sessionsOpen=event.target.open;if(fold==='link')view.linkOpen=event.target.open;},true);

load();
