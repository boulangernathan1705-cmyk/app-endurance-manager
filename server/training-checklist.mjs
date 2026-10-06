import {EXERCISES,checklistScope,checklistEvidence,checklistItems,analysisFromLive} from '../shared/training-checklist.mjs';
import {analyse,circuitOf,normal} from '../shared/training.mjs';
export async function recordChecklist(env,user,scope,proof) {
  const statements=Object.entries(proof).map(([exercise,evidence])=>env.DB.prepare(`INSERT INTO training_checklist(user_id,scope,exercise,selected,auto,proof) VALUES(?,?,?,?,1,?)
    ON CONFLICT(user_id,scope,exercise) DO UPDATE SET auto=1,proof=excluded.proof WHERE training_checklist.auto=0`)
    .bind(user,scope,exercise,EXERCISES.find(item=>item.key===exercise).default?1:0,evidence));
  if(statements.length)await env.DB.batch(statements);
}
export async function sessionChecklist(env,user,session,live=false) {
  const circuit=circuitOf(live?session.track:session.venue)||normal(live?session.track:session.venue);
  const proof=checklistEvidence(live?analysisFromLive([session]):analyse([session]),live?[session]:[]);
  await recordChecklist(env,user,checklistScope(circuit,session.carClass),proof);
}
export async function getChecklist(env,user,scope,proof,legacyMarks=[]) {
  const read=async()=>(await env.DB.prepare('SELECT * FROM training_checklist WHERE user_id=? AND scope=?').bind(user,scope).all()).results||[];
  let rows=await read();
  const pending=Object.fromEntries(Object.entries(proof).filter(([key])=>!rows.some(row=>row.exercise===key&&row.auto)));
  await recordChecklist(env,user,scope,pending);
  const legacy=legacyMarks.filter(key=>EXERCISES.some(item=>item.key===key)&&!rows.some(row=>row.exercise===key));
  if(legacy.length)await env.DB.batch(legacy.map(exercise=>env.DB.prepare('INSERT OR IGNORE INTO training_checklist(user_id,scope,exercise,selected,manual) VALUES(?,?,?,1,1)').bind(user,scope,exercise)));
  if(Object.keys(pending).length||legacy.length)rows=await read();
  return {scope,items:checklistItems(rows)};
}
