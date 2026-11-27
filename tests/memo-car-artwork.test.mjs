import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {catalogForGame} from '../shared/catalog.mjs';
import {memoCarArtworkId,memoCarArtwork,AVAILABLE_MEMO_CAR_ARTWORK} from '../shared/memo-car-artwork.mjs';
test('each LMU catalogue car maps to its own artwork, except shared Oreca',()=>{
  const cars=Object.values(catalogForGame('lmu').cars).flat();
  const ids=cars.map(memoCarArtworkId);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size,cars.length-1);
  assert.equal(memoCarArtworkId('Oreca 07 Gibson ELMS'),memoCarArtworkId('Oreca 07 Gibson'));
  assert.notEqual(memoCarArtworkId('Peugeot 9X8'),memoCarArtworkId('Peugeot 9X8 Evo'));
  assert.notEqual(memoCarArtworkId('Chevrolet Corvette C8.R'),memoCarArtworkId('Chevrolet Corvette Z06 LMGT3.R'));
  assert.equal(memoCarArtworkId('Lamborghini Huracan LMGT3'),memoCarArtworkId('Lamborghini Huracán LMGT3'));
  assert.equal(memoCarArtworkId('unknown car'),'');
});
test('no missing or external artwork is emitted',()=>{
  const available=new Set(AVAILABLE_MEMO_CAR_ARTWORK);
  const cars=Object.values(catalogForGame('lmu').cars).flat();
  for(const car of cars){const id=memoCarArtworkId(car);const url=memoCarArtwork(car);assert.equal(url,available.has(id)?'/images/memo-cars/'+id+'.webp':'');if(url)assert.ok(existsSync(new URL('..'+url,import.meta.url)));}
  assert.equal(memoCarArtwork('unknown car'),'');
});
