import test from 'node:test';
import assert from 'node:assert/strict';
import {signPass, readPass, relaySocketUrl, PASS_FOR} from '../shared/relay-pass.mjs';

const secret = 'x'.repeat(40);

test('a pass signed by the site opens the relay for its community and role, a few minutes only', async () => {
  const pass = await signPass(secret, {c:'fmt', r:'viewer', u:'u1', n:'Jordi', col:''}, 1000);
  const data = await readPass(secret, pass, 2000);
  assert.equal(data.c, 'fmt');
  assert.equal(data.r, 'viewer');
  assert.equal(data.n, 'Jordi');
  assert.equal(await readPass(secret, pass, 1000 + PASS_FOR + 1), null);
});

test('a pass from another secret, changed, or made up is refused', async () => {
  const pass = await signPass(secret, {c:'fmt', r:'driver', u:'u1'}, 1000);
  assert.equal(await readPass('y'.repeat(40), pass, 2000), null);
  const [body, signature] = pass.split('.');
  const other = await signPass(secret, {c:'tdz', r:'driver', u:'u1'}, 1000);
  assert.equal(await readPass(secret, `${other.split('.')[0]}.${signature}`, 2000), null);
  assert.equal(await readPass(secret, body, 2000), null);
  assert.equal(await readPass(secret, 'nimporte.quoi', 2000), null);
  assert.equal(await readPass(secret, '', 2000), null);
  const admin = await signPass(secret, {c:'fmt', r:'admin', u:'u1'}, 1000);
  assert.equal(await readPass(secret, admin, 2000), null);
});

test('a short secret is never used to sign', async () => {
  await assert.rejects(signPass('court', {c:'fmt', r:'viewer'}));
});

test('the relay address becomes its WebSocket door with the pass', () => {
  assert.equal(relaySocketUrl('https://relais.example.workers.dev/', 'a.b'), 'wss://relais.example.workers.dev/socket?pass=a.b');
});
