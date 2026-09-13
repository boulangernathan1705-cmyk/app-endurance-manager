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

const uuid = '11111111-1111-4111-8111-111111111111';
const departureUuid = '22222222-2222-4222-8222-222222222222';
const futureEventUuid = '33333333-3333-4333-8333-333333333333';
const futureDepartureUuid = '44444444-4444-4444-8444-444444444444';
const secondDepartureUuid = '55555555-5555-4555-8555-555555555555';
const registrationUuid = '66666666-6666-4666-8666-666666666666';
const crewUuid = '77777777-7777-4777-8777-777777777777';

function request(path, method='POST') {
  return new Request(`https://endurance-manager.app${path}`, {method});
}

function dbFixture({events=[], registrations=[], crews=[]}) {
  return {
    prepare(sql) {
      if (sql.includes('FROM events')) return {all: async () => ({results: events})};
      if (sql.includes('FROM registrations')) {
        return {bind: () => ({all: async () => ({results: registrations.filter(item => item.status !== 'unavailable')})})};
      }
      if (sql.includes('FROM crews')) return {bind: () => ({all: async () => ({results: crews})})};
      throw new Error(`Requête D1 inattendue dans le test: ${sql}`);
    }
  };
}

function event(id, name, circuit, durationHours, departures) {
  return {
    id,
    name,
    circuit,
    duration_hours:durationHours,
    departures:JSON.stringify(departures)
  };
}

function singleDepartureEvent(id, name, circuit, durationHours, departureId, startsAt) {
  return event(id,name,circuit,durationHours,[{id:departureId,startsAt}]);
}

function registration({eventId=uuid, departureId=departureUuid, name='Nathan'}={}) {
  return {
    id:registrationUuid,
    event_id:eventId,
    departure_id:departureId,
    participant_id:`pilot-${name.toLowerCase()}`,
    category:'Hypercar',
    status:'all',
    pilot_name:name
  };
}

function crewRow({eventId=uuid, departureId=departureUuid, name='FMT #1', pilot='Nathan'}={}) {
  return {
    id:crewUuid,
    event_id:eventId,
    departure_id:departureId,
    name,
    category:'Hypercar',
    car:'Toyota GR010 Hybrid',
    locked:1,
    registration_id:pilot ? registrationUuid : null,
    pilot_name:pilot || null
  };
}

test('la semaine utilitaire suit lundi-dimanche en heure de Paris', () => {
  const sunday = Date.parse('2026-09-13T19:00:00Z');
  const mondayAfterMidnightParis = Date.parse('2026-09-13T22:30:00Z');
  assert.equal(parisWeek(sunday).key, '2026-09-07');
  assert.equal(nextParisWeek(sunday).key, '2026-09-14');
  assert.equal(parisWeek(mondayAfterMidnightParis).key, '2026-09-14');
  assert.equal(isInParisWeek(Date.parse('2026-09-12T12:00:00Z'), parisWeek(sunday)), true);
  assert.equal(isInParisWeek(Date.parse('2026-09-14T12:00:00Z'), parisWeek(sunday)), false);
});

test('le récap garde tous les départs futurs de la semaine et retire ceux déjà passés', async () => {
  const now = Date.parse('2026-09-18T10:00:00Z');
  const events = [event(uuid,'4h SILVERSTONE','silverstone',4,[
    {id:'10000000-0000-4000-8000-000000000001',startsAt:Date.parse('2026-09-18T08:00:00Z')},
    {id:departureUuid,startsAt:Date.parse('2026-09-18T12:00:00Z')},
    {id:secondDepartureUuid,startsAt:Date.parse('2026-09-18T16:00:00Z')},
    {id:futureDepartureUuid,startsAt:Date.parse('2026-09-19T08:00:00Z')}
  ])];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,3);
  assert.deepEqual(snapshot.futureDepartures.map(item => item.departureId),[departureUuid,secondDepartureUuid,futureDepartureUuid]);
  assert.equal(snapshot.periodKey,'2026-09-14');
});

test('un départ déjà commencé sans équipage engagé disparaît même si un pilote était inscrit', async () => {
  const now = Date.parse('2026-09-18T14:00:00Z');
  const startsAt = Date.parse('2026-09-18T13:00:00Z');
  const events = [singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations:[registration()]})},now);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('un départ déjà commencé avec un équipage engagé reste affiché comme course en cours', async () => {
  const now = Date.parse('2026-09-18T14:00:00Z');
  const startsAt = Date.parse('2026-09-18T13:00:00Z');
  const events = [singleDepartureEvent(uuid,'4h SILVERSTONE','silverstone',4,departureUuid,startsAt)];
  const snapshot = await loadWeeklyDiscordSnapshot({
    DB:dbFixture({events,registrations:[registration()],crews:[crewRow()]})
  },now);
  assert.equal(snapshot.currentDepartures.length,1);
  assert.equal(snapshot.currentDepartures[0].crews.length,1);
  assert.deepEqual(snapshot.currentDepartures[0].crews[0].pilots,['Nathan']);
  assert.equal(snapshot.futureDepartures.length,0);
});

test('quand la semaine est terminée le récap affiche tous les départs de la prochaine semaine disponible', async () => {
  const now = Date.parse('2026-09-13T21:14:00Z'); // dimanche 23:14 à Paris
  const events = [
    singleDepartureEvent(uuid,'6h de COTA','cota',6,departureUuid,Date.parse('2026-09-12T13:00:00Z')),
    event(futureEventUuid,'4h SILVERSTONE','silverstone',4,[
      {id:futureDepartureUuid,startsAt:Date.parse('2026-09-18T10:00:00Z')},
      {id:secondDepartureUuid,startsAt:Date.parse('2026-09-19T10:00:00Z')}
    ])
  ];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.futureDepartures.length,2);
  assert.equal(snapshot.periodKey,'2026-09-14');
  assert.match(snapshot.periodLabel,/14 septembre/);
});

test('le message affiche les horaires seuls tant qu’aucun équipage n’est inscrit puis détaille les équipages', () => {
  const timestamp = Date.parse('2026-09-18T10:00:00Z');
  const current = {
    eventId:uuid,
    eventName:'8H Test en cours',
    circuit:'spa',
    durationHours:8,
    departureId:departureUuid,
    startsAt:Date.parse('2026-09-18T09:00:00Z'),
    unassignedPilots:[],
    crews:[{
      id:crewUuid,
      name:'FMT #1',
      category:'Hypercar',
      car:'Toyota GR010 Hybrid',
      locked:true,
      pilots:['Nathan']
    }]
  };
  const futureEmpty = {
    eventId:futureEventUuid,
    eventName:'4h SILVERSTONE',
    circuit:'silverstone',
    durationHours:4,
    departureId:futureDepartureUuid,
    startsAt:Date.parse('2026-09-18T12:00:00Z'),
    unassignedPilots:[],
    crews:[]
  };
  const futureWithCrew = {
    ...futureEmpty,
    departureId:secondDepartureUuid,
    startsAt:Date.parse('2026-09-18T16:00:00Z'),
    crews:[{
      id:'88888888-8888-4888-8888-888888888888',
      name:'Mrt blé',
      category:'LMP2 ELMS',
      car:'Oreca 07 Gibson ELMS',
      locked:false,
      pilots:['Etienne_48']
    }]
  };
  const payload = buildWeeklyDiscordPayload({
    currentDepartures:[current],
    futureDepartures:[futureEmpty,futureWithCrew],
    periodLabel:'semaine du 14 septembre au 20 septembre 2026'
  },'https://endurance-manager.app/lmu/',timestamp);

  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  assert.equal(payload.embeds.length,2);
  assert.match(payload.embeds[0].title,/Course en cours/);
  assert.match(payload.embeds[0].fields[0].value,/👤 Nathan/);
  assert.match(payload.embeds[1].title,/Départs disponibles/);
  assert.equal(payload.embeds[1].fields.length,2);
  assert.match(payload.embeds[1].fields[0].name,/vendredi 18 septembre à 14:00/i);
  assert.equal(payload.embeds[1].fields[0].value,'\u200b');
  assert.match(payload.embeds[1].fields[1].name,/vendredi 18 septembre à 18:00/i);
  assert.match(payload.embeds[1].fields[1].value,/Mrt blé/);
  assert.match(payload.embeds[1].fields[1].value,/👤 Etienne_48/);
  assert.doesNotMatch(payload.embeds[1].description,/pilotes? inscrits?/i);
});

test('les mutations qui changent le résumé déclenchent une synchronisation', () => {
  assert.equal(isWeeklyDiscordMutation(request('/api/events')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}`,'PATCH')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/registrations`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/crews`)),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/registrations/${uuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/crews/${uuid}/members/${departureUuid}`,'DELETE')),true);
  assert.equal(isWeeklyDiscordMutation(request('/api/auth/logout')),false);
  assert.equal(isWeeklyDiscordMutation(request('/api/events','GET')),false);
});

test('la synchronisation reste inactive tant que le webhook secret n’est pas configuré', async () => {
  assert.deepEqual(await syncWeeklyDiscord({}),{ok:false,skipped:'not-configured'});
});
