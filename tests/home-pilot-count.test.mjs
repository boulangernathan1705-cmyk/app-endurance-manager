import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('la carte événement compte les pilotes par catégorie, sans répéter un total',()=>{
  const home=read('front/app/home-view.mjs');
  assert.match(home,/eventBadge\(category,eventCategoryCount\(event,category\)\)/);
  assert.doesNotMatch(home,/class="event-pilot-count"/);
});
