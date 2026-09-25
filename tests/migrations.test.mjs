import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';

// D1 remembers applied migrations by file name: a renamed file would run again in production.
// The two historical 0016 files are already applied everywhere and must keep their names.
const HISTORICAL_DUPLICATES=new Set(['0016']);

test('each new migration gets its own number',()=>{
  const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
  const seen=new Map();
  for(const file of files){
    const match=file.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
    assert.ok(match,`${file} must be named NNNN_description.sql`);
    const number=match[1];
    if(seen.has(number)&&!HISTORICAL_DUPLICATES.has(number))assert.fail(`${file} reuses number ${number} (${seen.get(number)})`);
    seen.set(number,file);
  }
  assert.ok(seen.has('0016')&&files.filter(file=>file.startsWith('0016_')).length===2,'historical 0016 files keep their names');
});
