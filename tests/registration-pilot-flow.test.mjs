import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registration=fs.readFileSync('front/app/registration.mjs','utf8');
const actions=fs.readFileSync('front/app/actions.mjs','utf8');
const clientCore=fs.readFileSync('front/app/core.mjs','utf8');
const eventView=fs.readFileSync('front/app/event-view.mjs','utf8');
const core=fs.readFileSync('server/core.mjs','utf8');
const worker=fs.readFileSync('server/worker.mjs','utf8');
const game=fs.readFileSync('game.html','utf8');

test('all logged in pilots can use the Discord pilot picker',()=>{
  assert.match(worker,/if \(!actor\.user\) fail\(401,'Connecte-toi avec Discord pour choisir un pilote\.'/);
  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\.user_id=u\.id/);
  assert.doesNotMatch(core,/if \(!manager\) fail\(403,'Seuls les organisateurs peuvent inscrire un autre pilote\.'/);
  assert.match(clientCore,/state\.participants=state\.user \? \(await api\('\/api\/participants'\)\)\.participants : \[\]/);
  assert.match(eventView,/Inscrire un autre pilote/);
  assert.match(registration,/name="participant"/);
  assert.match(registration,/participantUserId/);
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
  assert.match(registration,/function renderRegistrationWorkspace\(event,departure\)/);
  assert.match(registration,/function renderRegistrationForm\(event,departure,stateDraft=draftFor\(departure\)\)/);
  assert.match(registration,/renderAvailabilityTimeline\(\{departure,duration,status:stateDraft\.status,interactive:true/);
  assert.match(actions,/case 'new-registration'/);
  assert.match(actions,/forOther:!!state\.user/);
  assert.match(actions,/case 'edit-registration'/);
  assert.match(actions,/state\.drafts\[departure\.id\]=registrationDraft\(reg\)/);
  assert.doesNotMatch(game,/front\/registration-sharing\.mjs|ux-refinement\.js/);
  assert.match(game,/app\.js\?v=[0-9]+-[a-z0-9-]+/i);
});

test('personal registration and crew creation share the same departure action block',()=>{
  assert.match(eventView,/Modifier mon inscription/);
  assert.match(eventView,/S’inscrire/);
  assert.match(eventView,/Inscrire un autre pilote/);
  assert.match(eventView,/departure-action-panel/);
  assert.match(eventView,/departure-primary-actions/);
  assert.match(eventView,/departure-self-registration/);
  assert.match(eventView,/departure-create-crew/);
  assert.doesNotMatch(registration,/\+ Ajouter un pilote/);
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
});

test('creator metadata is only exposed to creator participant or managers',()=>{
  assert.match(worker,/actor\.user\.id === creatorId \|\| actor\.user\.id === participantUserId \|\| isRegistrationManager\(actor\)/);
  assert.match(worker,/addedByName:canSeeCreator \? \(userNames\.get\(creatorId\) \|\| ''\) : ''/);
  assert.match(registration,/registration-origin-info/);
  assert.match(registration,/Inscription ajoutée par/);
});

test('self and managed pilots can still add another category',()=>{
  assert.match(registration,/function renderAddCategoryAction/);
  assert.match(registration,/Ajouter une catégorie/);
  assert.match(registration,/const canAdd=!!source&&!assigned&&stateDraft\.mode!=='category'&&event\.categories/);
  assert.match(registration,/registration-workspace-actions/);
  assert.match(registration,/category-add-button/);
});

test('crew assignment still locks extra categories',()=>{
  const migration=fs.readFileSync('migrations/0014_lock_categories_after_crew_assignment.sql','utf8');
  assert.match(migration,/CREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations/);
});
