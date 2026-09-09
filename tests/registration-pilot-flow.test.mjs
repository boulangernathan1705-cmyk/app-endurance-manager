import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const core=fs.readFileSync('server/core.mjs','utf8');
const worker=fs.readFileSync('server/worker.mjs','utf8');

test('organizer pilot picker only exposes Discord users',()=>{
  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\.user_id=u\.id/);
  assert.match(app,/Pilote avec compte Discord/);
  assert.match(app,/Pilote sans compte Discord/);
});

test('external pilots do not create user accounts and are reused by pseudo',()=>{
  assert.match(core,/user_id IS NULL AND guest_hash IS NULL AND lower\(name\)=lower\(\?\)/);
  assert.match(core,/if \(existing\) return existing/);
  assert.match(app,/aucun compte utilisateur ne sera créé/i);
});

test('registration context distinguishes self other and category',()=>{
  assert.match(app,/TON INSCRIPTION/);
  assert.match(app,/INSCRIPTION GÉRÉE/);
  assert.match(app,/AJOUT D’UNE CATÉGORIE/);
});
