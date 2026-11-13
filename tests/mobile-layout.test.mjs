import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('la passe mobile est chargée en dernier sur le jeu et les membres',()=>{
  const game=read('game.html');
  const members=read('members.html');
  assert.match(game,/mobile-final\.css\?v=[^"']+/);
  assert.match(members,/mobile-final\.css\?v=[^"']+/);
  assert.ok(game.indexOf('mobile-final.css')>game.indexOf('mobile.css'));
  assert.ok(members.indexOf('mobile-final.css')>members.indexOf('members-page.css'));
});

test('les optimisations mobile ne définissent aucun style desktop',()=>{
  const css=read('styles/mobile-final.css');
  assert.doesNotMatch(css,/@media\s*\(min-width/);
});
