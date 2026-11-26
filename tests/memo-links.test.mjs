import test from 'node:test';
import assert from 'node:assert/strict';
import {memoHref,memoCandidates} from '../front/memo-links.mjs';
const combos=[{track:'Circuit de la Sarthe',car:'Ferrari 499P'},{track:'Spa-Francorchamps',car:'Toyota GR010 Hybrid'},{track:'Spa-Francorchamps',car:'Ferrari 499P'}];
test('memo links use the LMU circuit and never default to another circuit',()=>{
 assert.equal(memoHref({circuit:'spa',format:'endurance'},'Ferrari 499P'),'/simhub.html?circuit=spa&car=Ferrari+499P#memo');
 assert.equal(memoHref({circuit:'iracing-spa',format:'endurance'}),'');
 assert.equal(memoHref({circuit:'spa',format:'solo'}),'');
 assert.deepEqual(memoCandidates(combos,new URLSearchParams('circuit=spa&car=Ferrari+499P')),[combos[2]]);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=spa')).length,2);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=monza')).length,0);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=spa&car=BMW')).length,0);
});
