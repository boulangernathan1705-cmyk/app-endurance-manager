import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_CATALOGS, catalogForGame, gameForEvent} from '../shared/catalog.mjs';
import {validateEvent, validateRegistration} from '../server/core.mjs';

test('LMU et iRacing utilisent deux catalogues distincts', () => {
  const lmu = catalogForGame('lmu');
  const iracing = catalogForGame('iracing');
  assert.equal(lmu.name,'Le Mans Ultimate');
  assert.equal(iracing.name,'iRacing');
  assert(iracing.circuits.length > lmu.circuits.length);
  assert(lmu.categories.Hypercar);
  assert(iracing.categories.GTP);
  assert(iracing.cars.GT3.includes('Ferrari 296 GT3'));
  assert(!lmu.cars.GT3.includes('Ferrari 296 GT3'));
});

test('le jeu d’un événement est stable grâce au namespace de circuit', () => {
  assert.equal(gameForEvent({circuit:'daytona'}),'lmu');
  assert.equal(gameForEvent({circuit:'iracing-daytona'}),'iracing');
  assert.equal(gameForEvent({circuit:'iracing-tbd'}),'iracing');
  assert.equal(gameForEvent({circuit:''}),'lmu');
});

test('le serveur accepte les données endurance iRacing du catalogue partagé', () => {
  const event = validateEvent({
    name:'Daytona iRacing',
    durationHours:24,
    eventType:'special',
    circuit:'iracing-daytona',
    categories:['GTP','LMP2 P217','GT3'],
    departures:[{date:'2090-01-15',time:'14:00'}]
  });
  assert.equal(event.circuit,'iracing-daytona');
  assert.deepEqual(event.categories,['GTP','LMP2 P217','GT3']);
  const registration = validateRegistration({
    name:'Pilote',
    category:'GTP',
    cars:['Ferrari 499P'],
    status:'whole'
  }, {duration_hours:24,categories:JSON.stringify(event.categories)});
  assert.deepEqual(registration.cars,['Ferrari 499P']);
});

test('le portail expose les deux espaces et le contexte charge avant l’application', () => {
  const hub = readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game = readFileSync(new URL('../game.html',import.meta.url),'utf8');
  const build = readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert(hub.includes('href="/lmu/"'));
  assert(hub.includes('href="/iracing/"'));
  assert(hub.includes('/front/game-hub.mjs'));
  assert(game.indexOf('/front/game-context.js') < game.indexOf('/app.js'));
  assert(build.includes("new URL('lmu/index.html', out)"));
  assert(build.includes("new URL('iracing/index.html', out)"));
});

test('le résumé d’accueil affiche chaque équipage créé même sans pilote affecté', () => {
  const hub = readFileSync(new URL('../front/game-hub.mjs',import.meta.url),'utf8');
  assert.match(hub,/function hasVisibleActivity\(departure\)/);
  assert.match(hub,/activeRegistrations\(departure\)\.length > 0 \|\| \(departure\?\.crews \|\| \[\]\)\.length > 0/);
  assert.match(hub,/const crews = \[\.\.\.\(departure\.crews \|\| \[\]\)\]/);
  assert.match(hub,/Aucun pilote affecté/);
});

test('l’accueil suit le prochain événement jusqu’à sa fin et saute les départs vides si un départ actif existe', () => {
  const hub = readFileSync(new URL('../front/game-hub.mjs',import.meta.url),'utf8');
  assert.match(hub,/function eventBounds\(event\)/);
  assert.match(hub,/return remaining\.find\(hasVisibleActivity\) \|\| remaining\[0\]/);
  assert.match(hub,/item\.bounds && item\.bounds\.end > timestamp && item\.departure/);
  assert.match(hub,/const aStarted = a\.bounds\.start <= timestamp/);
  assert.match(hub,/Aucun participant/);
  assert.match(hub,/Aucun équipage formé/);
  assert.match(hub,/PROCHAIN DÉPART/);
});

test('les identifiants iRacing ne peuvent pas entrer en collision avec les circuits LMU', () => {
  const lmuIds = new Set(GAME_CATALOGS.lmu.circuits.map(item => item.id));
  for (const circuit of GAME_CATALOGS.iracing.circuits) {
    assert(circuit.id.startsWith('iracing-'));
    assert(!lmuIds.has(circuit.id));
  }
});
