import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_CATALOGS, catalogForGame, gameForEvent} from '../shared/catalog.mjs';
import {validateEvent, validateRegistration} from '../server/core.mjs';

test('AC Rally events accept OPEN and SAFE with a typed stage and car', () => {
  for (const access of ['open','safe']) {
    const event=validateEvent({name:'Rally test',format:'solo',sim:'acrally',access,
      rounds:[{circuit:'Spéciale Alsace',durationMinutes:20,category:'Rally',car:'Lancia Delta'}],
      departures:[{date:'2090-10-15',time:'21:00'}]});
    assert.equal(event.sim,'acrally');
    assert.equal(event.access,access);
    assert.equal(event.rounds[0].circuit,'Spéciale Alsace');
    assert.equal(event.rounds[0].car,'Lancia Delta');
  }
});

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

test('les identifiants iRacing ne peuvent pas entrer en collision avec les circuits LMU', () => {
  const lmuIds = new Set(GAME_CATALOGS.lmu.circuits.map(item => item.id));
  for (const circuit of GAME_CATALOGS.iracing.circuits) {
    assert(circuit.id.startsWith('iracing-'));
    assert(!lmuIds.has(circuit.id));
  }
});

test('soirée ACRally : programme facultatif, lobby commun et accès lié', () => {
  const input={name:'Soirée rallye',format:'solo',sim:'acrally',access:'safe',
    rounds:[{circuit:'',durationMinutes:60,categories:[],capacity:12}],
    details:{type:'OPEN',password:'secret',rallyCarMode:'all',rallyHost:'Nathan',rallyStages:[]},
    departures:[{date:'2090-10-15',time:'21:00'}]};
  const event=validateEvent(input);
  assert.equal(event.circuit,'');assert.equal(event.capacity,12);assert.equal(event.access,'open');
  assert.equal(event.details.password,undefined);assert.deepEqual(event.details.rallyStages,[]);
  const safe=validateEvent({...input,details:{...input.details,type:'SAFE',rallyStages:['Saverne · reverse','Munster'],rallyCarMode:'car',rallyEstimatedMinutes:90},rounds:[{...input.rounds[0],car:'Peugeot 206 WRC'}]});
  assert.equal(safe.access,'safe');assert.equal(safe.details.password,'secret');assert.equal(safe.rounds.length,1);assert.equal(safe.circuit,'Saverne · reverse');assert.equal(safe.details.rallyEstimatedMinutes,90);
  assert.throws(()=>validateEvent({...input,rounds:[{...input.rounds[0],capacity:17}]}),/16/);
  assert.throws(()=>validateEvent({...input,details:{...input.details,rallyCarMode:'car'}}),/voiture imposée/);
  assert.throws(()=>validateEvent({...input,details:{...input.details,rallyStages:Array(21).fill('Saverne')}}),/20 spéciales/);
});


test('endurance categories and GT3 cars belong to the race simulator',()=>{
  const base={name:'Test',durationHours:6,eventType:'special',departures:[{date:'2090-01-15',time:'14:00'}]};
  assert.throws(()=>validateEvent({...base,circuit:'iracing-daytona',categories:['Hypercar']}),/simulateur/);
  assert.throws(()=>validateEvent({...base,circuit:'daytona',categories:['GTP']}),/simulateur/);
  const event={circuit:'iracing-daytona',duration_hours:6,categories:JSON.stringify(['GT3'])};
  const reg={name:'Pilote',category:'GT3',status:'whole'};
  assert.throws(()=>validateRegistration({...reg,cars:['Ferrari 296 LMGT3']},event),/voitures/);
  assert.deepEqual(validateRegistration({...reg,cars:['Ferrari 296 GT3']},event).cars,['Ferrari 296 GT3']);
});
