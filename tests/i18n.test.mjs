import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translateTextForLocale,localeTag} from '../front/i18n.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('les libellés principaux existent en anglais',()=>{
  assert.equal(translateTextForLocale('Événements','en'),'Events');
  assert.equal(translateTextForLocale('Départs passés','en'),'Past starts');
  assert.equal(translateTextForLocale('3 pilotes inscrits','en'),'3 registered drivers');
  assert.equal(translateTextForLocale('Équipage complet','en'),'Crew complete');
  assert.equal(translateTextForLocale('Événements','fr'),'Événements');
});

test('la locale anglaise utilise un format britannique cohérent avec les heures 24 h',()=>{
  assert.equal(localeTag('en'),'en-GB');
  assert.equal(localeTag('fr'),'fr-FR');
});

test('le build injecte le sélecteur de langue sur les pages publiques et applicatives',()=>{
  const build=read('scripts/build.mjs');
  assert.match(build,/front\/i18n\.mjs/);
  assert.match(build,/privacy\.html/);
  assert.match(build,/circuit-credits\.html/);
});

test('les dates applicatives utilisent la locale sélectionnée',()=>{
  assert.match(read('front/schedule.mjs'),/localeTag\(\)/);
  assert.match(read('front/game-hub.mjs'),/Intl\.DateTimeFormat\(localeTag\(\)/);
  assert.match(read('front/app/home-view.mjs'),/Intl\.DateTimeFormat\(localeTag\(\)/);
  assert.match(read('front/app/entries-view.mjs'),/Intl\.DateTimeFormat\(localeTag\(\)/);
});
