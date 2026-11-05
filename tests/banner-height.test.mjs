import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// Every page, including the live pit wall, shares the same responsive banner height.
test('the banner height comes from the charte tokens only', () => {
  const tokens = readFileSync('styles/tokens.css', 'utf8');
  assert.match(tokens, /--em-banner-height-desktop:/);
  assert.match(tokens, /--em-banner-height-phone:/);
  const media = readFileSync('styles/banner-media.css', 'utf8');
  assert.match(media, /\.hero-picture \{[^}]*height: var\(--em-banner-height-desktop\)/);
  assert.match(media, /height: var\(--em-banner-height-phone\)/);
  assert.doesNotMatch(media, /aspect-ratio: \d/);
  const others = readdirSync('styles').filter(name => name.endsWith('.css') && !['banner-media.css', 'tokens.css'].includes(name));
  for (const name of [...others.map(name => `styles/${name}`), 'styles.css']) {
    assert.doesNotMatch(readFileSync(name, 'utf8'), /\.hero-picture[^{]*\{[^}]*(height|aspect-ratio)/, `${name} must not size the banner`);
  }
});
