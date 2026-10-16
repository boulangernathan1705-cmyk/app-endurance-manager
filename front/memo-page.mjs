import {catalogForGame} from '../shared/catalog.mjs';
import {METRICS, SERVICES, SCOPE_FIELDS, present, autonomy, pitEstimate} from '../shared/memo.mjs';
import {REFERENCE_COLUMNS, REFERENCE_CIRCUITS} from '../shared/memo-reference.mjs';
import {helpContext} from './context-help.mjs';

const app = document.getElementById('memo-app'), catalog = catalogForGame('lmu');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value,digits=2) => present(value) ? value.toLocaleString('fr-FR',{maximumFractionDigits:digits}) : '—';
const seconds = value => present(value) ? `${number(value,1)} s` : '—';
const clock = value => present(value) ? `${Math.floor(value/60)}:${(value%60).toFixed(2).padStart(5,'0')}` : '—';
const duration = value => present(value) ? `${Math.floor(value/60)} min ${Math.floor(value%60).toString().padStart(2,'0')} s` : '—';
const date = value => value ? new Date(value*1000).toLocaleDateString('fr-FR') : '—';
const weatherLabels = {dry:'Sec',wet:'Pluie',unknown:'Conditions non renseignées'};
const option = (value,label,chosen) => `<option value="${esc(value)}"${value===chosen?' selected':''}>${esc(label)}</option>`;
let metadata, sheet, controller, sequence = 0, tab = 'stands';
let scope = {circuit:'spa',car:'Toyota GR010 Hybrid',weather:'dry',layout:'Tracé principal',compound:'Non renseigné',gameVersion:'Non renseignée'};
try { const saved = JSON.parse(localStorage.getItem('em-memo-v2') || 'null'); if (saved && SCOPE_FIELDS.every(key => typeof saved[key] === 'string')) scope = saved; } catch {}
const baseScope = () => metadata.scopes.filter(item => item.circuit===scope.circuit && item.car===scope.car && item.weather===scope.weather);

async function api(path,method='GET',data,signal) {
  const response = await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal,
    headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || 'Mémo indisponible.'),{status:response.status});
  return result;
}

function filtersMarkup() {
  const matches = baseScope();
  const layouts = [...new Set(matches.map(item => item.layout))];
  if (!layouts.includes(scope.layout)) scope.layout = layouts[0] || 'Tracé principal';
  const compounds = [...new Set(matches.filter(item => item.layout===scope.layout).map(item => item.compound))];
  if (!compounds.includes(scope.compound)) scope.compound = compounds[0] || 'Non renseigné';
  const versions = [...new Set(matches.filter(item => item.layout===scope.layout && item.compound===scope.compound).map(item => item.gameVersion))];
  if (!versions.includes(scope.gameVersion)) scope.gameVersion = versions[0] || 'Non renseignée';
  return `<form class="memo-filters" aria-label="Contexte du mémo">
    <label>Circuit<select name="circuit">${catalog.circuits.filter(item => !item.random).map(item => option(item.id,item.name,scope.circuit)).join('')}</select></label>
    <label>Voiture<select name="car">${Object.entries(catalog.cars).map(([category,cars]) => `<optgroup label="${esc(category)}">${cars.map(car => option(car,car,scope.car)).join('')}</optgroup>`).join('')}</select></label>
    <label>Conditions<select name="weather">${Object.entries(weatherLabels).map(([value,label]) => option(value,label,scope.weather)).join('')}</select></label>
    <label>Tracé<select name="layout">${(layouts.length?layouts:[scope.layout]).map(value => option(value,value,scope.layout)).join('')}</select></label>
    <label>Pneus<select name="compound">${(compounds.length?compounds:[scope.compound]).map(value => option(value,value,scope.compound)).join('')}</select></label>
    <label>Version LMU<select name="gameVersion">${(versions.length?versions:[scope.gameVersion]).map(value => option(value,value,scope.gameVersion)).join('')}</select></label>
  </form>`;
}

function frame() {
  app.innerHTML = `${helpContext('memo')}<header class="memo-head"><div><p class="memo-kicker">Le Mans Ultimate · Fiche de référence</p><h1>Mémo des circuits</h1><p class="memo-sub">Stands, consommation et usure. Les chiffres utiles, au même endroit.</p></div><span class="memo-tag">ENDURANCE MANAGER</span></header>
    <div id="memo-filters">${filtersMarkup()}</div>
    <div class="memo-tabs" role="tablist" aria-label="Rubriques du mémo"><button id="tab-stands" role="tab" aria-controls="memo-stands" aria-selected="${tab==='stands'}" tabindex="${tab==='stands'?0:-1}" data-tab="stands">Stands</button><button id="tab-relays" role="tab" aria-controls="memo-relays" aria-selected="${tab==='relays'}" tabindex="${tab==='relays'?0:-1}" data-tab="relays">Relais</button></div>
    <p id="memo-load-status" class="memo-status" role="status"></p>
    <section id="memo-stands" role="tabpanel" aria-labelledby="tab-stands" tabindex="0"${tab!=='stands'?' hidden':''}></section>
    <section id="memo-relays" role="tabpanel" aria-labelledby="tab-relays" tabindex="0"${tab!=='relays'?' hidden':''}></section>
    <section class="memo-panel" id="memo-sharing"></section>`;
  renderSharing();
  bindFilters();
  app.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click',() => chooseTab(button.dataset.tab));
    button.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); chooseTab(event.key==='Home'?'stands':event.key==='End'?'relays':tab==='stands'?'relays':'stands');
      app.querySelector(`[data-tab="${tab}"]`).focus();
    });
  });
}

function bindFilters() {
  const form = app.querySelector('.memo-filters');
  form.addEventListener('submit',event => event.preventDefault());
  form.addEventListener('change',event => {
    scope[event.target.name] = event.target.value;
    const name = event.target.name;
    app.querySelector('#memo-filters').innerHTML = filtersMarkup();
    bindFilters(); app.querySelector(`[name="${name}"]`)?.focus();
    try { localStorage.setItem('em-memo-v2',JSON.stringify(scope)); } catch {}
    loadSheet();
  });
}

function chooseTab(next) {
  tab = next;
  for (const button of app.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab===next;
    button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1;
  }
  app.querySelector('#memo-stands').hidden=next!=='stands'; app.querySelector('#memo-relays').hidden=next!=='relays';
}

function metricCell(key,metric,own=false) {
  if (!metric) return '<span>—</span><small>Non mesuré</small>';
  const value = key==='lapSeconds'?clock(metric.value):`${number(metric.value)} ${METRICS[key].unit}`;
  return `<strong>${value}</strong><small>${own?`${metric.observations} ${key.startsWith('pit')?'passage(s)':'tours mesurés'}`:`${metric.pilots} pilotes · ${metric.observations} mesures`}</small>${!own&&key!=='lapSeconds'?`<small>Plage des moyennes : ${number(metric.min)}–${number(metric.max)}</small>`:''}`;
}

function renderStands() {
  const pit = sheet.pit, collective = sheet.collective.metrics;
  const pass = key => present(pit?.[key])?pit[key]:collective[key]?.value;
  const card = (key,note) => `<article class="memo-card"><span>${esc(METRICS[key].label)}</span><strong class="memo-value">${present(pass(key))?`${number(pass(key),1)} <small>s</small>`:'—'}</strong><p class="memo-note">${present(pit?.[key])?'Référence vérifiée':collective[key]?`Moyenne de ${collective[key].pilots} pilotes`:'Non mesuré'} · ${note}</p></article>`;
  const services = Object.entries(SERVICES).map(([key,label]) => {
    const item = pit?.services[key];
    const time = item ? key==='fuel'?`${number(item.fixed,1)} s + ${number(item.perUnit,3)} s/${item.basis==='litres'?'L':'% d’énergie'}`:key==='repair'?'Selon les dégâts':seconds(item.seconds) : '—';
    const rule = !item?'À vérifier en jeu':item.after.length?`Après : ${item.after.map(dep => SERVICES[dep]).join(', ')}`:'Sans attente d’un autre service';
    return `<tr><td>${label}</td><td>${time}</td><td>${esc(rule)}</td></tr>`;
  }).join('');
  app.querySelector('#memo-stands').innerHTML = `${!pit?'<p class="memo-empty">Les durées et l’ordre des services seront renseignés après vérification dans LMU. Aucune valeur supposée n’est utilisée.</p>':''}<div class="memo-cards">${card('pitTransit','de l’entrée à la sortie')}${card('pitLoss','hors immobilisation')}</div>
    <section class="memo-panel"><h2>Services au stand</h2><table class="memo-table"><thead><tr><th scope="col">Opération</th><th scope="col">Durée</th><th scope="col">Déroulement</th></tr></thead><tbody>${services}</tbody></table><p class="memo-note">Les services sans dépendance peuvent se chevaucher. Les durées ne sont pas toutes additionnées.</p>${pit?`<p class="memo-note">Vérifié le ${date(pit.verifiedAt)} · ${esc(pit.source)}</p>`:''}</section>
    <section class="memo-panel"><h2>Calculer mon arrêt</h2><div class="memo-calculator"><form id="memo-pit-form" class="memo-inputs">
      <label>Quantité à remettre (${pit?.services.fuel?.basis==='energyPercent'?'% d’énergie':'L'})<input type="number" name="quantity" min="0" max="${pit?.services.fuel?.basis==='energyPercent'?100:1000}" step="0.1" placeholder="Quantité ajoutée, pas le niveau final"></label>
      <label>Pneus<select name="tyres"><option value="">Aucun changement</option value="tyres2">Deux pneus</option><option value="tyres4">Quatre pneus</option></select></label>
      <div class="memo-checks">${['driver','brakes','wing','repair'].map(key => `<label><input name="${key}" type="checkbox">${SERVICES[key]}</label>`).join('')}</div>
      <label>Réparations : durée annoncée par le jeu (s)<input type="number" name="repairSeconds" min="0" max="3600" step="1" placeholder="Si une réparation est sélectionnée"></label>
      </form><div id="memo-pit-result" class="memo-result" aria-live="polite"></div></div></section>
    ${sheet.contributing?`<section class="memo-panel"><h2>Mes passages mesurés</h2><table class="memo-table"><thead><tr><th>Mesure</th><th>Mes données</th><th>Moyenne des autres</th></tr></thead><tbody>${['pitTransit','pitLoss'].map(key=>`<tr><td>${METRICS[key].label}</td><td>${metricCell(key,sheet.personal[key],true)}</td><td>${metricCell(key,collective[key])}</td></tr>`).join('')}</tbody></table></section>`:''}`;
  const form = app.querySelector('#memo-pit-form');
  form.addEventListener('submit',event => event.preventDefault());
  form.addEventListener('input',updatePit); form.addEventListener('change',updatePit); updatePit();
}

function readNumber(form,name) { const input=form.elements.namedItem(name); return input.value.trim()===''||!input.validity.valid?null:Number(input.value); }
function updatePit() {
  const form=app.querySelector('#memo-pit-form'), quantity=readNumber(form,'quantity'), selected=[];
  if (quantity>0) selected.push('fuel');
  if (form.elements.tyres.value) selected.push(form.elements.tyres.value);
  for (const key of ['driver','brakes','wing','repair']) if (form.elements[key].checked) selected.push(key);
  const result = pitEstimate(sheet.pit,selected,quantity,readNumber(form,'repairSeconds'));
  app.querySelector('#memo-pit-result').innerHTML = `<dl><dt>Temps immobilisé</dt><dd>${selected.length?seconds(result.stationary):'—'}</dd><dt>Entrée → sortie</dt><dd>${selected.length?seconds(result.passage):'—'}</dd><dt>Perte totale sur la piste</dt><dd>${selected.length?seconds(result.loss):'—'}</dd></dl>
    <p class="memo-note">${!selected.length?'Sélectionne les services de ton arrêt.':result.missing.length?'Calcul incomplet : durée ou ordre non vérifié pour '+result.missing.map(key=>SERVICES[key]||key).join(', ')+'.':result.loss===null?'Perte de passage non mesurée : le temps immobilisé seul ne donne pas la perte en course.':'Estimation fondée sur les mesures vérifiées, sans attente dans les stands ni erreur de placement.'}</p>
    ${result.details.length?`<ul class="memo-steps">${result.details.map(item=>`<li>${SERVICES[item.key]} : ${number(item.start,1)} → ${number(item.end,1)} s</li>`).join('')}</ul>`:''}`;
}

function renderRelays() {
  const keys = Object.keys(METRICS).filter(key => !key.startsWith('pit'));
  const hasData=Object.keys(sheet.collective.metrics).length || Object.keys(sheet.personal||{}).length;
  app.querySelector('#memo-relays').innerHTML = `${!hasData?'<p class="memo-empty">Pas encore de mesures pour cette combinaison. Les moyennes sont publiées à partir de trois pilotes disposant de données exploitables.</p>':''}
    <section class="memo-panel"><h2>Les chiffres par tour</h2><table class="memo-table"><thead><tr><th scope="col">Mesure</th>${sheet.contributing?'<th scope="col">Mes données</th>':''}<th scope="col">${sheet.contributing?'Moyenne des autres':'Moyenne des pilotes'}</th></tr></thead><tbody>${keys.map(key=>`<tr><td>${METRICS[key].label}</td>${sheet.contributing?`<td>${metricCell(key,sheet.personal[key],true)}</td>`:''}<td>${metricCell(key,sheet.collective.metrics[key])}</td></tr>`).join('')}</tbody></table>
    <p class="memo-meta">Même poids pour chaque pilote · cinq dernières séances par pilote · données des 90 derniers jours.${sheet.latest?` Dernière mesure : ${date(sheet.latest)}.`:''}<br>Usure : points de pourcentage perdus par tour, et non durée de vie garantie du pneu.</p></section>
    <section class="memo-panel"><h2>Autonomie calculée</h2><div class="memo-calculator"><form id="memo-autonomy-form" class="memo-inputs">
      ${sheet.contributing?'<label>Données utilisées<select name="basis"><option value="personal">Mes données</option><option value="collective">Moyenne des autres</option></select></label>':''}
      <label>Carburant disponible (L)<input name="fuel" type="number" min="0" max="1000" step="0.1" placeholder="Ex. 75"></label>
      <label>Énergie virtuelle disponible (%)<input name="energy" type="number" min="0" max="100" step="0.1" placeholder="Ex. 100"></label>
      </form><div class="memo-result" id="memo-autonomy-result" aria-live="polite"></div></div></section>
    <section class="memo-panel"><h2>Repères chronométriques</h2><div id="memo-reference"></div></section>`;
  const form=app.querySelector('#memo-autonomy-form');
  form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',updateAutonomy);form.addEventListener('change',updateAutonomy);updateAutonomy();renderReference();
}

function updateAutonomy() {
  const form=app.querySelector('#memo-autonomy-form'), own=sheet.contributing&&form.elements.basis.value==='personal';
  const result=autonomy(own?sheet.personal:sheet.collective.metrics,{fuelLitres:readNumber(form,'fuel'),energyPercent:readNumber(form,'energy')});
  app.querySelector('#memo-autonomy-result').innerHTML=`<span class="memo-note">Avec les consommations affichées</span><strong class="memo-value">${result?`${result.laps} <small>tours complets</small>`:'—'}</strong><p>${result?duration(result.seconds):'Renseigne une quantité avec une consommation mesurée.'}</p><p class="memo-note">${result?`Calcul sur ${result.basedOn.map(key=>key==='fuel'?'le carburant':'l’énergie').join(' et ')}. ${result.basedOn.length>1?`Limité par ${result.limiting==='fuel'?'le carburant':'l’énergie'}. `:''}Aucune marge ajoutée. La durée utilise le chrono moyen de la même colonne.`:'Aucune autonomie n’est déduite de valeurs manquantes.'}</p>`;
}

function renderReference() {
  const target=app.querySelector('#memo-reference'), reference=metadata.reference;
  if (!reference?.entries?.length) { target.innerHTML='<p class="memo-note">Le tableau Ohne Speed n’a pas encore été synchronisé. Les repères restent séparés des mesures du mémo.</p>'; return; }
  const category=Object.keys(catalog.cars).find(key=>catalog.cars[key].includes(scope.car));
  const family=REFERENCE_CIRCUITS[scope.circuit];
  const entries=reference.entries.filter(item=>item.carClass===category && item.track.replace(/\s*\([^)]*\)\s*$/,'')===family);
  if (!entries.length) { target.innerHTML='<p class="memo-note">Pas de repère disponible dans le document pour ce circuit et cette catégorie.</p>';return; }
  target.innerHTML=`<p class="memo-note">Source : <a href="${esc(reference.url)}" target="_blank" rel="noopener">${esc(reference.source)}</a> · document ${esc(reference.updated||'sans date')} · synchronisé le ${date(reference.fetchedAt)}. Repères par catégorie, pas mesures de cette voiture ou de ces conditions.</p>
    <label>Tracé du document<select id="memo-reference-track"><option value="">Choisir le tracé correspondant</option>${entries.map((entry,index)=>option(String(index),`${entry.track} · ${entry.patch}`,null)).join('')}</select></label><div id="memo-reference-values"></div>`;
  const select=app.querySelector('#memo-reference-track');
  select.addEventListener('change',event=>{
    const entry=event.target.value===''?null:entries[Number(event.target.value)];
    app.querySelector('#memo-reference-values').innerHTML=entry?`<p class="memo-note">${esc(entry.track)} · ${esc(entry.carClass)} · version ${esc(entry.patch)} · les conditions du document peuvent différer des mesures ci-dessus.</p><table class="memo-table"><thead><tr><th>Repère du document</th><th>Chrono</th></tr></thead><tbody><tr><td>Qualification</td><td>${clock(entry.qualifying)}</td></tr>${entry.pace.map((value,index)=>`<tr><td>${REFERENCE_COLUMNS[index]}</td><td>${clock(value)}</td></tr>`).join('')}</tbody></table>`:'';
  });
  const exact=entries.findIndex(item=>item.track===scope.layout);
  if (exact>=0 || entries.length===1) { select.value=String(exact>=0?exact:0);select.dispatchEvent(new Event('change')); }
}

function renderSharing() {
  const target=app.querySelector('#memo-sharing');
  target.innerHTML=`<h2>Partage des données</h2><p class="memo-note">${metadata.contributing?'Tu peux consulter tes mesures et les moyennes anonymes des autres pilotes.':'Tu consultes les moyennes anonymes. En contribuant, tu retrouveras aussi tes propres chiffres.'}</p>
    <p class="memo-note">${metadata.connectorReady?'La liaison utilise un code personnel, révocable.':'La collecte LMU / SimHub attend sa validation sur PC. Activer le partage ne transmet rien à lui seul.'}</p>
    <div class="memo-actions">${metadata.contributing?`<button type="button" data-share="stop">Arrêter le partage et effacer mes mesures</button>${metadata.connectorReady?'<button type="button" data-share="link">Créer une liaison</button>':''}${metadata.link?'<button type="button" data-share="unlink">Retirer la liaison</button>':''}`:'<button type="button" data-share="start">Activer le partage</button>'}</div><div id="memo-sharing-status" class="memo-status" role="status"></div>`;
  target.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',async()=>{
    const action=button.dataset.share;
    if (action==='start'&&!window.confirm('Partager tes mesures LMU dans les moyennes anonymes d’Endurance Manager ? Seul toi pourras consulter tes chiffres personnels. Tu pourras tout supprimer ici.')) return;
    if (action==='stop'&&!window.confirm('Arrêter le partage, révoquer la liaison et supprimer toutes tes mesures du mémo ?')) return;
    button.disabled=true;
    try {
      const result=await api(action==='link'||action==='unlink'?'/api/memo/link':'/api/memo/consent',action==='stop'||action==='unlink'?'DELETE':'POST',action==='start'?{accept:true}:{});
      if (action==='link') { const status=target.querySelector('#memo-sharing-status');status.innerHTML='<p>Code personnel — ne le partage pas :</p><code class="memo-secret"></code>';status.querySelector('code').textContent=result.token; }
      else { metadata=await api('/api/memo');renderSharing();await loadSheet(); }
    } catch(error) { target.querySelector('#memo-sharing-status').textContent=error.message; }
    finally { button.disabled=false; }
  }));
}

async function loadSheet() {
  const requestId=++sequence;
  controller?.abort(); controller=new AbortController();
  app.querySelector('#memo-load-status').textContent='Chargement des mesures…';
  // Hide previous scope immediately, including its calculators, during a pending/failed request.
  app.querySelector('#memo-stands').innerHTML='';app.querySelector('#memo-relays').innerHTML='';
  try {
    const result=await api('/api/memo/sheet?'+new URLSearchParams(scope),'GET',undefined,controller.signal);
    if (requestId!==sequence) return;
    sheet=result;renderStands();renderRelays();app.querySelector('#memo-load-status').textContent='';
  } catch(error) { if(error.name!=='AbortError'&&requestId===sequence) app.querySelector('#memo-load-status').textContent=error.message; }
}

async function start() {
  try {
    metadata=await api('/api/memo');
    if (!catalog.circuits.some(item=>item.id===scope.circuit&&!item.random)) scope.circuit='spa';
    if (!Object.values(catalog.cars).some(cars=>cars.includes(scope.car))) scope.car='Toyota GR010 Hybrid';
    if (!weatherLabels[scope.weather]) scope.weather='dry';
    frame();await loadSheet();
  } catch(error) {
    app.innerHTML=`<section class="memo-panel"><h1>Mémo des circuits</h1><p>${esc(error.message)}</p>${error.status===401?'<a class="memo-button" href="/api/auth/discord">Se connecter avec Discord</a>':'<button class="memo-button" type="button" data-retry>Réessayer</button>'}</section>`;
    app.querySelector('[data-retry]')?.addEventListener('click',start);
  }
}
start();
