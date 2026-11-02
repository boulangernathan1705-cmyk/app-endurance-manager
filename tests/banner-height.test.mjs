import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// The banner has ONE height on every page (Nathan, 2026-11-02): the thin band set by --em-banner-height.
// Only the live pit wall (live.css) keeps a thinner strip.
test('the banner height comes from the charte tokens only', () => {
  const tokens = readFileSync('styles/tokens.css', 'utf8');
  assert.match(tokens, /--em-banner-height:/);
  assert.match(tokens, /--em-banner-height-phone:/);
  const media = readFileSync('styles/banner-media.css', 'utf8');
  assert.match(media, /\.hero-picture \{[^}]*height: var\(--em-banner-height\)/);
  assert.match(media, /height: var\(--em-banner-height-phone\)/);
  assert.doesNotMatch(media, /aspect-ratio/);
  const others = readdirSync('styles').filter(name => name.endsWith('.css') && !['banner-media.css', 'live.css', 'tokens.css'].includes(name));
  for (const name of [...others.map(name => `styles/${name}`), 'styles.css']) {
    assert.doesNotMatch(readFileSync(name, 'utf8'), /\.hero-picture[^{]*\{[^}]*(height|aspect-ratio)/, `${name} must not size the banner`);
  }
});
