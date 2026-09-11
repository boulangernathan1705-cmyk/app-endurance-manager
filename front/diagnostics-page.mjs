const app=document.getElementById('diagnostics-app');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function telemetry(path){
  let response;
  try {
    response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  } catch {
    throw Error('Impossible de joindre le service de diagnostics. Recharge la page puis réessaie.');
  }
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Impossible de charger les diagnostics.');
  return result;
}
function stamp(value){try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/Paris'}).format(new Date(Number(value)*1000));}catch{return String(value||'');}}
function render(errors){const rows=errors.map(item=>`<article class="members-row" style="align-items:flex-start;gap:14px"><div class="members-identity" style="min-width:180px"><strong>${esc(stamp(item.created_at))}</strong><small>${esc(item.kind)} · ${esc(item.method||'')} ${esc(item.api_path||'')}</small></div><div style="flex:1;min-width:0"><strong style="display:block;margin-bottom:5px">${esc(item.message||'Erreur sans message')}</strong><small style="display:block;overflow-wrap:anywhere">${esc(item.detail||'')}</small><small style="display:block;margin-top:6px;opacity:.75">Page: ${esc(item.page||'')} · ${esc(item.viewport||'')} · en ligne: ${item.online?'oui':'non'}</small><small style="display:block;margin-top:3px;opacity:.6;overflow-wrap:anywhere">${esc(item.user_agent||'')}</small></div></article>`).join('');
app.innerHTML=`<section class="members-panel"><div class="members-heading"><div><span class="members-kicker">ENDURANCE MANAGER</span><h1>DIAGNOSTICS</h1><p>Erreurs techniques remontées automatiquement par les navigateurs. Conservation limitée à 14 jours.</p></div><span class="members-count">${errors.length} erreur${errors.length>1?'s':''}</span></div>${rows?`<div class="members-list">${rows}</div>`:'<p class="members-loading">Aucune erreur récente.</p>'}</section>`;}
(async()=>{try{const result=await telemetry('/telemetry/admin/errors');render(Array.isArray(result.errors)?result.errors:[]);}catch(error){app.innerHTML=`<section class="members-panel members-error"><h1>Accès impossible</h1><p>${esc(error.message||String(error))}</p><a class="secondary-button" href="/">Retour à l’accueil</a></section>`;}})();
