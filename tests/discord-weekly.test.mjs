import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyDiscordPayload,
  isDepartureRelevant,
  isInParisWeek,
  isWeeklyDiscordMutation,
  nextParisWeek,
  parisWeek
} from '../server/discord-weekly-format.mjs';
import {loadWeeklyDiscordSnapshot, syncWeeklyDiscord} from '../server/discord-weekly.mjs';

const uuid = '11111111-1111-4111-8111-111111111111';
const departureUuid = '22222222-2222-4222-8222-222222222222';

function request(path, method='POST') {
  return new Request(`https://endurance-manager.app${path}`, {method});
}

function dbWithEvents(events) {
  return {
    prepare(sql) {
      if (sql.includes('FROM events')) return {all: async () => ({results: events})};
      if (sql.includes('FROM crews')) return {bind: () => ({all: async () => ({results: []})})};
      throw new Error(`Requête D1 inattendue dans le test: ${sql}`);
    }
  };
}

test('la semaine Discord suit lundi-dimanche en heure de Paris', () => {
  const sunday = Date.parse('2026-09-13T19:00:00Z');
  const mondayAfterMidnightParis = Date.parse('2026-09-13T22:30:00Z');
  assert.equal(parisWeek(sunday).key, '2026-09-07');
  assert.equal(nextParisWeek(sunday).key, '2026-09-14');
  assert.equal(parisWeek(mondayAfterMidnightParis).key, '2026-09-14');
  assert.equal(isInParisWeek(Date.parse('2026-09-12T12:00:00Z'), parisWeek(sunday)), true);
  assert.equal(isInParisWeek(Date.parse('2026-09-14T12:00:00Z'), parisWeek(sunday)), false);
});

test('une endurance terminée disparaît du récap même si elle appartient encore à la semaine', () => {
  const startsAt = Date.parse('2026-09-12T13:00:00Z'); // samedi 15:00 à Paris
  const week = parisWeek(Date.parse('2026-09-13T21:14:00Z'));
  assert.equal(isDepartureRelevant(startsAt, 6, week, Date.parse('2026-09-12T18:59:00Z')), true);
  assert.equal(isDepartureRelevant(startsAt, 6, week, Date.parse('2026-09-12T19:00:00Z')), false);
  assert.equal(isDepartureRelevant(startsAt, 6, week, Date.parse('2026-09-13T21:14:00Z')), false);
});

test('le dimanche soir sans course restante, le récap bascule sur la semaine suivante', async () => {
  const now = Date.parse('2026-09-13T21:14:00Z'); // dimanche 23:14 à Paris
  const events = [
    {
      id: uuid,
      name: '6h de COTA',
      circuit: 'cota',
      duration_hours: 6,
      departures: JSON.stringify([{id: departureUuid, startsAt: Date.parse('2026-09-12T13:00:00Z')}])
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: '6h semaine suivante',
      circuit: 'spa',
      duration_hours: 6,
      departures: JSON.stringify([{id: '44444444-4444-4444-8444-444444444444', startsAt: Date.parse('2026-09-19T13:00:00Z')}])
    }
  ];
  const snapshot = await loadWeeklyDiscordSnapshot({DB: dbWithEvents(events)}, now);
  assert.equal(snapshot.week.key, '2026-09-14');
  assert.equal(snapshot.departures.length, 1);
  assert.equal(snapshot.departures[0].eventName, '6h semaine suivante');
});

test('le message Discord résume les équipages sans autoriser les mentions', () => {
  const timestamp = Date.parse('2026-09-12T13:00:00Z');
  const snapshot = {
    week: parisWeek(timestamp),
    departures: [{
      eventId: uuid,
      eventName: '8H Test',
      circuit: 'spa',
      durationHours: 8,
      departureId: departureUuid,
      startsAt: timestamp,
      crews: [{
        id: uuid,
        name: 'FMT #1',
        category: 'Hypercar',
        car: 'Toyota GR010 Hybrid',
        locked: true,
        pilots: ['Nathan', '@everyone']
      }]
    }]
  };
  const payload = buildWeeklyDiscordPayload(snapshot, 'https://endurance-manager.app/lmu/', timestamp);
  assert.deepEqual(payload.allowed_mentions, {parse: []});
  assert.match(payload.content, /Endurances LMU/);
  assert.match(payload.embeds[0].fields[0].name, /Complet/);
  assert.match(payload.embeds[0].fields[0].value, /Toyota GR010 Hybrid/);
  assert.match(payload.embeds[0].fields[0].value, /Nathan/);
});

test('les mutations qui changent le résumé déclenchent une synchronisation', () => {
  assert.equal(isWeeklyDiscordMutation(request('/api/events')), true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}`, 'PATCH')), true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/registrations`)), true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/events/${uuid}/departures/${departureUuid}/crews`)), true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/registrations/${uuid}`, 'DELETE')), true);
  assert.equal(isWeeklyDiscordMutation(request(`/api/crews/${uuid}/members/${departureUuid}`, 'DELETE')), true);
  assert.equal(isWeeklyDiscordMutation(request('/api/auth/logout')), false);
  assert.equal(isWeeklyDiscordMutation(request('/api/events', 'GET')), false);
});

test('la synchronisation reste inactive tant que le webhook secret n’est pas configuré', async () => {
  assert.deepEqual(await syncWeeklyDiscord({}), {ok:false, skipped:'not-configured'});
});
