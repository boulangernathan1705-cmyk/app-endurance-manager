import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const core=fs.readFileSync('server/core.mjs','utf8');
const worker=fs.readFileSync('server/worker.mjs','utf8');
const game=fs.readFileSync('game.html','utf8');

test('all logged in pilots can use the Discord pilot picker',()=>{
  assert.match(worker,/if \(!actor\.user\) fail\(401,'Connecte-toi avec Discord pour choisir un pilote\.'/);
  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\.user_id=u\.id/);
  assert.doesNotMatch(core,/if \(!manager\) fail\(403,'Seuls les organisateurs peuvent inscrire un autre pilote\.'/);
  assert.match(app,/participants=user\?\(await api\('\/api\/participants'\)\)\.participants:\[\]/);
  assert.match(app,/\+ Ajouter un pilote/);
  assert.match(app,/name="participant"/);
  assert.match(app,/participantUserId/);
});

test('Discord identity is authoritative when another pilot is selected',()=>{
  assert.match(core,/data\.name=discordUser\.name/);
  assert.match(core,/data\.nameKey=data\.name\.normalize/);
  assert.match(core,/Ce pseudo correspond à un pilote Discord\. Sélectionne son compte dans la liste\./);
});

test('external pilots stay owned by the account that created them',()=>{
  assert.match(core,/user_id IS NULL AND guest_hash IS NULL AND created_by=\? AND lower\(name\)=lower\(\?\)/);
  assert.match(core,/\.bind\(actor\.user\.id,data\.name\)/);
  assert.match(core,/Connecte-toi avec Discord pour inscrire un autre pilote/);
});

test('adding and editing another pilot use the same native registration form',()=>{
  assert.match(app,/function renderRegistrationWorkspace\(event,departure\)/);
  assert.match(app,/renderRegistrationForm\(event,departure\)/);
  assert.match(app,/renderAvailabilityTimeline\(\{departure,duration,status:state\.status,interactive:true/);
  assert.match(app,/case 'new-registration'/);
  assert.match(app,/forOther:!!user/);
  assert.match(app,/case 'edit-registration'/);
  assert.match(app,/drafts\[departure\.id\]=registrationDraft\(reg\);eventSection='race';renderEvent\(\)/);
  assert.doesNotMatch(game,/front\/registration-sharing\.mjs/);
  assert.match(game,/app\.js\?v=47-native-registration-ui/);
});

test('the add pilot action is outside the personal form',()=>{
  assert.match(app,/registration-workspace-head/);
  assert.match(app,/registration-workspace-actions/);
  assert.match(app,/Gérer les inscriptions/);
  assert.match(app,/const addButtons=canAdd\?button\('new-registration','Ajouter une catégorie'/);
});

test('Discord registrations are editable by both creator and participant',()=>{
  assert.match(core,/reg\.participant_user_id === actor\.user\.id/);
  assert.match(core,/reg\.owner_user_id === actor\.user\.id/);
  assert.match(worker,/function canManageRegistration\(reg, actor\)/);
  assert.match(worker,/owned\(reg, actor\) \|\| isRegistrationManager\(actor\)/);
  assert.match(worker,/canEdit:canManageRegistration\(reg, actor\)/);
});

test('organizers and admins can edit every registration without owning it',()=>{
  assert.match(worker,/\['admin','organizer'\]\.includes\(actor\.user\?\.role\)/);
  assert.match(worker,/if \(!canManageRegistration\(reg,actor\)\) fail\(403/);
  assert.match(worker,/managed:owned\(reg,actor\)&&!personal\(reg,actor\)/);
});

test('creator metadata is only exposed to creator participant or managers',()=>{
  assert.match(worker,/actor\.user\.id === creatorId \|\| actor\.user\.id === participantUserId \|\| isRegistrationManager\(actor\)/);
  assert.match(worker,/addedByName:canSeeCreator \? \(userNames\.get\(creatorId\) \|\| ''\) : ''/);
  assert.match(app,/registration-origin-info/);
  assert.match(app,/Inscription ajoutée par/);
});

test('self and managed pilots can still add another category',()=>{
  assert.match(app,/Ajouter une catégorie/);
  assert.match(app,/const canAdd=source&&!assigned&&event\.categories/);
  assert.match(app,/category-add-button/);
});

test('crew assignment still locks extra categories',()=>{
  const migration=fs.readFileSync('migrations/0014_lock_categories_after_crew_assignment.sql','utf8');
  assert.match(migration,/CREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations/);
});
