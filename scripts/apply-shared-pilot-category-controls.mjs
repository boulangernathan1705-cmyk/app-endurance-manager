import fs from 'node:fs';

function replace(path, from, to) {
  const source=fs.readFileSync(path,'utf8');
  if(!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,160)}`);
  fs.writeFileSync(path,source.replace(from,to));
}

replace('app.js',
`  const canAdd=source&&!assigned&&event.categories.some(c=>!same.some(r=>r.category===c));`,
`  const canAdd=source&&event.categories.some(c=>!same.some(r=>r.category===c));`);

replace('app.js',
`  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}" aria-pressed="${selfMode}"`,`${selfMode?\'primary-button\':\'secondary-button\'} registration-nav-button`)}${canManage()?button(\'new-registration\',\'Ajouter un pilote\',`data-departure="${departure.id}" data-mode="pilot" aria-pressed="${otherMode}"`,`${otherMode?\'primary-button\':\'secondary-button\'} registration-nav-button`):\'\'}${canAdd?button(\'new-registration\',`+ Catégorie pour ${esc(source.name)}`,`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}" aria-pressed="${categoryMode}"`,`${categoryMode?\'primary-button\':\'secondary-button\'} registration-nav-button category-add-button`):\'\'}'}\`;`,
`  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}" aria-pressed="${selfMode}"`,`${selfMode?\'primary-button\':\'secondary-button\'} registration-nav-button`)}${canManage()?button(\'new-registration\',\'Ajouter un pilote\',`data-departure="${departure.id}" data-mode="pilot" aria-pressed="${otherMode}"`,`${otherMode?\'primary-button\':\'secondary-button\'} registration-nav-button`):\'\'}${canAdd?button(\'new-registration\',\'Ajouter une catégorie\',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}" aria-pressed="${categoryMode}"`,`${categoryMode?\'primary-button\':\'secondary-button\'} registration-nav-button category-add-button`):\'\'}'}\`;`);

replace('app.js',
`    : otherMode
      ? \`<div class="registration-context-banner other"><span>AUTRE PILOTE</span><strong>${'${esc(contextName||\'À choisir\')}'}</strong></div>\`
      : \`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${'${esc(contextName||user?.name||\'Mon inscription\')}'}</strong></div>\`;`,
`    : otherMode
      ? \`<div class="registration-context-banner other"><span>AUTRE PILOTE</span></div>\`
      : \`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${'${esc(contextName||user?.name||\'Mon inscription\')}'}</strong></div>\`;`);

replace('app.js',
`    ${'${assigned?\'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>\':\'\'}'}
    ${'${categoryMode?\'\':manualOther?`<label class="form-label" for="name-${departure.id}">Pseudo de l’autre pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:linkedOther?`<div class="selected-discord-pilot"><span>Pilote</span><strong>${esc(state.name)}</strong></div>`:guestSelf?`<label class="form-label" for="name-${departure.id}">Pseudo pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:\'\'}'}`,
`    ${'${categoryMode?\'\':manualOther?`<label class="form-label" for="name-${departure.id}">Pseudo de l’autre pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:linkedOther?\'\':guestSelf?`<label class="form-label" for="name-${departure.id}">Pseudo pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:\'\'}'}`);

replace('app.js',
`${'${event.categories.map(category=>button(\'category\',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${(assigned&&category!==state.category)||same.some(r=>r.id!==state.id&&r.category===category)?\'disabled\':\'\'} aria-pressed="${state.category===category}"`,`category-button ${categories[category]?.css||\'\'} ${state.category===category?\'active\':\'\'}`)).join(\'\')}'}`,
`${'${event.categories.map(category=>button(\'category\',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${((assigned&&state.id&&!categoryMode&&category!==state.category)||same.some(r=>r.id!==state.id&&r.category===category))?\'disabled\':\'\'} aria-pressed="${state.category===category}"`,`category-button ${categories[category]?.css||\'\'} ${state.category===category?\'active\':\'\'}`)).join(\'\')}'}`);

replace('app.js',
`${'${button(\'availability\',\'INDISPONIBLE\',`data-departure="${departure.id}" data-value="unavailable" ${assigned?\'disabled\':\'\'} aria-pressed="${state.status===\'unavailable\'}"`,`special-button unavailable ${state.status===\'unavailable\'?\'active\':\'\'}`)}'}`,
`${'${button(\'availability\',\'INDISPONIBLE\',`data-departure="${departure.id}" data-value="unavailable" ${assigned&&state.id&&!categoryMode?\'disabled\':\'\'} aria-pressed="${state.status===\'unavailable\'}"`,`special-button unavailable ${state.status===\'unavailable\'?\'active\':\'\'}`)}'}`);

replace('app.js',
`<small>${'${esc(registrationCarLabel(r))}'} · ${'${esc(statusLabel(r.status))}'}${'${r.preferredPilot?` · souhaite ${esc(r.preferredPilot)}`:\'\'}'}</small>`,
`<small>${'${esc(registrationCarLabel(r))}'}${'${r.preferredPilot?` · souhaite ${esc(r.preferredPilot)}`:\'\'}'}</small>`);

replace('tests/registration-pilot-flow.test.mjs',
`  assert.match(app,/selected-discord-pilot/);`,
`  assert.doesNotMatch(app,/selected-discord-pilot/);
  assert.ok(app.includes("linkedOther?'':guestSelf?"));`);

const extraTest=`\n\ntest('managed Discord registrations stay shared between organizer and pilot',()=>{\n  assert.match(core,/reg\.participant_user_id === actor\.user\.id/);\n  assert.match(core,/reg\.owner_user_id === actor\.user\.id/);\n  assert.ok(worker.includes("canEdit:owned(reg, actor) || actor.user?.role === 'admin'"));\n});\n\ntest('self and managed pilots can add another category without duplicate identity chrome',()=>{\n  assert.match(app,/Ajouter une catégorie/);\n  assert.match(app,/const canAdd=source&&event\.categories/);\n  assert.doesNotMatch(app,/Ce pilote est affecté à un équipage\. Sa catégorie est fixée/);\n  assert.doesNotMatch(app,/AUTRE PILOTE<\\\/span><strong>/);\n});\n`;
fs.appendFileSync('tests/registration-pilot-flow.test.mjs',extraTest);

fs.writeFileSync('migrations/0013_allow_assigned_category_interests.sql',`-- Allow a pilot already assigned to one crew to keep additional category registrations on the same departure.\n-- The crew membership trigger still guarantees that the participant can belong to only one crew.\nDROP TRIGGER IF EXISTS participant_assigned_insert;\nDROP TRIGGER IF EXISTS participant_assigned_update;\n\nCREATE TRIGGER participant_assigned_update BEFORE UPDATE OF category,status,event_id,departure_id ON registrations BEGIN\n SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (\n   SELECT 1 FROM crew_members m\n   WHERE m.registration_id=OLD.id\n ) AND (NEW.category!=OLD.category OR NEW.status='unavailable' OR NEW.event_id!=OLD.event_id OR NEW.departure_id!=OLD.departure_id);\nEND;\n`);

replace('index.html','/app.js?v=24-registration-mode-switch','/app.js?v=25-shared-pilot-categories');
