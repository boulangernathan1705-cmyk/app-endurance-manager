import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The SimHub dash « Endurance Manager · Mur » is written by connectors/simhub-plugin/dash/build.mjs from the mockup
// (dash/mur.html): the plugin embeds dash/mur.json and Wall.Make fills the properties its items read.
const dir = new URL('../connectors/simhub-plugin/', import.meta.url);
const items = JSON.parse(readFileSync(new URL('dash/mur.json', dir), 'utf8'));
const wall = readFileSync(new URL('Wall.cs', dir), 'utf8');
const html = readFileSync(new URL('dash/mur.html', dir), 'utf8');

test('the mur dash: Dash Studio items with unique names inside 2560 × 1440', () => {
  assert.ok(items.length > 1000);
  assert.equal(new Set(items.map(item => item.Name)).size, items.length);
  for (const item of items) {
    assert.ok(item.IsTextItem || item.IsRectangleItem, item.Name);
    assert.ok(item.Left > -10 && item.Top > -10 && item.Left < 2570 && item.Top < 1450, item.Name);
    for (const [target, binding] of Object.entries(item.Bindings)) assert.equal(binding.TargetPropertyName, target);
  }
});

test('every property the mur dash reads is one Wall.Make fills', () => {
  const names = new Set();
  for (const item of items) for (const binding of Object.values(item.Bindings)) {
    for (const [, name] of binding.Formula.Expression.matchAll(/\[EnduranceManagerPlugin\.Mur\.([A-Za-z0-9.]+)\]/g)) names.add(name);
    assert.doesNotMatch(binding.Formula.Expression, /\[(?!EnduranceManagerPlugin\.Mur\.)/, 'only the mur\'s properties');
  }
  assert.ok(names.size > 500);
  // Wall.Make writes v["Name"] or v[at + "Name"] (at = "Classement.3." and so on): each name's last part is written.
  for (const name of names) {
    const last = name.replace(/^(Classement|Relatif|Piste)\.\d+\./, '').replace(/^Piste\.(Morceau|Nom)\d\./, '').replace(/^Pneus\.[A-Z]+\./, '').replace(/^Entrees\.Trace\.(Gaz|Frein)\.\d+$/, 'Entrees.Trace.$1.');
    // A number inside (« Chrono.S" + (k + 1) ») splits the name: each piece is written.
    // So does a name made of two (keys[k] + "Couleur"): then each word is written.
    for (const piece of last.split(/\d+/).filter(Boolean))
      assert.ok(wall.includes(piece) || piece.split(/(?=[A-Z])/).every(word => wall.includes(`"${word.replace(/^\./, '')}`) || wall.includes(word)), `${name} jamais rempli`);
  }
});

test('the mur dash is the committed build of the mockup: no binding in the page is missing from the dash', () => {
  const dashText = JSON.stringify(items);
  for (const [, name] of html.matchAll(/data-t="([A-Za-z.]+)"/g)) assert.ok(dashText.includes(`EnduranceManagerPlugin.Mur.${name}]`), `${name} : relancer dash/build.mjs`);
});
