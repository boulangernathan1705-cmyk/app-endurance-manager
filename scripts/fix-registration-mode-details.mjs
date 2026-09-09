import fs from 'node:fs';

function replace(path, from, to) {
  const source=fs.readFileSync(path,'utf8');
  if(!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,140)}`);
  fs.writeFileSync(path,source.replace(from,to));
}

// Preserve guest signups, while treating a Discord-linked identity as read-only in the registration form.
replace('server/worker.mjs',
`return {id:reg.id, participantId:reg.participant_id, name:reg.participant_name||reg.name, category:reg.category, car:cars[0] || reg.car || '', cars, carAny:Boolean(reg.car_any), status:reg.status, preferredPilot:reg.preferred_pilot || '', version:reg.version, mine:personal(reg, actor), managed:owned(reg,actor)&&!personal(reg,actor), canEdit:owned(reg, actor) || actor.user?.role === 'admin'};`,
`return {id:reg.id, participantId:reg.participant_id, name:reg.participant_name||reg.name, category:reg.category, car:cars[0] || reg.car || '', cars, carAny:Boolean(reg.car_any), status:reg.status, preferredPilot:reg.preferred_pilot || '', version:reg.version, discordLinked:Boolean(reg.participant_user_id), mine:personal(reg, actor), managed:owned(reg,actor)&&!personal(reg,actor), canEdit:owned(reg, actor) || actor.user?.role === 'admin'};`);

replace('app.js',
`return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',id:reg.id,version:reg.version,participantId:reg.participantId,mine:reg.mine,forOther:!reg.mine};`,
`return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',id:reg.id,version:reg.version,participantId:reg.participantId,discordLinked:!!reg.discordLinked,mine:reg.mine,forOther:!reg.mine};`);

replace('app.js',
`  const categoryMode=state.mode==='category';\n  const addButtons=`,
`  const categoryMode=state.mode==='category';\n  const linkedOther=state.forOther&&!!(state.participantUserId||state.discordLinked);\n  const manualOther=state.forOther&&!linkedOther&&!categoryMode;\n  const guestSelf=!state.forOther&&!user;\n  const addButtons=`);

replace('app.js',
`${'${state.forOther&&!state.participantUserId&&state.mode!==\'category\'?`<label class="form-label" for="name-${departure.id}">Pseudo de l’autre pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:state.forOther&&state.participantUserId?`<div class="selected-discord-pilot"><span>Pilote</span><strong>${esc(state.name)}</strong></div>`:\'\'}'}`,
`${'${categoryMode?\'\':manualOther?`<label class="form-label" for="name-${departure.id}">Pseudo de l’autre pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:linkedOther?`<div class="selected-discord-pilot"><span>Pilote</span><strong>${esc(state.name)}</strong></div>`:guestSelf?`<label class="form-label" for="name-${departure.id}">Pseudo pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:\'\'}'}`);

// Replace the regression file entirely: old copy asserted helper text that is intentionally gone.
fs.writeFileSync('tests/registration-pilot-flow.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst core=fs.readFileSync('server/core.mjs','utf8');\nconst worker=fs.readFileSync('server/worker.mjs','utf8');\n\ntest('organizer pilot picker only exposes Discord users',()=>{\n  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\\.user_id=u\\.id/);\n  assert.match(app,/<option value="">Autre pilote<\\/option>/);\n  assert.match(app,/participants\\.map/);\n  assert.doesNotMatch(app,/Pilote sans compte Discord/);\n});\n\ntest('external pilots do not create user accounts and are reused by pseudo',()=>{\n  assert.match(core,/user_id IS NULL AND guest_hash IS NULL AND lower\\(name\\)=lower\\(\\?\\)/);\n  assert.match(core,/if \\(existing\\) return existing/);\n  assert.doesNotMatch(app,/aucun compte utilisateur ne sera créé/i);\n  assert.doesNotMatch(app,/Tu resteras responsable de cette inscription/i);\n  assert.match(app,/Pseudo de l’autre pilote/);\n});\n\ntest('registration mode switch clearly shows the active identity',()=>{\n  assert.match(app,/Ajouter un pilote/);\n  assert.match(app,/TON INSCRIPTION/);\n  assert.match(app,/AUTRE PILOTE/);\n  assert.match(app,/AJOUT D’UNE CATÉGORIE/);\n  assert.match(app,/selfMode\\?'primary-button':'secondary-button'/);\n  assert.match(app,/otherMode\\?'primary-button':'secondary-button'/);\n});\n\ntest('Discord identities are read only while guests and external pilots keep a pseudo field',()=>{\n  assert.match(worker,/discordLinked:Boolean\\(reg\\.participant_user_id\\)/);\n  assert.match(app,/discordLinked:!!reg\\.discordLinked/);\n  assert.match(app,/linkedOther/);\n  assert.match(app,/guestSelf/);\n  assert.match(app,/selected-discord-pilot/);\n});\n`);
