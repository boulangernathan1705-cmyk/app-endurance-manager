import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent} from '../server/core.mjs';
import {buildCalendarPayload, buildAnnounceStream, buildAnnounceIntro} from '../server/discord-weekly-format.mjs';
import {streamUrl} from '../shared/stream.mjs';

const stream = details => ({name:'LES 6H DE SPA', format:'solo', sim:'stream', details, departures:[{date:'2090-10-15', time:'00:00'}]});

test('a stream needs one time and starts at the earliest of its times', () => {
  assert.throws(() => validateEvent(stream({})), /heure du stream/);
  assert.throws(() => validateEvent(stream({raceSim:'lmu'})), /heure du stream ou celle du départ/);
  const race = validateEvent(stream({streamTime:'19:45', raceSim:'lmu', raceTime:'20:00', streamUrl:'tondeuz'}));
  assert.equal(race.sim, 'stream');
  assert.equal(race.departures[0].time, '19:45');
  assert.deepEqual(race.details, {streamTime:'19:45', raceSim:'lmu', raceTime:'20:00', streamUrl:'https://www.twitch.tv/tondeuz'});
  assert.equal(race.capacity, null);
  // Only the race's start: it is the stream's start too.
  assert.equal(validateEvent(stream({raceSim:'iracing', raceTime:'21:00'})).departures[0].time, '21:00');
  // Not a race: no race time kept.
  assert.deepEqual(validateEvent(stream({streamTime:'18:00', raceTime:'20:00'})).details, {streamTime:'18:00'});
  assert.throws(() => validateEvent(stream({streamTime:'18:00', raceSim:'ams2'})), /LMU ou iRacing/);
  assert.throws(() => validateEvent(stream({streamTime:'18:00', streamUrl:'https://example.com/live'})), /Twitch, YouTube ou Kick/);
});

test('a stream stays a stream once created, and an event never becomes one', () => {
  const existing = {format:'solo', sim:'stream', departures:'[]'};
  assert.throws(() => validateEvent({...stream({streamTime:'19:00'}), sim:'lmu', rounds:[{circuit:'spa', durationMinutes:30}]}, existing), /reste un stream/);
  assert.throws(() => validateEvent(stream({streamTime:'19:00'}), {format:'solo', sim:'lmu', departures:'[]'}), /reste un stream/);
});

test('stream addresses: a Twitch name or a Twitch, YouTube or Kick channel', () => {
  assert.equal(streamUrl('@Tondeuz'), 'https://www.twitch.tv/tondeuz');
  assert.equal(streamUrl('youtube.com/@chaine'), 'https://youtube.com/@chaine');
  assert.equal(streamUrl('https://evil.example/twitch.tv'), null);
});

test('the week’s calendar and the morning announcement show the stream, its crew and its link', () => {
  const event = {id:'e1', name:'LES 6H DE SPA', sim:'stream', circuits:[''], startsAt:Date.UTC(2090, 9, 15, 17, 45), capacity:null, entered:0,
    stream:{streamTime:'19:45', raceSim:'lmu', raceTime:'20:00', streamUrl:'https://www.twitch.tv/tondeuz', crew:{eventName:'6h de Spa', crew:'Équipage A', pilots:['Pilote 1', 'Pilote 2']}}};
  const box = buildCalendarPayload({periodLabel:'semaine', events:[event]}, {url:'https://tdz.example'}).embeds[0].fields[0];
  assert.match(box.name, /^🎙/);
  assert.match(box.value, /📺 Stream 19h45 sur \[Twitch\]\(https:\/\/www\.twitch\.tv\/tondeuz\) · 🏁 Départ 20h00 · 🎮 LMU/);
  assert.match(box.value, /6h de Spa avec l’\*\*Équipage A\*\* · Pilote 1, Pilote 2/);
  assert.doesNotMatch(box.value, /places|personne/);
  const card = buildAnnounceStream(event, {url:'https://tdz.example'});
  assert.match(card.embeds[0].description, /Ce soir, c’est stream !/);
  assert.deepEqual(card.components, []);
  assert.match(buildAnnounceIntro({events:0, races:1, lives:1, streams:[]}).embeds[0].description, /1 endurance\*\* et \*\*1 stream/);
});
