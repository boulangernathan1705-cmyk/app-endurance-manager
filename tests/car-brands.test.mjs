import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {carBrand} from '../shared/car-brands.mjs';
import {GAME_CATALOGS} from '../shared/catalog.mjs';

test('every catalogue car has a brand, and every logo file exists', () => {
  for(const game of Object.values(GAME_CATALOGS)) for(const cars of Object.values(game.cars)) for(const car of cars) {
    const brand = carBrand(car);
    assert.ok(brand, car);
    assert.equal(brand.initials.length, 2, car);
    if(brand.logo) assert.ok(existsSync(new URL(`../images/brands/${brand.logo}.webp`, import.meta.url)), brand.logo);
  }
});

test('brand matching', () => {
  assert.equal(carBrand('Corvette Z06 LMGT3.R').logo, 'corvette');
  assert.equal(carBrand('HPD ARX-01c').name, 'Honda');
  assert.equal(carBrand('Isotta Fraschini Tipo 6-C').initials, 'IF');
  assert.equal(carBrand('Mercedes-AMG LMGT3').initials, 'ME');
  assert.equal(carBrand(''), null);
  assert.equal(carBrand('Voiture inconnue'), null);
});

test('on phones the car name is not capped by the old 125-150 px width', async () => {
  const {readFile} = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/crew-summary.css', import.meta.url), 'utf8');
  assert.match(css, /\.crew-tile-summary \.crew-tile-foot \.crew-compact-car \{ max-width: none;/);
});
