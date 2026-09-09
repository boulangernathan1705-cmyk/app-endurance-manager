import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const core=fs.readFileSync('server/core.mjs','utf8');
const worker=fs.readFileSync('server/worker.mjs','utf8');

test('organizer pilot picker only exposes Discord users',()=>{
  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\.user_id=u\.id/);
  assert.match(app,/<option value="">Autre pilote<\/option>/);
  assert.match(app,/participants\.map/);
  assert.doesNotMatch(app,/Pilote sans compte Discord/);
});

test('external pilots do not create user accounts and are reused by pseudo',()=>{
  assert.match(core,/user_id IS NULL AND guest_hash IS NULL AND lower\(name\)=lower\(\?\)/);
  assert.match(core,/if \(existing\) return existing/);
  assert.doesNotMatch(app,/aucun compte utilisateur ne sera créé/i);
  assert.doesNotMatch(app,/Tu resteras responsable de cette inscription/i);
  assert.match(app,/Pseudo de l’autre pilote/);
});

test('registration mode switch clearly shows the active identity',()=>{
  assert.match(app,/Ajouter un pilote/);
  assert.match(app,/TON INSCRIPTION/);
  assert.match(app,/AUTRE PILOTE/);
  assert.match(app,/AJOUT D’UNE CATÉGORIE/);
  assert.match(app,/selfMode\?'primary-button':'secondary-button'/);
  assert.match(app,/otherMode\?'primary-button':'secondary-button'/);
});

test('Discord identities are read only while guests and external pilots keep a pseudo field',()=>{
  assert.match(worker,/discordLinked:Boolean\(reg\.participant_user_id\)/);
  assert.match(app,/discordLinked:!!reg\.discordLinked/);
  assert.match(app,/linkedOther/);
  assert.match(app,/guestSelf/);
  assert.doesNotMatch(app,/selected-discord-pilot/);
  assert.ok(app.includes("linkedOther?'':guestSelf?"));
});


test('managed Discord registrations stay shared between organizer and pilot',()=>{
  assert.match(core,/reg.participant_user_id === actor.user.id/);
  assert.match(core,/reg.owner_user_id === actor.user.id/);
  assert.ok(worker.includes("canEdit:owned(reg, actor) || actor.user?.role === 'admin'"));
});

test('self and managed pilots can add another category without duplicate identity chrome',()=>{
  assert.match(app,/Ajouter une catégorie/);
  assert.match(app,/const canAdd=source&&event.categories/);
  assert.doesNotMatch(app,/Ce pilote est affecté à un équipage. Sa catégorie est fixée/);
  assert.doesNotMatch(app,/AUTRE PILOTE<\/span><strong>/);
});
