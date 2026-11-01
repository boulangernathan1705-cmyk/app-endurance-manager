import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// The style charter: styles/tokens.css is the single source of the --em-* values, loaded before every other style.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tokens = read('styles/tokens.css');
const defined = new Set([...tokens.matchAll(/(--em-[a-z0-9-]+)\s*:/g)].map(match => match[1]));

test('tokens.css is the first style of the site', () => {
  assert.match(read('styles.css'), /^@import url\("\/styles\/tokens\.css"\);/);
});

test('every --em-* variable used in the styles is defined in tokens.css', () => {
  const files = ['styles.css', ...readdirSync(new URL('../styles/', import.meta.url)).filter(name => name.endsWith('.css') && name !== 'tokens.css').map(name => `styles/${name}`)];
  for (const file of files) for (const [, name] of read(file).matchAll(/var\((--em-[a-z0-9-]+)/g)) assert.ok(defined.has(name), `${file}: ${name} is not in styles/tokens.css`);
});

test('the reference captures of the visual tests are in the repository', () => {
  const captures = readdirSync(new URL('./visual/__screenshots__/', import.meta.url));
  for (const page of ['charte', 'accueil', 'equipages']) for (const size of ['desktop', 'mobile']) assert.ok(captures.includes(`${page}-${size}.png`), `${page}-${size}.png`);
});
