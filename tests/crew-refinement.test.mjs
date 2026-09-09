import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// A small DOM boundary for the existing progressive enhancement layer.
// Property writes notify the observer just as DOM text/hidden mutations do.
function refinementHarness() {
  let watching=false, pending=[], writes=0;
  let observerCallback;
  const listeners={};
  const mutation=()=>{writes++;if(watching)pending.push({target:{closest:()=>null}});};
  const observed=(object,key,value)=>Object.defineProperty(object,key,{
    get:()=>value,set:next=>{value=next;mutation();},configurable:true,
  });
  const toggle={};observed(toggle,'textContent','');
  const section={scrollIntoView(){}};observed(section,'hidden',false);
  const toolbar={querySelector:selector=>selector.includes('data-ux-registration-toggle')?toggle:null};
  const fold={id:'departure-first',open:true,querySelector:selector=>({'.fold-toolbar':toolbar,'.fold-registration':section}[selector]||null)};
  const button={hidden:true},panel={hidden:true},legacy={hidden:false};
  let folds=[fold];
  let header={dataset:{eventId:'event'}};
  let activeSection='race';
  const app={
    eventViewData:{events:[{id:'event',departures:[{id:'first',availability:[{mine:true}]}]}]},
    querySelector:selector=>selector==='[data-event-id]'?header:selector.includes('event-section')?{dataset:{section:activeSection}}:null,
    querySelectorAll:selector=>selector.startsWith('.departure-fold')?folds:selector==='[data-crew-builder-open], [data-crew-builder-panel]'?[button,panel]:selector==='[data-action="new-crew"]'?[legacy]:[],
  };
  const document={getElementById:id=>id==='app'?app:fold,addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn);}};
  const context=vm.createContext({document,console,clearTimeout(){},MutationObserver:class{
    constructor(fn){observerCallback=fn;}
    observe(){watching=true;}
    disconnect(){watching=false;pending=[];}
  }});
  const source=readFileSync(new URL('../ux-refinement.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
  vm.runInContext(source,context);
  const click=(selector,element)=>{
    const event={target:{closest:query=>query===selector?element:null},preventDefault(){}};
    listeners.click.forEach(fn=>fn(event));
  };
  const refresh=()=>observerCallback([{target:{closest:()=>null}}]);
  return {app,fold,section,toggle,button,panel,legacy,click,refresh,
    pending:()=>pending.length,writes:()=>writes,
    run:code=>vm.runInContext(code,context),
    setFolds:value=>{folds=value;},setHeader:value=>{header=value;},setSection:value=>{activeSection=value;},
  };
}

test('pilot view works without an edit-event button and decoration does not observe its own writes',()=>{
  const h=refinementHarness();
  assert.equal(h.toggle.textContent,'Modifier mon inscription');
  assert.equal(h.section.hidden,true);
  assert.equal(h.pending(),0);
  const before=h.writes();
  h.refresh();
  assert.equal(h.writes(),before);
  assert.equal(h.pending(),0);
  h.click('[data-ux-registration-toggle]',{dataset:{departure:'first'}});
  assert.equal(h.section.hidden,false);
  assert.equal(h.toggle.textContent,'Fermer l’inscription');
  h.refresh();
  assert.equal(h.pending(),0);
  assert.equal(h.section.hidden,false);
});

test('global crew creation stays visible in both sections and an open panel remains visible',()=>{
  const h=refinementHarness();
  for(const section of ['race','crews','race']) {
    h.setSection(section);h.refresh();
    assert.equal(h.button.hidden,false);
    assert.equal(h.panel.hidden,false);
    assert.equal(h.legacy.hidden,true);
  }
});

test('own departure opens initially and manual departure/bucket choices survive refreshes',()=>{
  const h=refinementHarness();
  const own={id:'departure-own',open:false,querySelector:selector=>selector==='[data-crew-mine="true"]'?{}:null};
  const other={id:'departure-other',open:false,querySelector:()=>null};
  h.setFolds([own,other]);h.refresh();
  assert.equal(own.open,true);assert.equal(other.open,false);
  h.click('.departure-fold > summary',{parentElement:own});
  h.click('.departure-fold > summary',{parentElement:other});
  h.setFolds([{...own,open:true},{...other,open:false}]);h.refresh();
  assert.equal(h.run("openFolds.has('departure-own')"),false);
  assert.equal(h.run("openFolds.has('departure-other')"),true);
  const bucket={open:false,dataset:{uxBucketKey:'departure-other:1'}};
  h.click('.ux-crew-bucket > summary',{parentElement:bucket});h.refresh();
  assert.equal(h.run("bucketStates.get('departure-other:1')"),true);
  h.setHeader({dataset:{eventId:'another'}});h.refresh();
  assert.equal(h.run('bucketStates.size'),0);
});

test('latest event snapshot is used after assignment or lock changes without another fetch',async()=>{
  const h=refinementHarness();
  const old=await h.run('loadEvents()');
  h.app.eventViewData={events:[{id:'event',departures:[{id:'first',availability:[],crews:[{id:'new',locked:true}]}]}]};
  const updated=await h.run('loadEvents()');
  assert.notEqual(updated,old);
  assert.equal(updated[0].departures[0].crews[0].locked,true);
  h.refresh();assert.equal(h.toggle.textContent,'S’inscrire');
});
