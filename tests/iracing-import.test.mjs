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
  assert.deepEqual(race.departures.map(({date,time})=>({date,time})), [{date:'2026-10-17',time:'04:00'},{date:'2026-10-17',time:'09:00'},{date:'2026-10-17',time:'20:00'},{date:'2026-10-18',time:'16:00'}]);
  assert.ok(validateEvent(race));
  assert.ok(!plans.some(plan => plan.input.name.startsWith('Formula')), 'sprints are not endurances');
  assert.ok(plans.some(plan => plan.input.name.startsWith('IMSA Sportscar')&&plan.input.format==='solo'), 'solo endurances use the solo calendar');
});

test('official UTC starts survive the repeated Paris hour without guessing a manual time', () => {
  const race = planIracingEvents(SEASON, NOW).find(plan => plan.externalId.includes('production-endurance')).input;
  assert.deepEqual(race.departures.map(d => `${d.date} ${d.time}`), ['2026-10-24 06:00','2026-10-24 17:00','2026-10-25 02:00','2026-10-25 21:00']);
  const imported=validateEvent(race,null,{officialImport:true});
  assert.equal(imported.departures[2].startsAt,Date.parse('2026-10-25T00:00:00Z'));
  assert.throws(()=>validateEvent(race),/ambiguë/);
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
  for (const plan of plans) assert.ok(validateEvent(plan.input,null,{officialImport:true}), plan.externalId);
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

test('a special event article using the short name of the slug is found (Indy 8 Hour)', async () => {
  const {articleFor, specialStarts} = await import('../server/iracing-import.mjs');
  const posts = [{date:'2099-10-12T09:00:00', title:{rendered:'THIS WEEK: iRacing Indy 8 Hour presented by PC&#8217;s by THOMAS | Special Event'},
    content:{rendered:'<li>Timeslot #1: Friday at 22:00 GMT (6:00 p.m. ET)</li><li>Timeslot #2: Saturday at 07:00 GMT (3:00 a.m. ET)</li><li>Timeslot #3: Saturday at 12:00 GMT (8:00 a.m. ET)</li><li>Timeslot #4: Saturday at 16:00 GMT (12:00 p.m. ET)</li><li>Timeslot #5: Sunday at 00:00 GMT (8:00 p.m. ET Saturday)</li>'}}];
  const special = {name:'8 Hours of Indianapolis', slug:'indy-8hr', dateStart:'2099-10-16', dateEnd:'2099-10-18'};
  const article = articleFor(posts, special);
  assert.ok(article);
  assert.equal(specialStarts(article.content.rendered, special.dateStart, special.dateEnd).length, 5);
  const two = [...posts, {date:'2099-10-12T10:00:00', title:{rendered:'THIS WEEK: iRacing Bathurst 1000 | Special Event'}, content:{rendered:''}}];
  assert.match(articleFor(two, special).title.rendered, /Indy/);
  assert.match(articleFor(two, {name:'Bathurst 1000', slug:'bathurst-1000', dateStart:'2099-10-16', dateEnd:'2099-10-18'}).title.rendered, /Bathurst/);
});

test('a special event article with another name is still found when it is the only one of the race week', async () => {
  const {articleFor} = await import('../server/iracing-import.mjs');
  const posts = [{date:'2099-10-12T09:00:00', title:{rendered:'THIS WEEK: iRacing Brickyard Sprint presented by Someone | Special Event'}, content:{rendered:''}}];
  const special = {name:'8 Hours of Indianapolis', slug:'indy-8hr', dateStart:'2099-10-16', dateEnd:'2099-10-18'};
  assert.ok(articleFor(posts, special));
  assert.equal(articleFor([...posts, {...posts[0], title:{rendered:'THIS WEEK: Other Race | Special Event'}}], special), null, 'two articles: no guess');
  assert.equal(articleFor([{...posts[0], date:'2099-10-08T09:00:00'}], special), null, 'last week article is not taken');
});

test('a lap race whose schedule entry gives a few minutes keeps a real duration (Bathurst 1000)', () => {
  const HALF_HOURS = Array.from({length:48}, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const plans = planIracingEvents({
    championships:[{name:'2026 Bathurst 1000 AU Presented by Next Level Racing', category:'SPORTS CAR', typical_session_duration_minutes:15,
      session_times_by_day:Object.fromEntries(Array.from({length:7}, (_, day) => [String(day), HALF_HOURS])),
      weeks:[{week_number:1, track_name:'Mount Panorama Circuit', date_start:'2099-10-03', date_end:'2099-10-09', duration_minutes:null}]}],
    special_events:[{slug:'bathurst-1000', name:'Bathurst 1000', date_start:'2099-10-02', date_end:'2099-10-04', track_name:'Mount Panorama Circuit', car_class:'Supercars'}]
  }, NOW);
  const bathurst = plans.filter(plan => plan.externalId.startsWith('special:bathurst-1000'));
  assert.equal(bathurst.length, 1, 'one race, not one per schedule entry');
  assert.equal(bathurst[0].input.durationMinutes, 360);
  assert.ok(validateEvent(bathurst[0].input));
});

test('a special event listed as a series with real-looking times still gives one race', () => {
  const plans = planIracingEvents({
    championships:[{name:'2099 Bathurst 1000 AU', category:'SPORTS CAR', typical_session_duration_minutes:400, session_times_by_day:{'5':['03:00','12:00']},
      weeks:[{week_number:1, track_name:'Mount Panorama Circuit', date_start:'2099-10-03', date_end:'2099-10-09', duration_minutes:400}]}],
    special_events:[{slug:'bathurst-1000', name:'Bathurst 1000', date_start:'2099-10-02', date_end:'2099-10-04', track_name:'Mount Panorama Circuit', car_class:'Supercars'}]
  }, NOW);
  assert.deepEqual(plans.filter(plan => /bathurst/.test(plan.externalId)).map(plan => plan.externalId), ['special:bathurst-1000:2099-10-02']);
  assert.equal(plans.find(plan => /bathurst/.test(plan.externalId)).input.durationMinutes, 400);
});

test('an event name made of generic words is found by its whole name', async () => {
  const {articleFor} = await import('../server/iracing-import.mjs');
  const posts = [
    {date:'2099-11-23T09:00:00', title:{rendered:'THIS WEEK: iRacing Creventic Endurance Series at Spa'}, content:{rendered:''}},
    {date:'2099-11-23T10:00:00', title:{rendered:'THIS WEEK: iRacing 992 Endurance Cup presented by Porsche | Special Event'}, content:{rendered:''}}
  ];
  assert.match(articleFor(posts, {name:'992 Endurance Cup', dateStart:'2099-11-27', dateEnd:'2099-11-29'}).title.rendered, /992 Endurance Cup/);
  assert.equal(articleFor(posts.slice(0, 1), {name:'992 Endurance Cup', dateStart:'2099-11-27', dateEnd:'2099-11-29'}), null);
});

test('a regular series is never taken for a special event with a similar name', () => {
  const plans = planIracingEvents({
    championships:[{name:'Production Endurance Challenge', category:'SPORTS CAR', typical_session_duration_minutes:120, session_times_by_day:{'4':['19:00'],'5':['07:00']},
      weeks:[{week_number:1, track_name:'Snetterton Circuit - 300', date_start:'2099-10-02', date_end:'2099-10-08', duration_minutes:120},
             {week_number:2, track_name:'Silverstone Circuit - International', date_start:'2099-10-09', date_end:'2099-10-15', duration_minutes:120}]}],
    special_events:[{slug:'pcc-vir', name:'THE Production Car Challenge @ViR', date_start:'2099-10-02', date_end:'2099-10-03', track_name:'ViR Grand Course', car_class:'Production Car Challenge Cars'}]
  }, NOW);
  assert.equal(plans.filter(plan => plan.externalId.startsWith('series:production-endurance-challenge')).length, 2);
  assert.equal(plans.filter(plan => plan.externalId.startsWith('special:pcc-vir')).length, 1);
});


test('Gilles-Villeneuve accepts the hyphenated name and track data wins over the event name',()=>{
  assert.equal(circuitFor('Circuit Gilles-Villeneuve'),'iracing-montreal');
  assert.equal(circuitFor('Circuit Gilles Villeneuve'),'iracing-montreal');
  assert.equal(circuitFor('Circuit Gilles-Villeneuve','Road America special'),'iracing-montreal');
  assert.equal(circuitFor(null,'Circuit de Spa-Francorchamps','Road America special'),'iracing-spa');
});

test('solo endurance series keep the four starts together, with their own categories',()=>{
  const series={category:'SPORTS CAR',typical_session_duration_minutes:120,session_times_by_day:{'5':['04:00','15:00'],'6':['00:00','20:00']},weeks:[{date_start:'2099-10-17',date_end:'2099-10-23',track_name:'Summit Point Raceway',duration_minutes:120}]};
  const plans=planIracingEvents({championships:[{...series,name:'IMSA Michelin Pilot Challenge'},{...series,name:'IMSA Sportscar Endurance Challenge'}]},NOW).filter(plan=>plan.input.format==='solo');
  assert.equal(plans.length,2);
  for(const plan of plans){
    assert.ok(plan.externalId.startsWith('solo-series:'));
    assert.equal(plan.input.departures.length,4);
    assert.equal(plan.input.rounds.length,1);
    assert.equal(plan.input.sim,'iracing');
    assert.ok(validateEvent(plan.input,null,{officialImport:true}));
    assert.throws(()=>validateEvent(plan.input),/seul départ/,'community solo events retain the one-start rule');
  }
  assert.deepEqual(plans[0].input.rounds[0].categories,['GT4','TCR']);
  assert.deepEqual(plans[1].input.rounds[0].categories,['LMP3 P320','GT4']);
});

test('invalid source clock values are ignored and duplicate slots do not drop a race',()=>{
  const starts=weekStarts({date_start:'2099-10-17',date_end:'2099-10-17'},{'5':['04:00','04:00','24:00','12:99','oops']});
  assert.deepEqual(starts,[Date.parse('2099-10-17T04:00:00Z')]);
});

test('992 Endurance Cup uses the officially announced Spa circuit and Creventic classes omit TCR',()=>{
  const plan=planIracingEvents({championships:[],special_events:[]},NOW).find(p=>p.input.name==='992 Endurance Cup');
  assert.equal(plan.input.circuit,'iracing-spa');
  assert.deepEqual(categoriesFor('Creventic Endurance Series'),['GT3','Porsche Cup','GT4']);
});


test('solo import requires a verified endurance series and at least 90 minutes of racing',()=>{
  const base={name:'IMSA Michelin Pilot Challenge',category:'SPORTS CAR',session_times_by_day:{'5':['04:00']},weeks:[{date_start:'2099-10-17',date_end:'2099-10-23',track_name:'Spa'}]};
  const solo=series=>planIracingEvents({championships:[series]},NOW).filter(plan=>plan.input.format==='solo');
  for(const minutes of [30,60,89])assert.equal(solo({...base,typical_session_duration_minutes:minutes}).length,0);
  for(const minutes of [90,120])assert.equal(solo({...base,typical_session_duration_minutes:minutes}).length,1);
  assert.equal(solo({...base,name:'GT Sprint Championship',typical_session_duration_minutes:180}).length,0);
  assert.equal(solo({...base,typical_session_duration_minutes:120,weeks:[{...base.weeks[0],duration_minutes:60}]}).length,0,'race duration wins over the typical session length');
});
