import test from 'node:test';
import assert from 'node:assert/strict';
import {planIracingEvents, circuitFor, categoriesFor, cleanName, weekStarts} from '../server/iracing-import.mjs';
import {validateEvent} from '../server/core.mjs';
import {SEASON} from './fixtures/iracing-season.mjs';

const NOW = Date.parse('2026-09-28T12:00:00Z');

test('endurance series become one race per week with every official start, in Paris time', () => {
  const plans = planIracingEvents(SEASON, NOW);
  const imsa = plans.filter(plan => plan.externalId.startsWith('series:imsa-endurance-series:'));
  assert.deepEqual(imsa.map(plan => plan.externalId), ['series:imsa-endurance-series:2026-10-17'], 'past weeks are skipped');
  const race = imsa[0].input;
  assert.equal(race.circuit, 'iracing-long-beach');
  assert.equal(race.durationMinutes, 160);
  assert.equal(race.eventType, 'lmu');
  assert.equal(race.schedulePending, false);
  assert.deepEqual(race.categories, ['GTP','LMP2 P217','GT3']);
  // Saturday 2, 7, 18 GMT and Sunday 14 GMT = 4, 9, 20 and 16 in Paris (summer time).
  assert.deepEqual(race.departures, [{date:'2026-10-17',time:'04:00'},{date:'2026-10-17',time:'09:00'},{date:'2026-10-17',time:'20:00'},{date:'2026-10-18',time:'16:00'}]);
  assert.ok(validateEvent(race));
  assert.ok(!plans.some(plan => plan.input.name.startsWith('Formula')), 'sprints are not endurances');
  assert.ok(!plans.some(plan => plan.input.name.startsWith('IMSA Sportscar')), 'long races without driver changes are not imported');
});

test('a start in the repeated hour of the clock change is left out, not the whole race', () => {
  const race = planIracingEvents(SEASON, NOW).find(plan => plan.externalId.includes('production-endurance')).input;
  assert.deepEqual(race.departures.map(d => `${d.date} ${d.time}`), ['2026-10-24 06:00','2026-10-24 17:00','2026-10-25 21:00']);
  assert.ok(validateEvent(race));
});

test('special events are created with "Horaires à confirmer"; placeholder times of the schedule are ignored', () => {
  const plans = planIracingEvents(SEASON, NOW);
  const petit = plans.find(plan => plan.externalId.startsWith('special:petit-le-mans'));
  assert.equal(petit.input.circuit, 'iracing-road-atlanta', 'track taken from the schedule entry');
  assert.equal(petit.input.durationMinutes, 600);
  assert.equal(petit.input.schedulePending, true);
  assert.equal(petit.input.eventType, 'special');
  assert.equal(petit.input.departures.length, 1);
  assert.ok(!plans.some(plan => plan.externalId.startsWith('series:petit')), 'no race with 48 starts a day');
  const indy = plans.find(plan => plan.externalId.startsWith('special:indy-8hr')).input;
  assert.equal(indy.circuit, 'iracing-indianapolis');
  assert.equal(indy.durationMinutes, 480);
  assert.ok(!plans.some(plan => plan.externalId.includes('daytona-500')), 'NASCAR is not an endurance');
  for (const plan of plans) assert.ok(validateEvent(plan.input), plan.externalId);
});

test('names, tracks and classes of the schedule match the site catalog', () => {
  assert.equal(cleanName('Nurburgring Endurance Championship - 2026 Season'), 'Nurburgring Endurance Championship');
  assert.equal(cleanName('2026 Britcar 24 Presented by Cosworth'), 'Britcar 24');
  assert.equal(circuitFor('Nürburgring Combined - Gesamtstrecke VLN'), 'iracing-nordschleife');
  assert.equal(circuitFor('Nürburgring Grand-Prix-Strecke - BES/WEC'), 'iracing-nurburgring-gp');
  assert.equal(circuitFor('Autódromo José Carlos Pace - Grand Prix'), 'iracing-interlagos');
  assert.equal(circuitFor('Somewhere new'), 'iracing-tbd');
  assert.deepEqual(categoriesFor('Nürburgring 24h', 'GT3 // Porsche Cup // GT4 // TCR // BMW M2 CS Racing'), ['GT3','GT4','TCR','Porsche Cup','M2']);
  assert.deepEqual(weekStarts({date_start:'2026-10-17', date_end:'2026-10-18'}, {'5':['10:00']}), [Date.parse('2026-10-17T10:00:00Z')]);
});

test('special events missing from the schedule data are added, with their official duration', () => {
  const plans = planIracingEvents({championships:[], special_events:[
    {slug:'pcc-vir', name:'THE Production Car Challenge @ViR', date_start:'2099-12-18', date_end:'2099-12-19', track_name:'ViR Grand Course', car_class:'Production Car Challenge Cars'}
  ]}, NOW);
  assert.equal(plans.find(plan => plan.externalId.startsWith('special:pcc-vir')).input.durationMinutes, 240);
  const cup = plans.find(plan => plan.externalId.startsWith('special:992-endurance-cup'));
  assert.equal(cup.input.durationMinutes, 720);
  assert.deepEqual(cup.input.categories, ['Porsche Cup']);
});

test('special event time slots are read from the iracing.com article of the race week', async () => {
  const {articleFor, specialStarts} = await import('../server/iracing-import.mjs');
  const posts = [
    {date:'2099-09-21T10:00:25', title:{rendered:'THIS WEEK: iRacing Creventic Endurance Series at Barcelona (24H)'}, content:{rendered:'<p>Endurance</p>'}},
    {date:'2099-09-28T09:00:21', title:{rendered:'THIS WEEK: iRacing Bathurst 1000 presented by Next Level Racing | Special Event'},
      content:{rendered:'<ul><li>Timeslot #1: Saturday at 03:00 GMT on the Australian servers (11:00 p.m. ET Friday night)</li><li>Timeslot #2: Saturday at 7:00 GMT (3:00 a.m. ET)</li><li>Timeslot #5: Sunday at 00:00 GMT (8:00 p.m. ET Saturday)</li></ul>'}}
  ];
  const special = {name:'Bathurst 1000', dateStart:'2099-10-02', dateEnd:'2099-10-04'};
  const article = articleFor(posts, special);
  assert.match(article.title.rendered, /Bathurst 1000/);
  assert.equal(articleFor(posts, {name:'8 Hours of Indianapolis', dateStart:'2099-10-16', dateEnd:'2099-10-18'}), null, 'no article yet');
  assert.equal(articleFor(posts, {name:'Bathurst 1000', dateStart:'2099-12-02', dateEnd:'2099-12-04'}), null, 'an old article is not reused');
  assert.deepEqual(specialStarts(article.content.rendered, special.dateStart, special.dateEnd).map(start => new Date(start).toISOString()),
    ['2099-10-03T03:00:00.000Z','2099-10-03T07:00:00.000Z','2099-10-04T00:00:00.000Z']);
});
