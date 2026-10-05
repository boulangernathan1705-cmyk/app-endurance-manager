// Guide des stands (stands.html): what to know about stops, tyres and repairs in Le Mans Ultimate, per category, with
// the stop times measured by the pilots of the site (server/training.mjs, /api/training/pits). The text is the same
// for everyone; only the measured times come from the server, and the page reads well without them.
const app = document.getElementById('pit-guide');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ',');

// The classes the game writes, matched to the categories of the guide.
const CATEGORIES = [
  {key:'hypercar', name:'Hypercar', match:/hyper|lmh|lmdh/i, energy:true,
    fuel:'Ton relais est limité par l’énergie virtuelle autant que par le carburant. Le rapport carburant règle combien de carburant le stand met pour un plein d’énergie : bien réglé, les deux s’épuisent au même tour.',
    tyres:'Plusieurs gommes sèches et une gomme pluie. La plus tendre chauffe vite et s’use vite : surveille la température et l’usure des pneus avant sur un relais complet.'},
  {key:'lmp2', name:'LMP2', match:/lmp2|p2/i, energy:false,
    fuel:'Pas d’énergie virtuelle : seul le carburant compte. Les tours avec un plein se calculent avec ta conso en litres par tour.',
    tyres:'Choisis la gomme au menu des stands selon la température de la piste. Une seule voiture, l’Oreca 07 : les écarts viennent du réglage et du pilotage.'},
  {key:'lmp3', name:'LMP3', match:/lmp3|p3/i, energy:false,
    fuel:'Pas d’énergie virtuelle : seul le carburant compte.',
    tyres:'Voiture légère et peu d’appui : les pneus arrière souffrent en sortie de virage lent. Garde les glisses pour les tours de qualif.'},
  {key:'gt3', name:'LMGT3', match:/gt3/i, energy:true,
    fuel:'Ton relais est limité par l’énergie virtuelle autant que par le carburant. Règle le rapport carburant pour que les deux s’épuisent au même tour.',
    tyres:'Voitures lourdes : les pneus avant chauffent dans les gros freinages, les arrière en sortie de virage. Le contrôle de traction protège l’arrière en fin de relais.'},
  {key:'gte', name:'GTE', match:/gte/i, energy:false,
    fuel:'Pas d’énergie virtuelle : seul le carburant compte.',
    tyres:'Comme en GT3, l’avant souffre au freinage et l’arrière à l’accélération.'}
];
const view = {category:readCategory(), pits:[]};
function readCategory() { try { const value = localStorage.getItem('pit-guide-category'); return CATEGORIES.some(item => item.key === value) ? value : 'hypercar'; } catch { return 'hypercar'; } }

function measured(category) {
  const rows = view.pits.filter(item => category.match.test(item.name));
  if (!rows.length) return `<p class="training-empty">Pas encore d’arrêt mesuré dans cette catégorie. Les temps arrivent tout seuls quand les pilotes du site roulent avec le synchroniseur.</p>`;
  return rows.map(row => {
    const items = [['Traversée de la voie', row.through !== null ? `${num(row.through)} s` : '—'], ['4 pneus seuls', row.tyres4 !== null ? `${num(row.tyres4)} s` : '—'],
      ['2 pneus seuls', row.tyres2 !== null ? `${num(row.tyres2)} s` : '—'], ['Remplissage', row.fuelRate ? `${num(row.fuelRate, 2)} L/s` : '—'], ['Réparation', row.repair !== null ? `${num(row.repair)} s` : '—']];
    return `<p><strong>${esc(row.name)}</strong> · ${row.stops} arrêt${row.stops > 1 ? 's' : ''}, ${row.pilots} pilote${row.pilots > 1 ? 's' : ''}</p>
      <div class="training-stats">${items.map(([label, value]) => `<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  }).join('');
}

function render() {
  const category = CATEGORIES.find(item => item.key === view.category);
  app.innerHTML = `<header class="training-intro"><div><p class="training-kicker">Le Mans Ultimate · tous les pilotes</p><h1>Guide des stands</h1>
    <p class="training-lead">Arrêts, carburant, pneus et réparations : ce qu’il faut savoir, avec les temps mesurés par les pilotes du site.</p></div>
    <div class="training-filters"><div class="training-chips" role="group" aria-label="Catégorie">${CATEGORIES.map(item => `<button type="button" data-category="${item.key}" aria-pressed="${item.key === view.category}">${item.name}</button>`).join('')}</div></div></header>
    <div class="training-grid"><div>
    <section class="training-card"><h2>Un arrêt, étape par étape</h2><ol class="pit-steps">
      <li><strong>Entrée et sortie de la voie</strong><span>Le temps perdu à traverser la voie à vitesse limitée, sans t’arrêter. Il dépend du circuit, pas de la voiture. Active le limiteur avant la ligne, sinon c’est une pénalité.</span></li>
      <li><strong>Carburant${category.energy ? ' et énergie' : ''}</strong><span>En WEC, et dans LMU qui reprend ce règlement, on ne touche pas aux pneus pendant le remplissage : le temps arrêté, c’est le remplissage puis les pneus. Plus tu prends de carburant, plus l’arrêt est long.</span></li>
      <li><strong>Pneus</strong><span>Changer 2 ou 4 pneus prend souvent le même temps : si tu changes, change les 4. Garder ses pneus un relais de plus fait gagner tout ce temps.</span></li>
      <li><strong>Changement de pilote</strong><span>Il se fait pendant le remplissage : il ne coûte du temps que lors d’un arrêt sans carburant.</span></li>
      <li><strong>Réparations</strong><span>Carrosserie et aileron, suspension, freins : le menu des stands affiche le temps prévu. Une réparation de suspension coûte bien plus cher qu’une carrosserie : réfléchis avant de la lancer en fin de course.</span></li>
    </ol><p class="training-note">Ces règles valent pour la plupart des courses. Vérifie-les avec tes propres arrêts : la page Mon entraînement décompose chacun d’eux.</p></section>
    <section class="training-card"><h2>Carburant${category.energy ? ' et énergie' : ''} · ${esc(category.name)}</h2><p>${esc(category.fuel)}</p>
      ${category.energy ? '<p class="training-note">Rapport carburant = part du réservoir utilisée par tour ÷ part d’énergie utilisée par tour. Mon entraînement le calcule avec tes tours.</p>' : ''}</section>
    </div><div>
    <section class="training-card"><h2>Temps mesurés · ${esc(category.name)}</h2>${measured(category)}
      <p class="training-note">Médianes des arrêts roulés par les pilotes du site ces 120 derniers jours, sans aucun nom. Un temps n’apparaît que s’il a été mesuré lors d’arrêts avec ce seul service.</p></section>
    <section class="training-card"><h2>Pneus · ${esc(category.name)}</h2><p>${esc(category.tyres)}</p>
      <ul class="pit-list"><li><strong>Température</strong> : trop froids, les pneus glissent et s’usent en grainant ; trop chauds, ils perdent leur adhérence en fin de relais. Une piste chaude use plus.</li>
      <li><strong>Usure</strong> : regarde le pneu qui s’use le plus vite, c’est lui qui fixe la durée du relais.</li>
      <li><strong>Gomme</strong> : choisis-la selon la température de la piste, pas de l’air. Mon entraînement montre l’usure et la température de chaque gomme que tu as roulée.</li></ul></section>
    </div></div>`;
}

app.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  view.category = button.dataset.category;
  try { localStorage.setItem('pit-guide-category', view.category); } catch {}
  render();
});

render();
fetch('/api/training/pits', {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}})
  .then(response => response.ok ? response.json() : {classes:[]}).then(data => { view.pits = data.classes || []; render(); }).catch(() => {});
