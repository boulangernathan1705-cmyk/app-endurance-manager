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

function event(id, name, circuit, durationHours, departureId, startsAt) {
  return {
    id,
    name,
    circuit,
    duration_hours:durationHours,
    departures:JSON.stringify([{id:departureId,startsAt}])
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

test('une course en cours sans pilote inscrit n’est pas affichée', async () => {
  const now = Date.parse('2026-09-12T14:00:00Z');
  const currentStart = Date.parse('2026-09-12T13:00:00Z');
  const futureStart = Date.parse('2026-09-19T13:00:00Z');
  const events = [
    event(uuid,'6h de COTA','cota',6,departureUuid,currentStart),
    event(futureEventUuid,'6h suivante','spa',6,futureDepartureUuid,futureStart)
  ];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.nextDeparture.eventName,'6h suivante');
});

test('une course en cours apparaît dès qu’au moins un pilote est inscrit', async () => {
  const now = Date.parse('2026-09-12T14:00:00Z');
  const currentStart = Date.parse('2026-09-12T13:00:00Z');
  const events = [event(uuid,'6h de COTA','cota',6,departureUuid,currentStart)];
  const registrations = [{
    id:'55555555-5555-4555-8555-555555555555',
    event_id:uuid,
    departure_id:departureUuid,
    participant_id:'pilot-nathan',
    category:'Hypercar',
    status:'all',
    pilot_name:'Nathan'
  }];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events,registrations})},now);
  assert.equal(snapshot.currentDepartures.length,1);
  assert.equal(snapshot.currentDepartures[0].pilotCount,1);
  assert.deepEqual(snapshot.currentDepartures[0].unassignedPilots,['Nathan']);
  assert.equal(snapshot.nextDeparture,null);
});

test('après la course, le récap choisit le prochain départ futur même la semaine suivante', async () => {
  const now = Date.parse('2026-09-13T21:14:00Z'); // dimanche 23:14 à Paris
  const events = [
    event(uuid,'6h de COTA','cota',6,departureUuid,Date.parse('2026-09-12T13:00:00Z')),
    event(futureEventUuid,'6h semaine suivante','spa',6,futureDepartureUuid,Date.parse('2026-09-19T13:00:00Z'))
  ];
  const snapshot = await loadWeeklyDiscordSnapshot({DB:dbFixture({events})},now);
  assert.equal(snapshot.currentDepartures.length,0);
  assert.equal(snapshot.nextDeparture.eventName,'6h semaine suivante');
  assert.equal(snapshot.periodKey,'2026-09-14');
});

test('le message distingue course en cours et prochaine inscription avec les équipages', () => {
  const timestamp = Date.parse('2026-09-12T14:00:00Z');
  const current = {
    eventId:uuid,
    eventName:'8H Test en cours',
    circuit:'spa',
    durationHours:8,
    departureId:departureUuid,
    startsAt:Date.parse('2026-09-12T13:00:00Z'),
    pilotCount:2,
    unassignedPilots:['Pilote libre'],
    crews:[{
      id:uuid,
      name:'FMT #1',
      category:'Hypercar',
      car:'Toyota GR010 Hybrid',
      locked:true,
      pilots:['Nathan','@everyone']
    }]
  };
  const next = {
    eventId:futureEventUuid,
    eventName:'6H suivante',
    circuit:'cota',
    durationHours:6,
    departureId:futureDepartureUuid,
    startsAt:Date.parse('2026-09-19T13:00:00Z'),
    pilotCount:1,
    unassignedPilots:[],
    crews:[{
      id:futureEventUuid,
      name:'FMT #2',
      category:'GT3',
      car:'Ferrari 296 LMGT3',
      locked:false,
      pilots:['Josselin']
    }]
  };
  const payload = buildWeeklyDiscordPayload({currentDepartures:[current],nextDeparture:next},'https://endurance-manager.app/lmu/',timestamp);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  assert.match(payload.content,/Endurance Manager/);
  assert.match(payload.embeds[0].title,/Course en cours/);
  assert.match(payload.embeds[0].fields[0].name,/Complet/);
  assert.match(payload.embeds[0].fields[0].value,/Toyota GR010 Hybrid/);
  assert.match(payload.embeds[0].fields[1].value,/Pilote libre/);
  assert.match(payload.embeds[1].title,/Prochaine inscription/);
  assert.match(payload.embeds[1].fields[0].value,/Ferrari 296 LMGT3/);
  assert.match(payload.embeds[1].fields[0].value,/Josselin/);
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
