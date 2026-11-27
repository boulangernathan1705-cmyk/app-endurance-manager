import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCircuitPhotoVersioner,staticAssetInventory,checkStaticAssetBudget,STATIC_ASSET_LIMIT,STATIC_FILE_LIMIT} from '../scripts/static-asset-budget.mjs';

test('photo cache versions depend only on file contents; existing parameters survive',async()=>{
  const root=await mkdtemp(join(tmpdir(),'em-assets-'));
  try{
    const dir=join(root,'images/endurance/lmu');
    await mkdir(dir,{recursive:true});
    const path='images/endurance/lmu/spa.webp';
    await writeFile(join(root,path),'first');
    const version=createCircuitPhotoVersioner(root);
    const first=version(path,'?x=1#focus');
    assert.match(first,/^\?x=1&v=[a-f0-9]{16}#focus$/);
    assert.equal(version('images/other.webp','?x=1'),'?x=1');
    assert.equal(createCircuitPhotoVersioner(root)(path,'?x=1#focus'),first);
    await writeFile(join(root,path),'second');
    assert.notEqual(createCircuitPhotoVersioner(root)(path,'?x=1#focus'),first);
    assert.deepEqual(await staticAssetInventory(root),[{path,size:6}]);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('Cloudflare Free hard limits and early-warning margins are enforced',()=>{
  const files=Array.from({length:STATIC_ASSET_LIMIT},(_,i)=>({path:'file'+i,size:1}));
  assert.equal(checkStaticAssetBudget(files).errors.length,0);
  assert.equal(checkStaticAssetBudget(files).warnings.length,1);
  assert.equal(checkStaticAssetBudget([...files,{path:'extra',size:1}]).errors.length,1);
  assert.equal(checkStaticAssetBudget([{path:'file',size:STATIC_FILE_LIMIT}]).errors.length,0);
  assert.equal(checkStaticAssetBudget([{path:'file',size:STATIC_FILE_LIMIT+1}]).errors.length,1);
  const result=checkStaticAssetBudget([{path:'images/one.webp',size:STATIC_FILE_LIMIT},{path:'images/two.webp',size:STATIC_FILE_LIMIT}]);
  assert.equal(result.imageBytes,50*1024*1024);
  assert.equal(result.warnings.length,1);
});
