import test from 'node:test';
import assert from 'node:assert/strict';
import {watchEndurancePhotos} from '../front/endurance-card.mjs';

test('compact photo loads near viewport, detail stays eager, and new cards are observed',()=>{
  const observed=new Set();
  let intersections, mutations;
  class Intersection {
    constructor(callback,options){intersections=callback;assert.equal(options.rootMargin,'600px 0px');}
    observe(node){observed.add(node);}
    unobserve(node){observed.delete(node);}
  }
  class Mutation {
    constructor(callback){mutations=callback;}
    observe(){}
  }
  const photo=compact=>{
    const node={pending:true,closest:()=>compact,matches:()=>node.pending,classList:{remove:()=>{node.pending=false;}}};
    return node;
  };
  const a=photo(true),hero=photo(false),b=photo(true);
  const doc={body:{querySelectorAll:()=>[a,hero]}};
  assert.equal(watchEndurancePhotos(doc,Intersection,Mutation),true);
  assert.equal(hero.pending,false);
  assert.deepEqual([...observed],[a]);
  intersections([{target:a,isIntersecting:false}]);
  assert.equal(a.pending,true);
  intersections([{target:a,isIntersecting:true}]);
  assert.equal(a.pending,false);
  assert.equal(observed.size,0);
  mutations([{addedNodes:[b],removedNodes:[]}]);
  assert.ok(observed.has(b));
  mutations([{addedNodes:[],removedNodes:[b]}]);
  assert.ok(!observed.has(b));
  assert.equal(watchEndurancePhotos(doc,undefined,Mutation),false);
});
