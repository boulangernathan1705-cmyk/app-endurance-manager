// Older browsers (Safari before 15.4, 2022) lack these: the site's modules use them, so add them first.
(() => {
  const add = (target, name, value) => { if (!(name in target)) Object.defineProperty(target, name, {value, writable:true, configurable:true}); };
  function at(index) {
    const length = this.length >>> 0, i = Math.trunc(index) || 0, k = i < 0 ? length + i : i;
    return k < 0 || k >= length ? undefined : this[k];
  }
  function findLastIndex(test, self) {
    for (let i = (this.length >>> 0) - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
    return -1;
  }
  function findLast(test, self) { const i = findLastIndex.call(this, test, self); return i < 0 ? undefined : this[i]; }
  add(Array.prototype, 'at', at);
  add(String.prototype, 'at', function(index) { return at.call(String(this), index); });
  add(Array.prototype, 'findLast', findLast);
  add(Array.prototype, 'findLastIndex', findLastIndex);
  add(Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(object, key));
  add(String.prototype, 'replaceAll', function(search, value) {
    return search instanceof RegExp ? this.replace(search, value) : this.split(search).join(value);
  });
  // The site only clones plain API data (no dates, maps or functions).
  add(globalThis, 'structuredClone', value => value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
})();
