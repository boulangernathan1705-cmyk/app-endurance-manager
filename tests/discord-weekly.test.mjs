import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyDiscordPayload,
  isInParisWeek,
  isWeeklyDiscordMutation,
  nextParisWeek,
  parisWeek
} from '../server/discord-weekly-format.mjs';
import {loadWeeklyDiscordSnapshot, syncWeeklyDiscord} from '../server/discord-weekly.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const departureUuid='22222222-2222-4222-8222-222222222222';
const futureEventUuid='33333333-3333-4333-8333-333333333333';
const futureDepartureUuid='44444444-4444-4444-8444-444444444444';
const secondDepartureUuid='55555555-5555-4555-8555-555555555555';
const registrationUuid='66666666-6666-4666-8666-666666666666';
const crewUuid='77777777-7777-4777-8777-777777777777';

const COMMUNITY={id:'e0a1c0de-0000-4000-8000-000000000001',slug:'commu-dev',modules:{discordWeekly:true}};
function request(path,method='POST'){return new Request(`https://endurance-manager.app${path}`,{method});}
function dbFixture({events=[],registrations=[],crews=[]}){
  return{prepare(sql){
    // Events are read for one community (its id is the bound parameter).
    if(sql.includes('FROM events'))return{bind:communityId=>({all:async()=>({results:events.filter(item=>(item.community_id||COMMUNITY.id)===communityId)})})};
    if(sql.includes('FROM registrations'))return{bind:()=>({all:async()=>({results:registrations.filter(item=>item.status!=='unavailable')})})};
    if(sql.includes('FROM crews'))return{bind:()=>({all:async()=>({results:crews})})};
    throw new Error(`Requête D1 inattendue dans le test: ${sql}`);
  }};
}
function event(id,name,circuit,durationHours,departures){return{id,name,circuit,duration_hours:durationHours,departures:JSON.stringify(departures)};}
function singleDepartureEvent(id,name,circuit,durationHours,departureId,startsAt){return event(id,name,circuit,durationHours,[{id:departureId,startsAt}]);}
function registration({eventId=uuid,departureId=departureUuid,name='Nathan'}={}){return{id:registrationUuid,event_id:eventId,departure_id:departureId,participant_id:`pilot-${name.toLowerCase()}`,category:'Hypercar',status:'all',pilot_name:name};}
function crewRow({eventId=uuid,departureId=departureUuid,name='Équipe #1',pilot='Nathan'}={}){return{id:crewUuid,event_id:eventId,departure_id:departureId,name,category:'Hypercar',car:'Toyota GR010 Hybrid',locked:1,registration_id:pilot?registrationUuid:null,pilot_name:pilot||null};}

test('la semaine utilitaire suit lundi-dimanche en heure de Paris',()=>{
  const sunday=Date.parse('2026-09-13T19:00:00Z');
  const mondayAfterMidnightParis=Date.parse('2026-09-13T22:30:00Z');
  assert.equal(parisWeek(sunday).key,'2026-09-07');
  assert.equal(nextParisWeek(sunday).key,'2026-09-14');
  assert.equal(parisWeek(mondayAfterMidnightParis).key,'2026-09-14');
  assert.equal(isInParisWeek(Date.parse('2026-09-12T12:00:00Z'),parisWeek(sunday)),true);
  assert.equal(isInParisWeek(Date.parse('2026-09-14T12:00:00Z'),parisWeek(sunday)),false);
});

test('le récap garde tous les départs futurs de la semaine et retire ceux déjà passés',async()=>{
  const now=Date.parse('2026-09-18T10:00:00Z');
  const events=[event(uuid,'4h SILVERSTONE','silverstone',4,[
    {id:'10000000-0000-4000-8000-000000000001',startsAt:Date.parse('2026-09-18T08:00:00Z')},
    {id:departureUuid,startsAt:Date.parse('2026-09-18T12:00:00Z')},
    {id:secondDepartureUuid,startsAt:Date.parse('2026-09-18T16:00:00Z')},
    {id:futureDepartureUuid,startsAt:Date.parse('2026-09-19T08:00:00Z')}
  ])];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,3);
  assert.deepEqual(snapshot.futureDepartures.map(item=>item.departureId),[departureUuid,secondDepartureUuid,futureDepartureUuid]);
  assert.equal(snapshot.periodKey,'2026-09-14');
});

test('un départ déjà commencé sans équipage engagé disparaît même si un pilote était inscrit',async()=>{
  const now=Date.parse('2026-09-18T14:00:00Z');
  const startsAt=Date.parse('2026-09-18T13:00:00Z');
  const events=[singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations:[registration()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('un départ déjà commencé avec un équipage engagé reste affiché comme course en cours',async()=>{
  const now=Date.parse('2026-09-18T14:00:00Z');
  const startsAt=Date.parse('2026-09-18T13:00:00Z');
  const events=[singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations:[registration()],crews:[crewRow()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,1);
  assert.equal(snapshot.currentDepartures[0].crews.length,1);
  assert.deepEqual(snapshot.currentDepartures[0].crews[0].pilots,['Nathan']);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('quand la semaine est terminée le récap affiche tous les départs de la prochaine semaine disponible',async()=>{
  const now=Date.parse('2026-09-13T21:14:00Z');
  const events=[
    singleDepartureEvent(uuid,'6h de COTA','cota',6,departureUuid,Date.parse('2026-09-12T13:00:00Z')),
    event(futureEventUuid,'4h SILVERSTONE','silverstone',4,[
      {id:futureDepartureUuid,startsAt:Date.parse('2026-09-18T10:00:00Z')},
      {id:secondDepartureUuid,startsAt:Date.parse('2026-09-19T10:00:00Z')}
    ])
  ];
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,2);
  assert.equal(snapshot.periodKey,'2026-09-14');
  assert.match(snapshot.periodLabel,/14 septembre/);
});

test('le message : un bloc par course, dont le nom mène à la course sur le site de la communauté',()=>{
  const timestamp=Date.parse('2026-09-18T10:00:00Z');
  const current={eventId:uuid,eventName:'8H Test en cours',eventType:'lmu',circuit:'spa',durationHours:8,departureId:departureUuid,startsAt:Date.parse('2026-09-18T09:00:00Z'),unassignedPilots:[],crews:[{id:crewUuid,name:'Équipe #1',category:'Hypercar',car:'Toyota GR010 Hybrid',locked:true,pilots:['Nathan']}]};
  const futureEmpty={eventId:futureEventUuid,eventName:'4h SILVERSTONE (horaires non définis par LMU)',eventType:'special',circuit:'silverstone',durationHours:4,departureId:futureDepartureUuid,startsAt:Date.parse('2026-09-18T12:00:00Z'),unassignedPilots:[],crews:[]};
  const futureWithCrew={...futureEmpty,departureId:secondDepartureUuid,startsAt:Date.parse('2026-09-18T16:00:00Z'),unassignedPilots:['Léo'],crews:[{id:'88888888-8888-4888-8888-888888888888',name:'Mrt blé',category:'LMP2 ELMS',car:'Oreca 07 Gibson ELMS',locked:false,pilots:['Etienne_48']}]};
  const iracing={eventId:'99999999-9999-4999-8999-999999999999',eventName:'IMSA Endurance',eventType:'lmu',circuit:'iracing-spa',durationHours:6,departureId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',startsAt:Date.parse('2026-09-19T12:00:00Z'),unassignedPilots:[],crews:[]};
  const site={url:'https://team-rookie.endurance-manager.app',name:'Team Rookie',logoUrl:'https://cdn.discordapp.com/icons/1/abc.png',bannerUrl:'https://team-rookie.endurance-manager.app/images/endurance-manager-banner.webp'};
  const payload=buildWeeklyDiscordPayload({currentDepartures:[current],futureDepartures:[futureEmpty,futureWithCrew,iracing],periodLabel:'semaine du 14 septembre au 20 septembre 2026'},site,timestamp,'all');
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  const [header,running,silverstone,imsa]=payload.embeds;
  assert.equal(payload.embeds.length,4,'a header, then one block per race');
  assert.match(header.title,/^📝 Semaine du 14 septembre au 20 septembre 2026$/);
  assert.equal(header.author.name,'Team Rookie');assert.equal(header.author.icon_url,site.logoUrl);
  assert.match(running.title,/En cours — 8H Test en cours/);
  // Each race name links to the race itself, on the community's site, in its simulator's space.
  assert.equal(running.url,`${site.url}/lmu/#event=${uuid}`);
  assert.equal(silverstone.url,`${site.url}/lmu/#event=${futureEventUuid}`);
  assert.equal(imsa.url,`${site.url}/iracing/#event=99999999-9999-4999-8999-999999999999`);
  assert.notEqual(silverstone.color,imsa.color,'the bar has the colour of the simulator');
  assert.equal((JSON.stringify(payload).match(/4h SILVERSTONE/g)||[]).length,1,'one block for the race and its two starts');
  assert.equal(silverstone.fields.length,2,'the start with entries, then one line for the empty one');
  assert.match(silverstone.description,/Horaires non définis par LMU/);
  // Times in each reader's own time zone.
  assert.match(silverstone.fields[0].value,/<t:1789747200:F>/);
  assert.match(silverstone.fields[0].value,/Mrt blé/);assert.match(silverstone.fields[0].value,/👤 Etienne\\_48/);
  assert.match(silverstone.fields[0].value,/Sans équipage : Léo/);
  assert.match(silverstone.fields[1].value,/^➕ 1 autre départ sans inscrit · \[voir la course\]/);
  assert.doesNotMatch(JSON.stringify(silverstone),/Départ \d/,'no « Départ 1, Départ 2 » headings');
  const last=payload.embeds.at(-1);
  assert.equal(last.image.url,site.bannerUrl);assert.match(last.footer.text,/mise à jour à 12:00/);
  // Every link of the message goes to the community's own site.
  for(const url of JSON.stringify(payload).match(/https?:\/\/[^"\s)]+/g).filter(url=>!url.startsWith('https://cdn.discordapp.com/')))
    assert.ok(url.startsWith(site.url+'/'),url);
});

test('beaucoup de courses : 10 blocs au plus, les autres listées avec leur lien',()=>{
  const races=Array.from({length:12},(_,i)=>({eventId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,eventName:`Course ${i+1}`,circuit:'spa',durationHours:4,departureId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,startsAt:Date.parse('2026-09-19T12:00:00Z')+i*3600000,unassignedPilots:[],crews:[]}));
  const payload=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:races,periodLabel:'semaine'},{url:'https://a.endurance-manager.app'},Date.now());
  assert.ok(payload.embeds.length<=10);
  const rest=payload.embeds.at(-1);
  assert.equal(rest.title,'Autres courses de la semaine');
  assert.match(rest.description,/\[Course 12\]\(https:\/\/a\.endurance-manager\.app\/lmu\/#event=00000000-0000-4000-8000-000000000011\)/);
});

test('les mutations qui changent le résumé déclenchent une synchronisation',()=>{
  assert.equal(isWeeklyDiscordMutation(request('/api/events')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}`,'PATCH')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/registrations`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/crews`)),true);
  assert.equal(isWeeklyDiscordMutation(request('/api/races')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/races/${uuid}/departures/${departureUuid}/registrations`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/registrations/${uuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/crews/${uuid}/members/${departureUuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request('/api/auth/logout')),false);
  assert.equal(isWeeklyDiscordMutation(request('/api/events','GET')),false);
});

test('la synchronisation reste inactive tant que le webhook secret n’est pas configuré',async()=>{
  assert.deepEqual(await syncWeeklyDiscord({}),{ok:false,skipped:'not-configured'});
});

test('une course « Horaires à confirmer » n’est jamais annoncée en cours et son heure provisoire n’est pas publiée',async()=>{
  const now=Date.parse('2026-10-03T23:30:00Z');
  const pending={...event(uuid,'6h FUJI','fuji',6,[{id:departureUuid,startsAt:Date.parse('2026-10-03T22:00:00Z')},{id:secondDepartureUuid,startsAt:Date.parse('2026-10-04T22:00:00Z')}]),schedule_pending:1};
  const snapshot=await loadWeeklyDiscordSnapshot({DB:dbFixture({events:[pending],registrations:[registration()],crews:[crewRow()]})},now,COMMUNITY);
  assert.equal(snapshot.currentDepartures.length,0,'placeholder 0:00 start is not "en cours"');
  const payload=JSON.stringify(buildWeeklyDiscordPayload(snapshot,{url:'https://endurance-manager.app'},now));
  // Only the day is shown (in the reader's time zone), never the placeholder time.
  assert.match(payload,/<t:\d+:D> — horaire à confirmer/);
  assert.doesNotMatch(payload,/<t:\d+:F>/);
});

test('un événement spécial à 15 départs : seuls les départs avec des inscrits sont détaillés',()=>{
  const base={eventId:'12121212-1212-4121-8121-121212121212',eventName:'6h de Fuji',eventType:'special',circuit:'fuji',durationHours:6};
  const departures=Array.from({length:15},(_,i)=>({...base,departureId:`34343434-3434-4343-8343-${String(i).padStart(12,'0')}`,startsAt:Date.parse('2026-10-02T05:00:00Z')+i*5*3600000,unassignedPilots:[],crews:[]}));
  departures[7].crews=[{id:'56565656-5656-4565-8565-565656565656',name:'FMT 001',category:'GT3',car:'',locked:false,pilots:['Etienne_48']}];
  departures[7].unassignedPilots=['Nathan'];
  const [,fuji]=buildWeeklyDiscordPayload({currentDepartures:[],futureDepartures:departures,periodLabel:'semaine'},{url:'https://fmt.endurance-manager.app'},Date.parse('2026-09-29T10:00:00Z')).embeds;
  assert.equal(fuji.fields.length,2);
  assert.match(fuji.fields[0].value,/FMT 001/);assert.match(fuji.fields[0].value,/Sans équipage : Nathan/);
  assert.match(fuji.fields[1].value,/➕ 14 autres départs sans inscrit/);
  assert.doesNotMatch(JSON.stringify(fuji),/Personne d’inscrit/);
});
