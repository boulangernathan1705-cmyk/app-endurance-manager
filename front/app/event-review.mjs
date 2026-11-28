import {api} from './api-client.mjs';
import {esc} from './core.mjs';

export async function mountEventReview(panel,eventId) {
  const path='/api/events/'+encodeURIComponent(eventId)+'/review';
  let data;
  try {data=await api(path);} catch {return;}
  if (!panel.isConnected || !data.available) return;
  if (!data.canVote && !data.own && data.average==null) return;
  panel.innerHTML='<h2>Avis des pilotes</h2>'+(data.average!=null?`<p class="event-review-average"><span aria-hidden="true">★</span> <strong>${Number(data.average).toFixed(1).replace('.',',')}/5</strong> · ${data.count} avis</p>`:'');
  if (!data.canVote) {
    if(data.own) panel.insertAdjacentHTML('beforeend',`<p>Ton avis : ${data.own.rating}/5</p>${data.own.comment?`<p>${esc(data.own.comment)}</p>`:''}`);
    return;
  }
  panel.insertAdjacentHTML('beforeend',`<form class="event-review-form"><fieldset><legend>Comment as-tu trouvé cet événement ?</legend>
    <div class="event-review-stars">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rating" value="${n}" required ${data.own?.rating===n?'checked':''}><span aria-hidden="true">★</span><span class="event-review-sr">${n} étoile${n>1?'s':''}</span></label>`).join('')}</div></fieldset>
    <label>Commentaire (facultatif)<textarea name="comment" maxlength="1000" rows="3" placeholder="Une suggestion sur le format, la durée, l’organisation…">${esc(data.own?.comment||'')}</textarea></label>
    <small>Les organisateurs verront ton avis sans ton nom. La moyenne est visible par la communauté.</small>
    <div class="event-review-actions"><button class="primary-button" type="submit">${data.own?'Modifier mon avis':'Envoyer mon avis'}</button>${data.own?'<button class="secondary-button" type="button" data-delete-review>Supprimer mon avis</button>':''}<span role="status"></span></div></form>`);
  const form=panel.querySelector('form'), status=form.querySelector('[role=status]');
  const save=async(method)=>{
    const buttons=[...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
    try {
      await api(path,method,method==='PUT'?{rating:Number(form.elements.rating.value),comment:form.elements.comment.value}:undefined);
      await mountEventReview(panel,eventId);
      if (panel.isConnected) panel.insertAdjacentHTML('beforeend','<p role="status">Ton avis a été enregistré.</p>');
    } catch(error) {status.textContent=error.message;}
    finally {buttons.forEach(b=>b.disabled=false);}
  };
  form.addEventListener('submit',e=>{e.preventDefault();void save('PUT');});
  form.querySelector('[data-delete-review]')?.addEventListener('click',()=>{if(confirm('Supprimer ton avis ?'))void save('DELETE');});
}
