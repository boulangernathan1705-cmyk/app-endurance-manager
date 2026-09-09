import fs from 'node:fs';

function replace(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,140)}`);
  fs.writeFileSync(path, source.replace(from, to));
}

replace('app.js',
`  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}"`,\'secondary-button registration-nav-button\')}${canManage()?button(\'new-registration\',\'+ Autre pilote\',`data-departure="${departure.id}" data-mode="pilot"`,\'primary-button registration-nav-button\'):\'\'}${canAdd?button(\'new-registration\',`+ Catégorie pour ${esc(source.name)}`,`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,\'secondary-button registration-nav-button category-add-button\'):\'\'}'}\`;
  const formTitle=state.id?\`Modifier l’inscription de ${'${esc(state.name)}'}\`:state.mode==='category'?\`Ajouter une catégorie à ${'${esc(contextName||\'ce pilote\')}'}\`:state.forOther?'Inscrire un autre pilote':'Mon inscription';
  const contextBanner=state.mode==='category'
    ? \`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${'${esc(contextName||\'Pilote\')}'}</strong><small>La nouvelle catégorie sera ajoutée à ce pilote, sans modifier ses autres inscriptions.</small></div>\`
    : state.forOther
      ? \`<div class="registration-context-banner other"><span>INSCRIPTION GÉRÉE</span><strong>${'${contextName?`Tu inscris ${esc(contextName)}`:\'Tu inscris un autre pilote\'}'}</strong><small>Cette inscription sera gérée par toi. Elle n’est pas ton inscription personnelle.</small></div>\`
      : \`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${'${esc(contextName||\'Mon inscription\')}'}</strong><small>Les informations ci-dessous concernent ton propre départ.</small></div>\`;`,
`  const selfMode=!state.forOther&&state.mode!=='category';
  const otherMode=state.forOther&&state.mode!=='category';
  const categoryMode=state.mode==='category';
  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}" aria-pressed="${selfMode}"`,`${selfMode?\'primary-button\':\'secondary-button\'} registration-nav-button`)}${canManage()?button(\'new-registration\',\'Ajouter un pilote\',`data-departure="${departure.id}" data-mode="pilot" aria-pressed="${otherMode}"`,`${otherMode?\'primary-button\':\'secondary-button\'} registration-nav-button`):\'\'}${canAdd?button(\'new-registration\',`+ Catégorie pour ${esc(source.name)}`,`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}" aria-pressed="${categoryMode}"`,`${categoryMode?\'primary-button\':\'secondary-button\'} registration-nav-button category-add-button`):\'\'}'}\`;
  const formTitle=categoryMode?\`Ajouter une catégorie · ${'${esc(contextName||\'Pilote\')}' }\`:otherMode?\`Inscription de ${'${esc(contextName||\'autre pilote\')}' }\`:'Mon inscription';
  const contextBanner=categoryMode
    ? \`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${'${esc(contextName||\'Pilote\')}'}</strong></div>\`
    : otherMode
      ? \`<div class="registration-context-banner other"><span>AUTRE PILOTE</span><strong>${'${esc(contextName||\'À choisir\')}'}</strong></div>\`
      : \`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${'${esc(contextName||user?.name||\'Mon inscription\')}'}</strong></div>\`;`);

replace('app.js',
`    ${'${!state.id&&state.forOther&&canManage()?`<section class="managed-pilot-picker"><label class="form-label" for="participant-${departure.id}">Pilote avec compte Discord</label><select id="participant-${departure.id}" name="participant" data-departure="${departure.id}"><option value="">— Pilote sans compte Discord —</option>${participants.map(p=>`<option value="${esc(p.id)}" ${state.participantUserId===p.id?\'selected\':\'\'}>${esc(p.name)}</option>`).join(\'\')}</select><p>Seuls les pilotes qui se sont déjà connectés au site avec Discord sont proposés ici. Sinon, laisse « Pilote sans compte Discord » et saisis simplement son pseudo.</p></section>`:\'\'}'}
    ${'${assigned?\'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>\':\'\'}'}
    <label class="form-label" for="name-${'${departure.id}'}">Pseudo pilote</label>
    <input id="name-${'${departure.id}'}" name="pilotName" data-departure="${'${departure.id}'}" value="${'${esc(state.name)}'}" maxlength="30" required autocomplete="nickname" ${'${state.mode===\'category\'||state.participantUserId?\'readonly\':\'\'}'}>
    ${'${state.forOther?`<p class="managed-pilot-note ${state.participantUserId?\'discord\':\'external\'}">${state.participantUserId?\'Compte Discord sélectionné : cette inscription apparaîtra aussi au pilote.\':\'Pilote sans compte : aucun compte utilisateur ne sera créé. Tu resteras responsable de cette inscription.\'}</p>`:\'\'}'}`,
`    ${'${!state.id&&state.forOther&&canManage()?`<section class="managed-pilot-picker"><label class="form-label" for="participant-${departure.id}">Pilote</label><select id="participant-${departure.id}" name="participant" data-departure="${departure.id}"><option value="">Autre pilote</option>${participants.map(p=>`<option value="${esc(p.id)}" ${state.participantUserId===p.id?\'selected\':\'\'}>${esc(p.name)}</option>`).join(\'\')}</select></section>`:\'\'}'}
    ${'${assigned?\'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>\':\'\'}'}
    ${'${state.forOther&&!state.participantUserId&&state.mode!==\'category\'?`<label class="form-label" for="name-${departure.id}">Pseudo de l’autre pilote</label><input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname">`:state.forOther&&state.participantUserId?`<div class="selected-discord-pilot"><span>Pilote</span><strong>${esc(state.name)}</strong></div>`:\'\'}'}`);

replace('app.js',
`  state.name=form.elements.pilotName.value.trim();
  if(!state.name)throw Error('Indique ton pseudo.');`,
`  state.name=form.elements.pilotName?.value.trim() || state.name || (!state.forOther?user?.name?.slice(0,30):'');
  if(!state.name)throw Error(state.forOther?'Indique le pseudo du pilote.':'Ton compte Discord ne contient pas de nom utilisable.');`);

// Simplify the context styling and strengthen the active-mode buttons.
replace('styles/registration-context.css',
`.registration-nav-button{min-height:38px;padding:8px 13px;font-size:12px;font-weight:850}`,
`.registration-nav-button{min-height:38px;padding:8px 13px;font-size:12px;font-weight:850;transition:border-color .15s ease,background .15s ease,color .15s ease}\n.registration-nav-button[aria-pressed="true"]{box-shadow:inset 0 1px rgba(255,255,255,.13),0 0 0 1px rgba(53,185,120,.18)}`);
replace('styles/registration-context.css',
`.registration-context-banner small{font-size:12px;line-height:1.4;color:var(--muted)}\n`,
``);
replace('styles/registration-context.css',
`.managed-pilot-picker p,.managed-pilot-note{margin:0;color:var(--muted);font-size:12px;line-height:1.4}\n.managed-pilot-note{margin:-3px 0 13px;padding-left:10px;border-left:3px solid var(--border)}\n.managed-pilot-note.discord{border-left-color:var(--green);color:#bfe9cf}\n.managed-pilot-note.external{border-left-color:#e7a83c;color:#e8d4ae}\n`,
`.selected-discord-pilot{display:flex;align-items:center;gap:10px;margin:4px 0 14px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,.02)}\n.selected-discord-pilot span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}.selected-discord-pilot strong{font-size:15px}\n`);

replace('index.html',`/styles.css?v=31-registration-pilot-flow`,`/styles.css?v=32-registration-mode-switch`);
replace('index.html',`/app.js?v=23-registration-pilot-flow`,`/app.js?v=24-registration-mode-switch`);

// Update regression expectations to the simplified UI.
const testPath='tests/registration-pilot-flow.test.mjs';
let test=fs.readFileSync(testPath,'utf8');
test=test.replaceAll('+ Autre pilote','Ajouter un pilote');
test=test.replaceAll('Pilote sans compte Discord','Autre pilote');
test=test.replaceAll('Pilote sans compte : aucun compte utilisateur ne sera créé. Tu resteras responsable de cette inscription.','');
fs.writeFileSync(testPath,test);
