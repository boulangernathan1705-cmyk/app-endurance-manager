import fs from 'node:fs';

function replace(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,120)}`);
  fs.writeFileSync(path, source.replace(from, to));
}

// Backend: organizer selector is based on Discord users, not every historical participant profile.
replace('server/worker.mjs',
`  if (path === '/api/participants' && method === 'GET') {
    requireRole(actor.user);
    return json({participants:(await env.DB.prepare('SELECT id,name FROM participants ORDER BY name,id').all()).results});
  }`,
`  if (path === '/api/participants' && method === 'GET') {
    requireRole(actor.user);
    return json({participants:(await env.DB.prepare(\`SELECT u.id,u.name,p.id AS participantId
      FROM users u LEFT JOIN participants p ON p.user_id=u.id
      ORDER BY lower(u.name),u.id\`).all()).results});
  }`);

replace('server/core.mjs',
`async function registrationParticipant(env, actor, input, data) {
  const manager=!!actor.user && ['admin','organizer'].includes(actor.user.role);
  if (input.participantId) {`,
`async function registrationParticipant(env, actor, input, data) {
  const manager=!!actor.user && ['admin','organizer'].includes(actor.user.role);
  if (input.participantUserId) {
    if (!manager) fail(403,'Seuls les organisateurs peuvent inscrire un autre pilote.');
    if (!/^\\d{15,22}$/.test(input.participantUserId)) fail(400,'Compte Discord invalide.');
    const discordUser=await env.DB.prepare('SELECT id,name FROM users WHERE id=?').bind(input.participantUserId).first();
    if (!discordUser) fail(404,'Ce pilote Discord est introuvable. Actualise la page.');
    await env.DB.prepare(\`INSERT INTO participants(id,name,user_id,created_by,created_at) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO UPDATE SET name=excluded.name\`).bind(id(),discordUser.name,discordUser.id,actor.user.id,now()).run();
    return env.DB.prepare('SELECT * FROM participants WHERE user_id=?').bind(discordUser.id).first();
  }
  if (input.participantId) {`);

replace('server/core.mjs',
`  if (input.forOther===true) {
    // Reuse a known profile deliberately; a matching name never grants ownership.
    const existing=await env.DB.prepare('SELECT id FROM participants WHERE lower(name)=lower(?) LIMIT 1').bind(data.name).first();
    if (existing) fail(409,'Un pilote porte déjà ce pseudo. Choisis sa fiche dans « Pilote déjà inscrit ».');
    const participant={id:id(),name:data.name,user_id:null,guest_hash:null,created_by:actor.user.id};
    await env.DB.prepare('INSERT INTO participants(id,name,created_by,created_at) VALUES(?,?,?,?)').bind(participant.id,participant.name,actor.user.id,now()).run();
    return participant;
  }`,
`  if (input.forOther===true) {
    // A manually entered name is an external pilot identity, never a site/Discord account.
    // Reuse an existing external identity with the same pseudo to avoid duplicate profiles.
    const existing=await env.DB.prepare(\`SELECT * FROM participants
      WHERE user_id IS NULL AND guest_hash IS NULL AND lower(name)=lower(?)
      ORDER BY created_at,id LIMIT 1\`).bind(data.name).first();
    if (existing) return existing;
    const participant={id:id(),name:data.name,user_id:null,guest_hash:null,created_by:actor.user.id};
    await env.DB.prepare('INSERT INTO participants(id,name,created_by,created_at) VALUES(?,?,?,?)').bind(participant.id,participant.name,actor.user.id,now()).run();
    return participant;
  }`);

// Frontend: make self/other/category context explicit and only offer Discord-connected users.
replace('app.js',
`  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}"`,\'secondary-button add-pilot-button\')}${canManage()?button(\'new-registration\',\'+ Inscrire un pilote\',`data-departure="${departure.id}" data-mode="pilot"`,\'secondary-button add-pilot-button\'):\'\'}${canAdd?button(\'new-registration\',\'+ Ajouter une catégorie\',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,\'secondary-button add-pilot-button\'):\'\'}'}\`;
  const formTitle=state.id?\`Modifier l’inscription de ${'${esc(state.name)}'}\`:state.mode==='category'?'Ajouter une catégorie':state.forOther?'Inscrire un pilote':'Mon inscription';
  return \`<form class="form-section registration-form" data-kind="registration" data-departure="${'${departure.id}'}">
    <h3 class="form-title">${'${formTitle}'}<span class="registration-form-actions">${'${addButtons}'}</span></h3>
    ${'${selected&&!selected.mine?\'<p class="creation-help">Tu gères cette inscription pour un autre pilote.</p>\':\'\'}'}
    ${'${!state.id&&state.forOther&&canManage()?`<label class="form-label" for="participant-${departure.id}">Pilote déjà inscrit</label><select id="participant-${departure.id}" name="participant" data-departure="${departure.id}"><option value="">Créer une nouvelle fiche pilote</option>${participants.map(p=>`<option value="${esc(p.id)}" ${state.participantId===p.id?\'selected\':\'\'}>${esc(p.name)}</option>`).join(\'\')}</select><p class="creation-help">Choisis la fiche existante pour garder ensemble ses catégories, même si un autre organisateur l’a inscrit.</p>`:\'\'}'}
    ${'${assigned?\'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>\':\'\'}'}
    <label class="form-label" for="name-${'${departure.id}'}">Pseudo pilote</label>
    <input id="name-${'${departure.id}'}" name="pilotName" data-departure="${'${departure.id}'}" value="${'${esc(state.name)}'}" maxlength="30" required autocomplete="nickname" ${'${!state.id&&state.participantId?\'readonly\':\'\'}'}>`,
`  const contextName=state.name||source?.name||(!state.forOther?user?.name:'')||'';
  const addButtons=\`${'${button(\'my-registration\',\'Mon inscription\',`data-departure="${departure.id}"`,\'secondary-button registration-nav-button\')}${canManage()?button(\'new-registration\',\'+ Autre pilote\',`data-departure="${departure.id}" data-mode="pilot"`,\'primary-button registration-nav-button\'):\'\'}${canAdd?button(\'new-registration\',`+ Catégorie pour ${esc(source.name)}`,`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,\'secondary-button registration-nav-button category-add-button\'):\'\'}'}\`;
  const formTitle=state.id?\`Modifier l’inscription de ${'${esc(state.name)}'}\`:state.mode==='category'?\`Ajouter une catégorie à ${'${esc(contextName||\'ce pilote\')}'}\`:state.forOther?'Inscrire un autre pilote':'Mon inscription';
  const contextBanner=state.mode==='category'
    ? \`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${'${esc(contextName||\'Pilote\')}'}</strong><small>La nouvelle catégorie sera ajoutée à ce pilote, sans modifier ses autres inscriptions.</small></div>\`
    : state.forOther
      ? \`<div class="registration-context-banner other"><span>INSCRIPTION GÉRÉE</span><strong>${'${contextName?`Tu inscris ${esc(contextName)}`:\'Tu inscris un autre pilote\'}'}</strong><small>Cette inscription sera gérée par toi. Elle n’est pas ton inscription personnelle.</small></div>\`
      : \`<div class="registration-context-banner self"><span>TON INSCRIPTION</span><strong>${'${esc(contextName||\'Mon inscription\')}'}</strong><small>Les informations ci-dessous concernent ton propre départ.</small></div>\`;
  return \`<form class="form-section registration-form" data-kind="registration" data-departure="${'${departure.id}'}">
    <h3 class="form-title">${'${formTitle}'}<span class="registration-form-actions">${'${addButtons}'}</span></h3>
    ${'${contextBanner}'}
    ${'${!state.id&&state.forOther&&canManage()?`<section class="managed-pilot-picker"><label class="form-label" for="participant-${departure.id}">Pilote avec compte Discord</label><select id="participant-${departure.id}" name="participant" data-departure="${departure.id}"><option value="">— Pilote sans compte Discord —</option>${participants.map(p=>`<option value="${esc(p.id)}" ${state.participantUserId===p.id?\'selected\':\'\'}>${esc(p.name)}</option>`).join(\'\')}</select><p>Seuls les pilotes qui se sont déjà connectés au site avec Discord sont proposés ici. Sinon, laisse « Pilote sans compte Discord » et saisis simplement son pseudo.</p></section>`:\'\'}'}
    ${'${assigned?\'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>\':\'\'}'}
    <label class="form-label" for="name-${'${departure.id}'}">Pseudo pilote</label>
    <input id="name-${'${departure.id}'}" name="pilotName" data-departure="${'${departure.id}'}" value="${'${esc(state.name)}'}" maxlength="30" required autocomplete="nickname" ${'${state.mode===\'category\'||state.participantUserId?\'readonly\':\'\'}'}>
    ${'${state.forOther?`<p class="managed-pilot-note ${state.participantUserId?\'discord\':\'external\'}">${state.participantUserId?\'Compte Discord sélectionné : cette inscription apparaîtra aussi au pilote.\':\'Pilote sans compte : aucun compte utilisateur ne sera créé. Tu resteras responsable de cette inscription.\'}</p>`:\'\'}'}`);

replace('app.js',
`  const payload={name:state.name,status:state.status,category:state.category,cars:state.cars,carAny:state.carAny,preferredPilot:state.preferredPilot||'',version:state.version,participantId:state.participantId,forOther:!!state.forOther};`,
`  const payload={name:state.name,status:state.status,category:state.category,cars:state.cars,carAny:state.carAny,preferredPilot:state.preferredPilot||'',version:state.version,participantId:state.participantId,participantUserId:state.participantUserId,forOther:!!state.forOther};`);

replace('app.js',
`      drafts[departure.id]={...(categoryMode&&existing?registrationDraft(existing):{name:'',status:'',preferredPilot:'',forOther:canManage()}),category:'',cars:[],carAny:false,id:null,version:null,mode:categoryMode?'category':'pilot'};`,
`      drafts[departure.id]={...(categoryMode&&existing?registrationDraft(existing):{name:'',status:'',preferredPilot:'',forOther:canManage(),participantUserId:null}),category:'',cars:[],carAny:false,id:null,version:null,mode:categoryMode?'category':'pilot'};`);

replace('app.js',
`  if(field.name==='participant'){
    const draft=drafts[field.dataset.departure],participant=participants.find(p=>p.id===field.value);
    if(draft){draft.participantId=participant?.id;draft.name=participant?.name||'';draft.category='';draft.cars=[];draft.carAny=false;renderEvent();}return;
  }`,
`  if(field.name==='participant'){
    const draft=drafts[field.dataset.departure],participant=participants.find(p=>p.id===field.value);
    if(draft){draft.participantUserId=participant?.id||null;draft.participantId=participant?.participantId||null;draft.name=participant?.name||'';draft.category='';draft.cars=[];draft.carAny=false;renderEvent();}return;
  }`);

// CSS isolated from the rest of the interface.
fs.writeFileSync('styles/registration-context.css', `/* Registration identity/context: make it unmistakable who is being edited. */
.registration-form-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.registration-nav-button{min-height:38px;padding:8px 13px;font-size:12px;font-weight:850}
.category-add-button{border-color:rgba(53,185,120,.55);color:#dff8e9}
.registration-context-banner{display:grid;gap:4px;margin:12px 0 16px;padding:12px 14px;border:1px solid var(--border);border-left-width:4px;border-radius:9px;background:var(--panel2)}
.registration-context-banner span{font-size:10px;font-weight:950;letter-spacing:1.1px;color:var(--muted)}
.registration-context-banner strong{font-size:17px;line-height:1.15}
.registration-context-banner small{font-size:12px;line-height:1.4;color:var(--muted)}
.registration-context-banner.self{border-left-color:var(--green)}
.registration-context-banner.other{border-left-color:#e7a83c;background:linear-gradient(90deg,rgba(231,168,60,.10),var(--panel2) 38%)}
.registration-context-banner.other span{color:#e7b55e}
.registration-context-banner.category{border-left-color:#4aa3df;background:linear-gradient(90deg,rgba(74,163,223,.10),var(--panel2) 38%)}
.registration-context-banner.category span{color:#79bde8}
.managed-pilot-picker{display:grid;gap:7px;margin:8px 0 14px;padding:12px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.02)}
.managed-pilot-picker p,.managed-pilot-note{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
.managed-pilot-note{margin:-3px 0 13px;padding-left:10px;border-left:3px solid var(--border)}
.managed-pilot-note.discord{border-left-color:var(--green);color:#bfe9cf}
.managed-pilot-note.external{border-left-color:#e7a83c;color:#e8d4ae}
@media(max-width:700px){.form-title{align-items:flex-start}.registration-form-actions{width:100%;justify-content:flex-start;margin-top:8px}.registration-nav-button{flex:1 1 auto}.registration-context-banner{margin-top:8px;padding:11px 12px}.registration-context-banner strong{font-size:15px}}
`);

replace('styles.css',
`@import url('/styles/registration-density.css');`,
`@import url('/styles/registration-density.css');\n@import url('/styles/registration-context.css');`);

replace('index.html',
`<link rel="stylesheet" href="/styles.css?v=29-availability-timeline">`,
`<link rel="stylesheet" href="/styles.css?v=30-registration-pilot-flow">`);
replace('index.html',
`<script type="module" src="/app.js?v=22-availability-timeline"></script>`,
`<script type="module" src="/app.js?v=23-registration-pilot-flow"></script>`);

// A lightweight regression test protects the intended split between Discord users and external pilots.
fs.writeFileSync('tests/registration-pilot-flow.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst core=fs.readFileSync('server/core.mjs','utf8');\nconst worker=fs.readFileSync('server/worker.mjs','utf8');\n\ntest('organizer pilot picker only exposes Discord users',()=>{\n  assert.match(worker,/FROM users u LEFT JOIN participants p ON p\\.user_id=u\\.id/);\n  assert.match(app,/Pilote avec compte Discord/);\n  assert.match(app,/Pilote sans compte Discord/);\n});\n\ntest('external pilots do not create user accounts and are reused by pseudo',()=>{\n  assert.match(core,/user_id IS NULL AND guest_hash IS NULL AND lower\\(name\\)=lower\\(\\?\\)/);\n  assert.match(core,/if \\(existing\\) return existing/);\n  assert.match(app,/aucun compte utilisateur ne sera créé/i);\n});\n\ntest('registration context distinguishes self other and category',()=>{\n  assert.match(app,/TON INSCRIPTION/);\n  assert.match(app,/INSCRIPTION GÉRÉE/);\n  assert.match(app,/AJOUT D’UNE CATÉGORIE/);\n});\n`);

console.log('Registration pilot flow patch applied.');
