import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_CATALOGS} from '../shared/catalog.mjs';
import {circuitMapConfig} from '../shared/circuit-maps.mjs';

test('every LMU circuit has a map and a credit line', () => {
  const credits = readFileSync(new URL('../circuit-credits.html', import.meta.url), 'utf8');
  for (const circuit of GAME_CATALOGS.lmu.circuits) {
    const map = circuitMapConfig(circuit.id);
    assert.ok(map, `${circuit.id} has no map`);
    assert.ok(credits.includes(`File:${map.file.replaceAll(' ', '_')}`.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c))), `${map.file} is not credited`);
  }
});

test('LMU offers Long Beach and Road Atlanta; Road Atlanta shares its map with iRacing', () => {
  const ids = GAME_CATALOGS.lmu.circuits.map(circuit => circuit.id);
  assert.ok(ids.includes('long-beach'));
  assert.ok(ids.includes('road-atlanta'));
  assert.equal(circuitMapConfig('iracing-road-atlanta').file, circuitMapConfig('road-atlanta').file);
});
