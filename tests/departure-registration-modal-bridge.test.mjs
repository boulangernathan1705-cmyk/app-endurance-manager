import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('le bouton Inscrire un autre pilote du départ réutilise la fenêtre superposée',()=>{
  const bridge=read('front/departure-registration-modal-bridge.mjs');
  const html=read('game.html');

  assert.match(bridge,/\.ux-summary-registration-other\[data-action="new-registration"\]/);
  assert.match(bridge,/dataset\.crewBuilderRegisterPilot='true'/);
  const bridgePos=html.indexOf('/front/departure-registration-modal-bridge.mjs?v=1');
  const modalHandlerPos=html.indexOf('/front/crew-builder-registration-shortcut.mjs?v=14-tondeuz-tool');
  assert.ok(bridgePos>=0&&modalHandlerPos>=0&&bridgePos<modalHandlerPos);
});
