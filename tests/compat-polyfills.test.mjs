import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../front/compat.js', import.meta.url), 'utf8');

test('compat.js adds the missing methods of older Safari without touching existing ones', () => {
  // A bare context stands in for Safari 15.3: remove what it lacks, then load the script.
  const context = vm.createContext({});
  vm.runInContext(`delete Array.prototype.at; delete String.prototype.at; delete Array.prototype.findLast;
    delete Array.prototype.findLastIndex; delete Object.hasOwn; delete globalThis.structuredClone;`, context);
  vm.runInContext(source, context);
  const result = vm.runInContext(`JSON.stringify([
    [1,2,3].at(-1), [1,2,3].at(0), [].at(-1) ?? null, 'abc'.at(-1),
    [1,2,3,4].findLast(n => n % 2), [1,2,3,4].findLastIndex(n => n > 5),
    Object.hasOwn({a:1}, 'a'), structuredClone({a:[1]}).a[0], 'a/b/c'.replaceAll('/', ' · ')
  ])`, context);
  assert.deepEqual(JSON.parse(result), [3, 1, null, 'c', 3, -1, true, 1, 'a · b · c']);
});

test('every built page loads compat.js before its modules', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /<head>\\n\$\{compatScriptTag\}/);
});
