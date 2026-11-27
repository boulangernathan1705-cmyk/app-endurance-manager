import test from 'node:test';
import assert from 'node:assert/strict';
import {enduranceDuration,enduranceHeader,enduranceArtworkClass,endurancePreviewClass,endurancePanoramaClass,IRACING_ARTWORK} from '../front/endurance-card.mjs';
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
import {existsSync,readFileSync} from 'node:fs';
test('all named LMU circuits have local artwork; other games and unknown circuits keep their fallback',()=>{
 for(const c of GAME_CATALOGS.lmu.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd'))){
  assert.equal(enduranceArtworkClass({circuit:c.id},'lmu'),' endurance-track-'+c.id);
  assert.ok(existsSync(new URL('../images/endurance/lmu/'+c.id+'.webp',import.meta.url)));
 }
 assert.equal(enduranceArtworkClass({circuit:'spa'},'iracing'),'');
 assert.equal(enduranceArtworkClass({circuit:'random'},'lmu'),'');
});

test('preview artwork never crosses simulator boundaries',()=>{
 for(const c of GAME_CATALOGS.iracing.circuits){
  const active=Object.hasOwn(IRACING_ARTWORK,c.id);
  const track=active?' endurance-track-'+c.id:'';
  const preview=active?' endurance-preview-track-'+c.id:'';
  assert.equal(endurancePreviewClass({circuit:c.id}),' endurance-preview'+preview+' endurance-preview-iracing');
  assert.equal(enduranceArtworkClass({circuit:c.id},'iracing'),track);
  assert.equal(endurancePanoramaClass({circuit:c.id},'iracing'),active?' endurance-pano'+track:'');
  if(active){
   assert.ok(!c.random&&!c.id.endsWith('-tbd'));
   assert.ok(existsSync(new URL('../images/endurance/iracing/'+c.id+'.webp',import.meta.url)));
   assert.ok(existsSync(new URL('../images/endurance/iracing-pano/'+c.id+'.webp',import.meta.url)));
  }
 }
 for(const c of GAME_CATALOGS.lmu.circuits.filter(c=>!c.random)){
  assert.equal(endurancePreviewClass({circuit:c.id},'lmu'),' endurance-preview endurance-preview-track-'+c.id+' endurance-preview-lmu');
  assert.equal(endurancePreviewClass({circuit:c.id},'iracing'),' endurance-preview endurance-preview-iracing');
 }
 assert.equal(endurancePreviewClass({circuit:'iracing-spa'},'lmu'),' endurance-preview endurance-preview-lmu');
 assert.equal(endurancePreviewClass({circuit:'unrecognized'},'iracing'),' endurance-preview endurance-preview-iracing');
});

test('iRacing candidate inventory covers exactly the named circuit catalogue',()=>{
 const source=readFileSync(new URL('../docs/IRACING_ARTWORK.md',import.meta.url),'utf8');
 const rows=[...source.matchAll(/^\| (iracing-[a-z0-9-]+) \| \[Capture\]\((https:\/\/[^)]+)\) \|/gm)];
 const expected=GAME_CATALOGS.iracing.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd')).map(c=>c.id).sort();
 assert.deepEqual(rows.map(m=>m[1]).sort(),expected);
 assert.equal(new Set(rows.map(m=>m[2])).size,expected.length);
 for(const id of Object.keys(IRACING_ARTWORK))assert.ok(expected.includes(id));
});

test('all named iRacing circuits have independently licensed photos',()=>{
 assert.deepEqual(Object.keys(IRACING_ARTWORK).sort(),GAME_CATALOGS.iracing.circuits.filter(c=>!c.random&&!c.id.endsWith('-tbd')).map(c=>c.id).sort());
});
