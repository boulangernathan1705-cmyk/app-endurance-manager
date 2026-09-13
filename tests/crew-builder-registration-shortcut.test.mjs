import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('le compte Discord mobile occupe exactement une colonne de navigation',()=>{
  const css=read('styles/mobile-density-v2.css');
  assert.match(css,/\.site-nav-shell \.account-bar:has\(\.account-menu\)[^{]*\{[\s\S]*?width:\s*calc\(\(100% - 4px\) \/ 2\)\s*!important/);
  assert.match(css,/\.site-nav-shell \.account-bar:has\(\.account-menu\) \.account-trigger[\s\S]*?width:\s*100%\s*!important/);
});

test('la création d’équipage ouvre l’inscription pilote dans une fenêtre superposée',()=>{
  const script=read('front/crew-builder-registration-shortcut.mjs');
  const css=read('styles/crew-builder-registration-shortcut.css');
  const html=read('game.html');
  assert.match(script,/data\.crewBuilderRegisterPilot='true'/);
  assert.match(script,/registration-modal-backdrop/);
  assert.match(script,/renderRegistrationForm\(event,departure,draft\)/);
  assert.match(script,/submitRegistration\(form,api\)/);
  assert.match(script,/document\.body\.classList\.add\('registration-modal-open'\)/);
  assert.match(script,/activeBuilder\.mode!=='create'/);
  assert.doesNotMatch(script,/MutationObserver/);
  assert.doesNotMatch(script,/dataset\.action='new-registration'/);
  assert.match(css,/\.registration-modal-backdrop\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css,/\.registration-modal-panel[\s\S]*?100dvh/);
  assert.match(css,/body\.registration-modal-open/);
  assert.match(html,/crew-builder-registration-shortcut\.mjs\?v=2-modal/);
  assert.match(html,/crew-builder-registration-shortcut\.css\?v=2-modal/);
});
