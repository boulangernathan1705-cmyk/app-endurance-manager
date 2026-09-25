import {shortDateLabel,timeAt} from './dates.mjs';

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
// Same date and hour format as the rest of the site.
function stamp(value){const ms=Number(value)*1000;return Number.isFinite(ms)?`${shortDateLabel(ms)} · ${timeAt(ms)}`:String(value||'');}
function render(errors){
  const rows=errors.map(item=>`<article class="diagnostic-card"><div class="diagnostic-meta"><strong>${esc(stamp(item.created_at))}</strong><small>${esc(item.kind)} · ${esc(item.method||'')} ${esc(item.api_path||'')}</small></div><div class="diagnostic-body"><strong class="diagnostic-message">${esc(item.message||'Erreur sans message')}</strong><small class="diagnostic-detail">${esc(item.detail||'')}</small><small class="diagnostic-context">Page : ${esc(item.page||'')} · écran : ${esc(item.viewport||'')} · en ligne : ${item.online?'oui':'non'}</small><small class="diagnostic-agent">${esc(item.user_agent||'')}</small></div></article>`).join('');
  app.innerHTML=`<section class="members-panel"><h1 class="sr-only">Diagnostics</h1><div class="members-toolbar"><p class="members-help">Erreurs techniques remontées automatiquement par les navigateurs. Conservation limitée à 14 jours.</p><span class="members-count">${errors.length} erreur${errors.length>1?'s':''}</span></div>${rows?`<div class="diagnostics-list">${rows}</div>`:'<p class="members-loading">Aucune erreur récente.</p>'}</section>`;
}
(async()=>{try{const result=await telemetry('/api/client-errors');render(Array.isArray(result.errors)?result.errors:[]);}catch(error){app.innerHTML=`<section class="members-panel members-error"><h1>Accès impossible</h1><p>${esc(error.message||String(error))}</p><a class="secondary-button" href="/">Retour à l’accueil</a></section>`;}})();
