import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('le compte Discord mobile occupe exactement une colonne de navigation',()=>{
  const css=read('styles/mobile-density-v2.css');
  assert.match(css,/\.site-nav-shell \.account-bar:has\(\.account-menu\)[^{]*\{[\s\S]*?width:\s*calc\(\(100% - 4px\) \/ 2\)\s*!important/);
  assert.match(css,/\.site-nav-shell \.account-bar:has\(\.account-menu\) \.account-trigger[\s\S]*?width:\s*100%\s*!important/);
});

test('la création d’équipage propose d’inscrire un pilote non encore inscrit',()=>{
  const script=read('front/crew-builder-registration-shortcut.mjs');
  const css=read('styles/crew-builder-registration-shortcut.css');
  const html=read('game.html');
  assert.match(script,/button\.dataset\.action='new-registration'/);
  assert.match(script,/button\.dataset\.departure=activeBuilder\.departureId/);
  assert.match(script,/button\.textContent='Inscrire un autre pilote'/);
  assert.match(script,/activeBuilder\.mode!=='create'/);
  assert.doesNotMatch(script,/MutationObserver/);
  assert.match(css,/\.crew-builder-register-pilot/);
  assert.match(html,/crew-builder-registration-shortcut\.mjs\?v=1/);
  assert.match(html,/crew-builder-registration-shortcut\.css\?v=1/);
});
