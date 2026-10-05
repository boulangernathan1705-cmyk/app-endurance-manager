import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Most interface tests read source text; this one makes sure every browser and worker script still parses.
const root = fileURLToPath(new URL('../', import.meta.url));
function scripts(dir) {
  return readdirSync(join(root, dir), {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return scripts(path);
    return /\.(mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

test('tous les scripts du site et du serveur sont syntaxiquement valides', () => {
  const files = [...scripts('front'), ...scripts('server'), ...scripts('shared'), 'app.js', 'crew-builder.js', 'help.js'];
  for (const file of files) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', join(root, file)], {stdio: 'pipe'}), `${file} ne se charge pas`);
  }
});
