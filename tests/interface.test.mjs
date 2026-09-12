import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

function scheduleHarness() {
  const context=vm.createContext({Intl,Date,console,globalThis:{}});
  const catalog=read('shared/catalog.mjs').replace(/\bexport\s+/g,'');
  const schedule=read('front/schedule.mjs').replace(/\bexport\s+/g,'');
  vm.runInContext(catalog+'\n'+schedule,context);
  return {run:code=>vm.runInContext(code,context)};
}

test('agenda sorts unsorted departures and groups upcoming races by Paris weeks and months',()=>{
  const h=scheduleHarness();
  const result=h.run(`(() => {
    const race=(name,dates)=>({name,durationHours:6,departures:dates.map(date=>({startsAt:Date.parse(date)}))});
    return groupEvents([
      race('October',['2026-10-12T10:00:00Z']),
      race('Later',['2026-09-24T10:00:00Z']),
      race('Multiple',['2026-09-13T10:00:00Z','2026-09-08T10:00:00Z','2026-09-01T10:00:00Z']),
      race('Next week',['2026-09-14T10:00:00Z']),
      race('Soonest',['2026-09-07T12:00:00Z'])
    ],'upcoming',Date.parse('2026-09-07T08:00:00Z'));
  })()`);
  assert.deepEqual(Array.from(result,g=>g.label),['Cette semaine','La semaine prochaine','Plus tard en septembre','octobre']);
  assert.deepEqual(Array.from(result[0].items,x=>x.event.name),['Soonest','Multiple']);
});

test('archive uses the end of the last race and sorts newest finishes first',()=>{
  const h=scheduleHarness();
  const result=h.run(`(() => {
    const now=Date.parse('2026-09-07T12:00:00Z');
    const race=(name,start,durationHours)=>({name,durationHours,departures:[{startsAt:Date.parse(start)}]});
    const source=[race('Old','2026-09-02T00:00:00Z',6),race('Running','2026-09-07T00:00:00Z',24),race('Just finished','2026-09-07T06:00:00Z',6),{name:'Undated',departures:[]}];
    return {active:groupEvents(source,'upcoming',now),archive:groupEvents(source,'archived',now)};
  })()`);
  assert.equal(result.active[0].label,'En cours');
  assert.deepEqual(Array.from(result.archive[0].items,x=>x.event.name),['Just finished','Old']);
});

test('agenda handles Paris midnight, Sunday to Monday, DST and new year',()=>{
  const h=scheduleHarness();
  const group=(now,date)=>h.run(`groupEvents([{name:'Race',departures:[{startsAt:Date.parse('${date}')}]}],'upcoming',Date.parse('${now}'))[0].label`);
  assert.equal(group('2026-09-06T21:30:00Z','2026-09-06T22:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-09-06T22:15:00Z','2026-09-07T12:00:00Z'),'Cette semaine');
  assert.equal(group('2026-10-25T00:30:00Z','2026-10-25T23:30:00Z'),'La semaine prochaine');
  assert.equal(group('2026-12-20T12:00:00Z','2027-01-15T12:00:00Z'),'janvier 2027');
});

test('Course produit directement l’interface finale',()=>{
  const eventView=read('front/app/event-view.mjs');
  const crews=read('front/app/crews.mjs');
  assert.match(eventView,/event-header-stats/);
  assert.match(eventView,/departure-fold/);
  assert.match(eventView,/Modifier mon inscription/);
  assert.match(eventView,/Inscrire un autre pilote/);
  assert.match(eventView,/departure-participation-section/);
  assert.match(crews,/ux-course-pilots-accordion/);
  assert.match(crews,/ux-course-crews-accordion/);
  assert.match(crews,/crew-pilot-accordion/);
});

test('la page événement garde les actions événement séparées des actions équipage',()=>{
  const eventView=read('front/app/event-view.mjs');
  assert.doesNotMatch(eventView,/Retour aux événements/);
  assert.match(eventView,/event-toolbar-main/);
  assert.match(eventView,/departure-create-crew/);
  const refresh=eventView.indexOf("button('refresh','Actualiser')");
  const edit=eventView.indexOf("button('edit-event','Modifier l’événement'");
  const remove=eventView.indexOf("button('delete-event','Supprimer l’événement'");
  assert.ok(refresh>=0&&refresh<edit&&edit<remove);
  assert.doesNotMatch(eventView,/event-create-crew/);
});

test('les actions inscription restent contenues et côte à côte dans le résumé du départ',()=>{
  const css=read('styles/registration-sharing.css');
  assert.match(css,/summary>.ux-summary-registration-actions/);
  assert.match(css,/grid-column:4/);
  assert.match(css,/grid-row:1 \/ span 2/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/grid-column:2 \/ -1/);
  assert.match(css,/grid-row:3/);
});

test('le compte déconnecté garde Aide et Discord alignés horizontalement',()=>{
  const account=read('front/account-menu.mjs');
  const css=read('styles/account-menu.css');
  const game=read('game.html');
  assert.match(account,/account-disconnected-actions/);
  assert.match(css,/\.account-disconnected-actions\s*\{[^}]*display:\s*flex/s);
  assert.match(css,/\.account-disconnected-actions \.account-help-link\s*\{[^}]*width:\s*auto/s);
  assert.match(css,/white-space:\s*nowrap/);
  assert.match(game,/account-menu\.css\?v=3-disconnected-row/);
});

test('inscrire un autre pilote reste réservé à un compte connecté',()=>{
  const eventView=read('front/app/event-view.mjs');
  assert.match(eventView,/\$\{state\.user\?button\('new-registration','Inscrire un autre pilote'/);
});

test('Ajouter une catégorie est placé à côté de Fermer dans l’en-tête inscription',()=>{
  const registration=read('front/app/registration.mjs');
  const css=read('styles/registration-sharing.css');
  const game=read('game.html');
  assert.match(registration,/function renderAddCategoryAction/);
  assert.match(registration,/registration-workspace-actions/);
  assert.match(registration,/Ajouter une catégorie/);
  assert.match(registration,/stateDraft\.mode!=='category'/);
  assert.match(css,/\.registration-workspace-actions\{[^}]*display:flex/s);
  assert.match(game,/registration-sharing\.css\?v=\d+-[a-z0-9-]+/i);
});

test('Équipages est intégré directement dans chaque départ sans onglet séparé',()=>{
  const crews=read('front/app/crews.mjs');
  const eventView=read('front/app/event-view.mjs');
  assert.doesNotMatch(eventView,/event-section','Équipages'/);
  assert.match(eventView,/renderPilots\(event,departure\)/);
  assert.match(crews,/canManage\(\)\?managementCard/);
  assert.match(crews,/crew-management-accordion/);
  assert.match(crews,/data-crew-state-select/);
  assert.match(crews,/edit-crew/);
  assert.match(crews,/add-crew-pilot/);
  assert.match(crews,/remove-crew-pilot/);
  assert.match(crews,/logo\(crew\.category\)/);
});

test('les cartes pilotes et équipages utilisent les vrais logos de catégorie',()=>{
  const registration=read('front/app/registration.mjs');
  const crews=read('front/app/crews.mjs');
  const css=read('styles/registration-sharing.css');
  assert.match(registration,/pilot-category-logo[^`]*\$\{reg\.category\?logo\(reg\.category\):'—'\}/);
  assert.doesNotMatch(registration,/pilot-category-text/);
  assert.match(crews,/crew-compact-category[^`]*\$\{logo\(crew\.category\)\}/);
  assert.match(css,/\.pilot-main \.pilot-category-logo \.category-logo/);
});

test('le formulaire inscription est unique et compact',()=>{
  const registration=read('front/app/registration.mjs');
  assert.match(registration,/registration-identity-grid/);
  assert.match(registration,/Pilote souhaité/);
  assert.match(registration,/TOUTE LA COURSE/);
  assert.doesNotMatch(registration,/button\('availability','INDISPONIBLE'/);
  assert.match(registration,/renderAvailabilityTimeline\(\{departure,duration,status:stateDraft\.status,interactive:true/);
  assert.match(registration,/pilot-category-logo/);
});

test('Mes inscriptions restaure les grilles de 1 à 3 colonnes et les visuels catégorie',()=>{
  const entries=read('front/app/entries-view.mjs');
  assert.match(entries,/native-my-entry-card/);
  assert.match(entries,/Mes inscriptions personnelles/);
  assert.match(entries,/Inscriptions que je gère/);
  assert.match(entries,/Pilotes sans équipage/);
  assert.match(entries,/function pilotGridClass\(count\)/);
  assert.match(entries,/ux-my-pilot-grid-/);
  assert.match(entries,/ux-my-other-crews-grid/);
  assert.match(entries,/pilot-category-logo/);
  assert.match(entries,/categories\[crew\.category\]\?\.css/);
});
