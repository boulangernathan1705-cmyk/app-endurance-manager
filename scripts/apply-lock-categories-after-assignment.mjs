import fs from 'node:fs';

function replace(path, from, to) {
  const source=fs.readFileSync(path,'utf8');
  if(!source.includes(from)) throw new Error(`Pattern not found in ${path}: ${from.slice(0,140)}`);
  fs.writeFileSync(path,source.replace(from,to));
}

replace('app.js',
`  const canAdd=source&&event.categories.some(c=>!same.some(r=>r.category===c));`,
`  const canAdd=source&&!assigned&&event.categories.some(c=>!same.some(r=>r.category===c));`);

fs.writeFileSync('migrations/0014_lock_categories_after_crew_assignment.sql',`-- Once a participant is assigned to a crew on a departure, no new category registration may be added for that participant on that departure.\n-- Crew assignment itself already deletes the participant's other category registrations.\nDROP TRIGGER IF EXISTS participant_assigned_insert;\nCREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations BEGIN\n SELECT RAISE(ABORT,'participant_already_assigned') WHERE EXISTS (\n   SELECT 1 FROM crew_members m JOIN registrations r ON r.id=m.registration_id\n   WHERE r.participant_id=NEW.participant_id AND r.event_id=NEW.event_id AND r.departure_id=NEW.departure_id\n );\nEND;\n`);

const testPath='tests/registration-pilot-flow.test.mjs';
const testSource=fs.readFileSync(testPath,'utf8');
const extra=`\n\ntest('crew assignment locks extra categories again',()=>{\n  assert.match(app,/const canAdd=source&&!assigned&&event\\.categories/);\n  const migration=fs.readFileSync('migrations/0014_lock_categories_after_crew_assignment.sql','utf8');\n  assert.match(migration,/CREATE TRIGGER participant_assigned_insert BEFORE INSERT ON registrations/);\n});\n`;
if(!testSource.includes("test('crew assignment locks extra categories again'")) fs.writeFileSync(testPath,testSource+extra);

replace('index.html','/app.js?v=25-shared-pilot-categories','/app.js?v=26-lock-categories-after-assignment');
