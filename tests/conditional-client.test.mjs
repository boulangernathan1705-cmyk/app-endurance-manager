import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document={readyState:'loading',getElementById(){return null;},addEventListener(){}};
globalThis.addEventListener=()=>{};
const {api,load,state}=await import('../front/app/core.mjs');
const event={id:'race',format:'endurance',circuit:'spa',departures:[],name:'Race'};
const session={access:'member',user:{id:'pilot',name:'Pilot'},community:{id:'community'},permissions:['access']};

function mockedFetch(t,fn){const previous=globalThis.fetch;globalThis.fetch=fn;t.after(()=>{globalThis.fetch=previous;});}

test('304 reuses a private snapshot without carrying UI mutations into the next refresh',async t=>{
  const cache={};let calls=0;
  mockedFetch(t,async(path,options)=>{
    calls++;assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');
    if (calls===1) {assert.equal(options.headers['If-None-Match'],undefined);return Response.json({events:[event]},{headers:{ETag:'W/"one"'}});}
    assert.equal(options.headers['If-None-Match'],'W/"one"');return new Response(null,{status:304});
  });
  const first=await api('/api/races','GET',undefined,cache);first.events[0].name='Local edit';
  const second=await api('/api/races','GET',undefined,cache);assert.equal(second.events[0].name,'Race');second.events.length=0;
  assert.equal((await api('/api/races','GET',undefined,cache)).events.length,1);
});

test('permissions and account switches clear both event lists; unchanged sessions keep conditional requests',async t=>{
  state.archiveLoaded=true;state.participantsLoaded=true;state.user=session.user;state.access='member';
  let current=structuredClone(session),revision=1;const seen=[];
  mockedFetch(t,async(path,options)=>{
    if(path==='/api/session')return Response.json(current);
    if(path==='/api/participants')return Response.json({participants:[]});
    assert.match(path,/^\/api\/races\?/);seen.push(options.headers['If-None-Match']||null);
    const tag=`W/"${revision}-${path}"`;
    if(options.headers['If-None-Match']===tag)return new Response(null,{status:304});
    return Response.json({events:[event]},{headers:{ETag:tag}});
  });
  await load();assert.deepEqual(seen.splice(0),[null,null]);
  await load();assert.ok(seen.splice(0).every(Boolean));
  current.permissions.push('crews');await load();assert.deepEqual(seen.splice(0),[null,null]);
  current.user={id:'other',name:'Other'};revision++;await load();assert.deepEqual(seen.splice(0),[null,null]);
  current={access:'anonymous',user:null,permissions:[]};await load();assert.equal(state.events.length,0);assert.deepEqual(seen.splice(0),[]);
  current=structuredClone(session);await load();assert.deepEqual(seen.splice(0),[null,null]);
});

test('unconditional XHR recovery discards the previous tag and never labels a new response with it',async t=>{
  const cache={tag:'W/"old"',data:{events:[event]}};let sent=0;
  mockedFetch(t,async()=>{throw new TypeError('Failed to fetch');});
  const previous=globalThis.XMLHttpRequest;t.after(()=>{globalThis.XMLHttpRequest=previous;});
  globalThis.XMLHttpRequest=class {
    open(){} setRequestHeader(){}
    send(){sent++;this.status=200;this.responseText=JSON.stringify({events:[{...event,name:'New'}]});queueMicrotask(()=>this.onload());}
  };
  assert.equal((await api('/api/races','GET',undefined,cache)).events[0].name,'New');
  assert.equal(sent,1);assert.equal(cache.tag,'');assert.equal(cache.data,null);
});

test('failed authorization never returns the stored data',async t=>{
  const cache={tag:'W/"old"',data:{events:[event]}};
  mockedFetch(t,async()=>Response.json({error:'Access revoked'},{status:403}));
  await assert.rejects(api('/api/races','GET',undefined,cache),/Access revoked/);
});
