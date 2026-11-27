// Platform-only supervision. The API client and formatting are shared with the rest of administration.
export const SUPERVISION_PANEL = `<section class="settings-card"><h2>Supervision Discord</h2>
  <p class="members-help">État de toutes les communautés d’après le suivi du site. La vérification des fils fermés interroge Discord en lecture seule.</p>
  <details class="discord-diagnostic" data-bot-supervision><summary>Ouvrir le tableau de suivi</summary>
    <div class="setup-actions"><button type="button" class="secondary-button" data-supervision-refresh>Actualiser</button></div>
    <div data-supervision-body aria-live="polite"><p class="members-help">Chargement…</p></div></details></section>`;
function supervisionMarkup(result, esc, diagWhen) {
  const states={error:['bad','Erreur enregistrée'],attention:['wait','À surveiller'],recorded:['ok','Aucune anomalie détectée'],off:['wait','Modules désactivés']};
  const labels={'thread':'Fil à fermer','voice-close':'Vocal à fermer (peut être occupé)','voice-create':'Vocal attendu','voice-message':'Message du vocal manquant'};
  const when=value=>value?diagWhen(value):'non enregistré';
  const rows=result.communities.map(item=>{
    const [tone,label]=states[item.state]||states.attention;
    const issues=item.issues.map(issue=>`<li>${esc(labels[issue.kind]||issue.kind)} : ${esc(issue.name)}${issue.since?' · '+esc(when(issue.since)):''}</li>`).join('');
    const errors=item.errors.map(error=>`<p class="settings-status" role="alert">⚠ ${esc(error)}</p>`).join('');
    const closedThreads=(item.closedThreads||[]).map(thread=>`<li>
      ${esc(thread.name)} · Fermé le ${esc(when(thread.closedAt))}
      <button type="button" class="secondary-button" data-supervision-thread
        data-community="${esc(item.slug)}" data-event="${esc(thread.eventId)}">Vérifier sur Discord</button>
      <span class="settings-status" role="status"></span></li>`).join('');
    return `<details class="discord-diagnostic"><summary>${esc(item.name)} · <span class="${tone==='bad'?'platform-ko':tone==='ok'?'platform-ok':''}">${esc(label)}</span></summary>
      <ul class="members-help diag-facts">
      <li>Récap : ${item.recapOn?'actif':'inactif'} · Vocaux : ${item.voicesOn?'actifs':'inactifs'}</li>
      <li>Dernière vérification du récap : ${esc(when(item.lastRecap))}</li>
      <li>Dernière vérification d’un équipage : ${esc(when(item.lastVoice))}</li>
      <li>File de synchronisation : ${item.queueAt?'depuis '+esc(when(item.queueAt)):item.dirty?'mise à jour attendue':'aucune entrée'}</li>
      <li>${item.openThreads} publication(s) de course suivie(s) · ${item.openVoices} vocal(aux) suivi(s)</li>
      <li>${item.waitingVoices} vocal(aux) attendu(s) · ${item.incompleteVoices} message(s) manquant(s)</li>
      <li>${item.overdueThreads} publication(s) à fermer · ${item.overdueVoices} vocal(aux) à vérifier avant fermeture</li>
      <li>${item.orphanCount} ancien(s) suivi(s) avec salon restant</li>
      ${item.wrongServer?'<li>Le serveur configuré ne correspond plus à la communauté.</li>':''}</ul>
      ${errors}${issues?`<ul class="members-help">${issues}</ul>`:''}
      ${item.issueCount>item.issues.length?`<p class="members-help">${item.issueCount-item.issues.length} autre(s) anomalie(s).</p>`:''}
      ${closedThreads?`<details class="discord-diagnostic"><summary>Fils fermés récemment</summary>
        <ul class="members-help">${closedThreads}</ul></details>`:''}</details>`;
  }).join('');
  const problems=result.communities.filter(item=>['error','attention'].includes(item.state)).length;
  return `<p class="members-help">Relevé : ${esc(when(result.generatedAt))} · ${result.communities.length} communauté(s) · ${problems} à surveiller.</p>
    ${result.development?'<p class="members-help">DEV : les tâches planifiées sont désactivées. Les dates ne prouvent pas une panne.</p>':''}
    ${result.development&&result.testPreviewAvailable?'<div class="setup-actions"><button type="button" class="secondary-button" data-discord-test-preview>Envoyer un vrai test Discord</button><button type="button" class="secondary-button" data-discord-test-logos>Préparer les logos</button><button type="button" class="secondary-button" data-discord-test-diagnostic>Vérifier le webhook</button><span role="status" class="settings-status" data-preview-status></span></div><p class="members-help">Rendus exacts du bot : deux vrais fils et sept vocaux dans une catégorie isolée. Données fictives, boutons désactivés, aucun ping. Préparer les logos manquants avant le test. Supprimer uniquement les salons de test après validation.</p>':''}
    ${!result.botConfigured?'<p class="settings-status" role="alert">Le token du bot n’est pas configuré.</p>':''}
    ${rows||'<p class="members-help">Aucun serveur lié.</p>'}`;
}

export function installDiscordSupervision(app, {api, esc, diagWhen}) {
  async function loadSupervision(panel) {
    const body=panel.querySelector('[data-supervision-body]'), button=panel.querySelector('[data-supervision-refresh]');
    button.disabled=true;
    body.textContent='Chargement…';
    try {body.innerHTML=supervisionMarkup(await api('/api/platform/discord/supervision'), esc, diagWhen);panel.dataset.loaded='1';}
    catch(error){body.innerHTML=`<p class="settings-status" role="alert">${esc(error.message)}</p>`;}
    finally {button.disabled=false;}
  }
  app.addEventListener('toggle',event=>{
    const panel=event.target;
    if(panel.matches?.('[data-bot-supervision]')&&panel.open&&!panel.dataset.loaded&&!panel.querySelector('button').disabled)loadSupervision(panel);
  },true);
  async function verifySupervisionThread(button) {
    const status=button.nextElementSibling;
    const states={archived:'Archivé sur Discord',active:'Encore actif sur Discord',missing:'Introuvable sur Discord',
      forbidden:'Accès refusé par Discord',unavailable:'État indisponible',unconfigured:'Bot Discord non configuré'};
    const params=new URLSearchParams({community:button.dataset.community,event:button.dataset.event});
    button.disabled=true;
    status.textContent='Vérification…';
    try {
      const {state}=await api(`/api/platform/discord/supervision/thread?${params}`);
      status.textContent=states[state]||states.unavailable;
    } catch(error) {status.textContent=error.message;}
    finally {button.disabled=false;}
  }
  async function sendPreview(button,action='APERÇU'){
    const diagnose=action==='DIAGNOSTIC',logos=action==='PREPARER_LOGOS';
    if(logos&&!confirm('Ajouter les logos manquants à l’application Discord du bot ? Si le bot est partagé avec la production, ces nouveaux emojis seront aussi disponibles en production. Aucun emoji existant ne sera modifié.'))return;
    if(!diagnose&&!logos&&!confirm('Créer les vrais fils et vocaux de test, uniquement dans le salon privé et une catégorie isolée ? Aucun événement ou équipage réel ne sera créé.'))return;
    const area=button.parentElement,status=area.querySelector('[data-preview-status]'),buttons=area.querySelectorAll('button');
    buttons.forEach(item=>item.disabled=true);status.textContent=diagnose?'Vérification…':logos?'Préparation des logos…':'Création des salons et envoi…';
    try{
      const result=await api('/api/platform/discord/test-preview','POST',{confirm:action});
      status.textContent=result.ok?(diagnose?'Webhook valide. Salon de destination : ':logos?`${result.added.length} logo(s) ajouté(s).`:`${result.sent} messages, ${result.created.threads.length} fils et ${result.created.voices.length} vocaux créés.`):`${result.stage||'Envoi'} : ${result.error}${result.missing?.length?' ('+result.missing.join(', ')+')':''}${diagnose||logos?'':` (${result.sent||0} message(s) confirmé(s))`}`;
      if(diagnose&&result.ok&&/^https:\/\/discord\.com\/channels\/\d{15,22}\/\d{15,22}$/.test(result.channelUrl||'')){
        const link=document.createElement('a');link.href=result.channelUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ouvrir le salon';status.append(link);
      }
    }catch(error){status.textContent=error.message;}
    finally{buttons.forEach(item=>item.disabled=false);}
  }
  app.addEventListener('click',event=>{
    const preview=event.target.closest('[data-discord-test-preview]');
    if(preview){sendPreview(preview);return;}
    const diagnostic=event.target.closest('[data-discord-test-diagnostic]');
    if(diagnostic){sendPreview(diagnostic,'DIAGNOSTIC');return;}
    const logos=event.target.closest('[data-discord-test-logos]');
    if(logos){sendPreview(logos,'PREPARER_LOGOS');return;}
    const thread=event.target.closest('[data-supervision-thread]');
    if(thread)verifySupervisionThread(thread);
    const button=event.target.closest('[data-supervision-refresh]');
    if(button)loadSupervision(button.closest('[data-bot-supervision]'));
  });
}
