import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {changelogHtml} from '../scripts/changelog.mjs';

test('the changelog page is generated from CHANGELOG.md', () => {
  const html = changelogHtml('# Titre\n\nIntro.\n\n## v1.1 — 1 octobre 2026\n\n### Courses\n- **Nouveau** : `code` et [aide](/help.html)\n- <script>x</script>\n\n## v1.0\nTexte.');
  assert.match(html, /<h1>Titre<\/h1>/);
  assert.match(html, /<section class="changelog-version"><h2>1 octobre 2026<\/h2>/);
  assert.match(html, /<li><strong>Nouveau<\/strong> : <code>code<\/code> et <a href="\/help\.html">aide<\/a><\/li>/);
  assert.match(html, /&lt;script&gt;/, 'markup in the changelog is escaped');
  assert.equal((html.match(/<section/g) || []).length, (html.match(/<\/section>/g) || []).length);
});

test('CHANGELOG.md starts with the upcoming version and every page links to it', () => {
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(changelog, /^# Nouveautés d'Endurance Manager/);
  assert.match(changelog, /\r?\n## v1\.0 — 26 septembre 2026\r?\n/);
  for (const page of ['index.html', 'game.html', 'members.html', 'help.html', 'about.html', 'changelog.html'])
    assert.match(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), /href="\/changelog\.html"/, page);
});


test('all releases from the same day share one entry without losing changes', () => {
  const html = changelogHtml(`# Nouveautés
## v1.3 — 14 octobre 2026
- Correction A
## v1.2 — 13 octobre 2026
- Correction B
## v1.1 — 14 octobre 2026
### Inscriptions
- Correction C
## v1.0
- Sans date`);
  assert.equal((html.match(/<section /g) || []).length, 3);
  assert.equal((html.match(/<h2>14 octobre 2026<\/h2>/g) || []).length, 1);
  assert.match(html, /Correction A[\s\S]*Inscriptions[\s\S]*Correction C[\s\S]*<\/section>[\s\S]*13 octobre 2026/);
  assert.match(html, /<h2>v1\.0<\/h2>/);
  assert.match(html, /Sans date/);
  assert.doesNotMatch(html, /v1\.[123]/);
});

test('the published history has exactly one entry per date', () => {
  const markdown = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const dates = [...markdown.matchAll(/^## .* — (.+)$/gm)].map(match => match[1]);
  const html = changelogHtml(markdown);
  assert.equal((html.match(/<section /g) || []).length, new Set(dates).size);
  assert.equal((html.match(/<li>/g) || []).length, (markdown.match(/^- /gm) || []).length);
});
