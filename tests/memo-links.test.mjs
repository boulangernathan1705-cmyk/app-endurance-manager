import test from 'node:test';
import assert from 'node:assert/strict';
import {memoHref,memoCandidates,memoTrackImage,memoCarImage} from '../shared/memo-links.mjs';
import {catalogForGame} from '../shared/catalog.mjs';
import {existsSync,readFileSync} from 'node:fs';
const combos=[{track:'Circuit de la Sarthe',car:'Ferrari 499P'},{track:'Spa-Francorchamps',car:'Toyota GR010 Hybrid'},{track:'Spa-Francorchamps',car:'Ferrari 499P'}];

test('LMU car images cover the catalogue and verified telemetry names with local WebP assets',()=>{
 const sources=JSON.parse(readFileSync(new URL('../images/memo-cars/sources.json',import.meta.url),'utf8'));
 for(const name of Object.values(catalogForGame('lmu').cars).flat())assert.ok(memoCarImage(name),name);
 const seen=new Set();
 for(const {id,names,source} of sources){
  assert.match(source,/^start\/images\/cars\/FrontThumbnail\/.+_frontAngle\.webp$/);
  const asset=readFileSync(new URL(`../images/memo-cars/${id}.webp`,import.meta.url));
  assert.equal(asset.toString('ascii',0,4),'RIFF');
  assert.equal(asset.toString('ascii',8,12),'WEBP');
  assert.ok(asset.length<100_000);
  for(const name of names){
   assert.ok(!seen.has(name),name);seen.add(name);
   assert.equal(memoCarImage(name),`/images/memo-cars/${id}.webp`);
  }
 }
 assert.equal(memoCarImage('Lamborghini Huracán LMGT3'),memoCarImage('Lamborghini Huracan LMGT3'));
 assert.notEqual(memoCarImage('Peugeot 9X8'),memoCarImage('Peugeot 9X8 Evo'));
 assert.notEqual(memoCarImage('Oreca 07 Gibson'),memoCarImage('Oreca 07 Gibson ELMS'));
 for(const name of [null,undefined,'Unknown GT3','Ferrari 296 LMGT3 Evo','Toyota TR010','Ferrari 499P custom'])assert.equal(memoCarImage(name),'');
 for(const name of Object.values(catalogForGame('iracing').cars).flat())assert.equal(memoCarImage(name,'iracing'),'');
});

const artworkCases = [
 ['monza','Monza','Monza Curva Grande Circuit'],
 ['paul-ricard','Paul Ricard Circuit','Paul Ricard - ELMS','Paul Ricard - 1A','Paul Ricard - 1A-V2'],
 ['sebring','Sebring','Sebring School Circuit'],
 ['le-mans','Circuit de la Sarthe','Le Mans'],
 ['spa','Spa-Francorchamps','Circuit de Spa-Francorchamps Endurance'],
 ['fuji','Fuji Speedway','Fuji Speedway Classic'],
 ['silverstone','Silverstone Grand Prix Circuit - ELMS','Silverstone International Circuit'],
 ['barcelona','Circuit de Barcelona'],
 ['imola','Autodromo Enzo e Dino Ferrari'],
 ['daytona','Daytona International Speedway Road Course'],
 ['long-beach','Grand Prix of Long Beach']
];
test('LMU memo artwork resolves observed variants to existing parent photos',()=>{
 for(const [id,...names] of artworkCases)for(const name of names){
  const image=memoTrackImage(name);
  assert.equal(image,`/images/endurance/lmu-pano/${id}.webp`,name);
  assert.ok(existsSync(new URL('..'+image,import.meta.url)),image);
 }
 for(const item of catalogForGame('lmu').circuits.filter(item=>!item.random)){
  assert.equal(memoTrackImage(item.id),memoTrackImage(item.name));
  assert.ok(existsSync(new URL('..'+memoTrackImage(item.name),import.meta.url)),item.name);
 }
 assert.equal(memoTrackImage('  PAUL RICARD – ELMS '),memoTrackImage('Paul Ricard - ELMS'));
 assert.equal(memoTrackImage('Portimão'),memoTrackImage('Portimao'));
});
test('memo artwork keeps unknown and other simulator fallbacks',()=>{
 for(const name of ['',null,undefined,'random','Circuit aléatoire','Monza Unknown Layout','Spa Test','iracing-monza','../monza.webp'])assert.equal(memoTrackImage(name),'');
 for(const item of catalogForGame('iracing').circuits){
  assert.equal(memoTrackImage(item.id),'');
  assert.equal(memoTrackImage(item.name,'iracing'),'');
 }
});
test('sharing artwork does not merge layout data or broaden memo links',()=>{
 for(const [id,parent,variant] of [artworkCases[0],artworkCases[2],artworkCases[4],artworkCases[5]]){
  const pairs=[{track:parent,car:'Ferrari 499P'},{track:variant,car:'Ferrari 499P'}];
  assert.equal(memoTrackImage(parent),memoTrackImage(variant));
  assert.deepEqual(memoCandidates(pairs,new URLSearchParams({circuit:id})),[pairs[0]]);
  assert.deepEqual(memoCandidates(pairs,new URLSearchParams({track:variant})),[pairs[1]]);
 }
 assert.deepEqual(memoCandidates([{track:'Paul Ricard - ELMS'}],new URLSearchParams({circuit:'paul-ricard'})),[]);
});
test('memo links use the LMU circuit and never default to another circuit',()=>{
 assert.equal(memoHref({circuit:'spa',format:'endurance'},'Ferrari 499P'),'/simhub.html?circuit=spa&car=Ferrari+499P#memo');
 assert.equal(memoHref({circuit:'iracing-spa',format:'endurance'}),'');
 assert.equal(memoHref({circuit:'spa',format:'solo'}),'');
 assert.deepEqual(memoCandidates(combos,new URLSearchParams('circuit=spa&car=Ferrari+499P')),[combos[2]]);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=spa')).length,2);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=monza')).length,0);
 assert.equal(memoCandidates(combos,new URLSearchParams('circuit=spa&car=BMW')).length,0);
});

import {returnPath} from '../server/core.mjs';
test('OAuth memo return preserves safe filters, never an external redirect',()=>{
 assert.equal(returnPath('/simhub.html?circuit=spa&car=Ferrari+499P#memo'),'/simhub.html?circuit=spa&car=Ferrari+499P#memo');
 assert.equal(returnPath('//other.example/simhub.html'),'/');
 assert.equal(returnPath('/simhub?reserve=10&race=00000000-0000-4000-8000-000000000001#memo'),'/simhub?reserve=10&race=00000000-0000-4000-8000-000000000001#memo');
 assert.equal(returnPath('/simhub.html?redirect=https://other.example'),'/');
 assert.equal(returnPath('/simhub.html?car=%0Afoo'),'/');
 assert.equal(returnPath('/lmu/?foo=bar'),'/');
});

test('memo link carries a validated crew identifier through sign-in',()=>{
 const crew='00000000-0000-4000-8000-000000000001';
 const link=memoHref({circuit:'spa',format:'endurance'},'Ferrari 499P',crew);
 assert.equal(new URL(link,'https://site.example').searchParams.get('crew'),crew);
 assert.equal(returnPath(link),link);
});
