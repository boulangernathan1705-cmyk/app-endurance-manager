import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {changelogHtml} from '../scripts/changelog.mjs';

test('the changelog page is generated from CHANGELOG.md', () => {
  const html = changelogHtml('# Titre\n\nIntro.\n\n## v1.1 — 1 octobre 2026\n\n### Courses\n- **Nouveau** : `code` et [aide](/help.html)\n- <script>x</script>\n\n## v1.0\nTexte.');
  assert.match(html, /<h1>Titre<\/h1>/);
  assert.match(html, /<section class="changelog-version"><h2>v1\.1 — 1 octobre 2026<\/h2>/);
  assert.match(html, /<li><strong>Nouveau<\/strong> : <code>code<\/code> et <a href="\/help\.html">aide<\/a><\/li>/);
  assert.match(html, /&lt;script&gt;/, 'markup in the changelog is escaped');
  assert.equal((html.match(/<section/g) || []).length, (html.match(/<\/section>/g) || []).length);
});

test('CHANGELOG.md starts with the upcoming version and every page links to it', () => {
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(changelog, /^# Nouveautés d'Endurance Manager/);
  assert.match(changelog, /\n## v1\.0 — 26 septembre 2026\n/);
  for (const page of ['index.html', 'game.html', 'members.html', 'help.html', 'about.html', 'changelog.html'])
    assert.match(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), /href="\/changelog\.html"/, page);
});
