import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('community settings are reachable before choosing a simulator',()=>{
  assert.match(read('index.html'),/href="\/communities.html">Paramètres communautés/);
  assert.match(read('front/game-hub.mjs'),/href="\/communities.html\?/);
  assert.match(read('scripts/build.mjs'),/new URL\('communities.html', out\)/);
  assert.doesNotMatch(read('front/app/home-view.mjs'),/renderPaddockPulse|ownFutureRows|MON PROCHAIN ENGAGEMENT/);
});

test('community settings load session only, not simulator events or participants',async()=>{
  const source=read('front/app/core.mjs');
  const fn=source.slice(source.indexOf('export async function load()'),source.indexOf('export function showError')).replace('export ','');
  const calls=[],state={};
  const context=vm.createContext({state,URLSearchParams,location:{pathname:'/communities.html',search:''},api:async path=>{calls.push(path);return {user:{name:'Nathan'},organizations:{communities:[]}};},preferredCommunityId:()=>null,communityById:()=>null,gameForEvent:()=>null,activeGame:'lmu'});
  await vm.runInContext(fn+';load()',context);
  assert.deepEqual(calls,['/api/session']);
});
