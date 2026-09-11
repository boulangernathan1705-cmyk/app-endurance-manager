import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('la passe mobile est chargée en dernier sur le jeu et les membres',()=>{
  const game=read('game.html');
  const members=read('members.html');
  assert.match(game,/mobile-final\.css\?v=1-mobile-layout-pass/);
  assert.match(members,/mobile-final\.css\?v=1-mobile-layout-pass/);
  assert.ok(game.indexOf('mobile-final.css')>game.indexOf('mobile-timeline-compact.css'));
  assert.ok(members.indexOf('mobile-final.css')>members.indexOf('members-page.css'));
});

test('les pilotes sont sur deux colonnes sur téléphone mais reviennent à une colonne très étroite',()=>{
  const css=read('styles/mobile-final.css');
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/\.ux-crew-candidate-grid[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css,/\.ux-remaining-pilot-grid,[\s\S]*?\.ux-unassigned-grid[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width: 360px\)[\s\S]*grid-template-columns:\s*1fr/);
});

test('les optimisations mobile ne définissent aucun style desktop',()=>{
  const css=read('styles/mobile-final.css');
  assert.doesNotMatch(css,/@media\s*\(min-width/);
  assert.match(css,/\.event-actions-toolbar[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css,/\.members-context\s*\{\s*display:\s*none/);
  assert.match(css,/\.members-nav[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/s);
});
