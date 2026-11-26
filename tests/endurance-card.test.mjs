import test from 'node:test';
import assert from 'node:assert/strict';
import {enduranceDuration,enduranceHeader,enduranceArtworkClass} from '../front/endurance-card.mjs';
test('the endurance header only shows a real duration absent from the title',()=>{
 for(const name of ['4h du Castellet','4 heures du Castellet','4 Hours of Le Castellet','4 H du Castellet'])assert.equal(enduranceDuration({name,durationMinutes:240}),'');
 for(const name of ['2h30 de Spa','2 h 30 de Spa','2 hours 30 minutes of Spa'])assert.equal(enduranceDuration({name,durationMinutes:150}),'');
 assert.equal(enduranceDuration({name:'Production Endurance Challenge',durationMinutes:120}),'2H');
 assert.equal(enduranceDuration({name:'6h de Spa',durationMinutes:150}),'2H30');
 assert.equal(enduranceDuration({name:'Race',durationHours:4}),'4H');
 assert.equal(enduranceDuration({name:'Race'}),'');
 assert.equal(enduranceDuration({name:'Race',durationMinutes:0}),'');
 assert.match(enduranceHeader({name:'Race',durationMinutes:150},'iracing'),/Endurance<\/span><span class="endurance-card-brand">iRacing[\s\S]*2H30/);
});

import {GAME_CATALOGS} from '../shared/catalog.mjs';
import {existsSync} from 'node:fs';
test('all named LMU circuits have local artwork; other games and unknown circuits keep their fallback',()=>{
 for(const c of GAME_CATALOGS.lmu.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd'))){
  assert.equal(enduranceArtworkClass({circuit:c.id},'lmu'),' endurance-track-'+c.id);
  assert.ok(existsSync(new URL('../images/endurance/lmu/'+c.id+'.webp',import.meta.url)));
 }
 assert.equal(enduranceArtworkClass({circuit:'spa'},'iracing'),'');
 assert.equal(enduranceArtworkClass({circuit:'random'},'lmu'),'');
});
