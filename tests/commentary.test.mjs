import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent} from '../server/core.mjs';
import {buildCalendarPayload} from '../server/discord-weekly-format.mjs';
import {streamUrl, streamLabel, isWatchOnly, commentaryOf} from '../shared/commentary.mjs';

const input = {name:'Championnat · Manche 3',format:'solo',sim:'lmu',access:'safe',details:{password:'secret'},rounds:[{circuit:'spa',durationMinutes:60,categories:[],capacity:20}],departures:[{date:'2090-10-15',time:'20:00'}]};

test('a channel name is a Twitch channel; only Twitch, YouTube and Kick addresses are kept', () => {
  assert.equal(streamUrl('Tondeuz'), 'https://www.twitch.tv/tondeuz');
  assert.equal(streamUrl('twitch.tv/tondeuz'), 'https://twitch.tv/tondeuz');
  assert.equal(streamUrl('https://www.youtube.com/@tondeuz'), 'https://www.youtube.com/@tondeuz');
  assert.equal(streamUrl('https://evil.example/tondeuz'), null);
  assert.equal(streamUrl('javascript:alert(1)'), null);
  assert.equal(streamUrl(''), null);
  assert.equal(streamLabel('https://www.twitch.tv/tondeuz'), 'twitch.tv/tondeuz');
});

test('a commented event keeps its entries; a commentary only drops places and password', () => {
  const race = validateEvent({...input,details:{...input.details,commentary:{mode:'race',stream:'tondeuz'}}});
  assert.deepEqual(race.details.commentary, {mode:'race',stream:'https://www.twitch.tv/tondeuz'});
  assert.equal(race.capacity, 20);
  assert.equal(isWatchOnly(race), false);
  const watch = validateEvent({...input,details:{...input.details,commentary:{mode:'watch',stream:'tondeuz'}}});
  assert.equal(isWatchOnly(watch), true);
  assert.equal(watch.capacity, null);
  assert.equal(watch.rounds[0].capacity, undefined);
  assert.equal(watch.details.password, undefined);
  assert.throws(() => validateEvent({...input,details:{commentary:{mode:'watch',stream:'https://evil.example/x'}}}), /chaîne/);
  assert.throws(() => validateEvent({...input,details:{commentary:{mode:'other',stream:'tondeuz'}}}), /commentary/);
  assert.equal(commentaryOf(validateEvent(input)), null);
});

test('the week calendar shows the stream, and no places for a commentary only', () => {
  const event = {id:'e1',name:'Manche 3',sim:'lmu',circuits:['spa'],startsAt:Date.UTC(2090,9,15,18),capacity:null,entered:0};
  const watch = buildCalendarPayload({events:[{...event,commentary:{mode:'watch',stream:'https://www.twitch.tv/tondeuz'}}]},{url:'https://tdz.example'}).embeds[0].description;
  assert.match(watch, /🎙 Commentary · \[Regarder le stream\]\(https:\/\/www\.twitch\.tv\/tondeuz\)/);
  assert.doesNotMatch(watch, /inscrit/);
  const race = buildCalendarPayload({events:[{...event,commentary:{mode:'race',stream:'https://www.twitch.tv/tondeuz'}}]},{}).embeds[0].description;
  assert.match(race, /Personne d’inscrit/);
  assert.match(race, /Commenté en direct/);
});
