import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutEdgeScripts} from '../server/worker-with-migrations.mjs';

test('HTML pages tell Cloudflare not to inject scripts, other responses are untouched', () => {
  const page = withoutEdgeScripts(new Response('<p>x</p>', {headers:{'Content-Type':'text/html', 'Cache-Control':'public, max-age=0, must-revalidate'}}));
  assert.equal(page.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate, no-transform');
  assert.equal(withoutEdgeScripts(new Response('<p>x</p>', {headers:{'Content-Type':'text/html; charset=utf-8'}})).headers.get('Cache-Control'), 'no-transform');
  const twice = withoutEdgeScripts(page);
  assert.equal(twice.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate, no-transform');
  const json = new Response('{}', {headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
  assert.equal(withoutEdgeScripts(json), json);
});
