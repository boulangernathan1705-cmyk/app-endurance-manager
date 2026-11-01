import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../front/app/crews-page.mjs',import.meta.url),'utf8');

test('Équipages page: the padlock opens and closes a crew in one click, without confirmation',()=>{
  const lock=page.slice(page.indexOf("if(action==='crews-lock')"),page.indexOf("if(action==='crews-lock')")+400);
  assert.match(lock,/PATCH',\{locked:target\.dataset\.locked!=='1'/);
  assert.doesNotMatch(lock,/confirm\(/);
});

test('Équipages page: gauge, coverage, pilot details and a saved category filter',()=>{
  assert.match(page,/pilotes placés/);
  assert.match(page,/Personne \$\{holes\.join/);
  assert.match(page,/Veut rouler avec/);
  assert.match(page,/main\.comment/);
  assert.match(page,/CATS_KEY='em-crews-categories'/);
});
