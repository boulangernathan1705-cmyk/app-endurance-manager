import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('the site never sends a creation or a change twice by itself after a network error', () => {
  const core = readFileSync(new URL('../front/app/core.mjs', import.meta.url), 'utf8');
  assert.match(core, /const tries=method==='GET'\?2:1;/);
  assert.match(core, /if \(method!=='GET'\) \{\s*const error=Error\('Connexion au service impossible : ta demande n’a peut-être pas été enregistrée/, 'no XHR fallback for writes');
});
