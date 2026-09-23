import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('l’accueil principal n’affiche que les départs strictement futurs',()=>{
  const hub=read('front/game-hub.mjs');
  const html=read('index.html');

  assert.match(hub,/Number\(item\.startsAt\) > timestamp/);
  assert.doesNotMatch(hub,/Number\(item\.startsAt\) \+ bounds\.duration > timestamp/);
  assert.doesNotMatch(hub,/departureRunning/);
  assert.match(hub,/const label = eventStarted \? 'PROCHAIN DÉPART' : 'PROCHAINE ENDURANCE'/);
  assert.match(html,/game-hub\.mjs\?v=17-default-community/);
});
