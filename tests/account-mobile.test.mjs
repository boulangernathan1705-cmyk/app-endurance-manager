import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('le compte connecté reste compact sur mobile sans modifier le desktop', () => {
  const css = read('styles/account-mobile-fix.css');
  const game = read('game.html');
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.site-nav-shell \.account-trigger\s*\{[^}]*width:\s*auto\s*!important/s);
  assert.match(css, /max-width:\s*235px\s*!important/);
  assert.match(css, /\.site-nav-shell \.account-avatar\s*\{[^}]*width:\s*28px\s*!important/s);
  assert.match(game, /account-mobile-fix\.css\?v=1-compact-account/);
});
