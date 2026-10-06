import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a page left open without a gesture stops refreshing, and catches up at the first gesture', () => {
  assert.match(read('front/idle.mjs'), /IDLE_AFTER_MS=15\*60000/);
  const refresh = read('front/app/auto-refresh.mjs');
  assert.match(refresh, /document\.hidden\|\|isIdle\(\)/);
  assert.match(refresh, /onWake\(catchUp\)/);
  const bell = read('front/notifications.mjs');
  assert.match(bell, /document\.hidden \|\| isIdle\(\)/);
  assert.match(bell, /onWake\(load\)/);
});

test('the build lists every module of a page as a preload', () => {
  const build = read('scripts/build.mjs');
  assert.match(build, /rel="modulepreload"/);
  assert.match(build, /'lmu\/index\.html', 'iracing\/index\.html'/);
});
