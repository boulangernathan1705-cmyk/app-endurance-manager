import {api} from './api-client.mjs';
import {esc} from './core.mjs';

const formatRating = value => Number(value).toLocaleString('fr-FR',{maximumFractionDigits:1});
const starPath = 'M16 2.5 20 11 29.5 12.4 22.7 19 24.3 28.3 16 24 7.7 28.3 9.3 19 2.5 12.4 12 11Z';
const starMarkup = n => `<span class="event-review-star" data-star="${n}" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="${starPath}"/></svg><span class="event-review-star-fill"><svg viewBox="0 0 32 32"><path d="${starPath}"/></svg></span></span>`;

export function bindRatingPicker(form, initial=3.5) {
  const slider=form.elements.rating, output=form.querySelector('[data-rating-value]');
  const stars=[...form.querySelectorAll('[data-star]')];
  const sync=()=>{
    const value=Number(slider.value);
    output.textContent=formatRating(value);
    slider.setAttribute('aria-valuetext',formatRating(value)+' sur 5 étoiles');
    stars.forEach((star,index)=>star.style.setProperty('--star-fill',Math.max(0,Math.min(1,value-index))*100+'%'));
  };
  slider.value=String(initial);
  slider.addEventListener('input',sync);
  slider.addEventListener('change',sync);
  stars.forEach((star,index)=>star.addEventListener('click',event=>{
    const rect=star.getBoundingClientRect();
    slider.value=String(index+(event.clientX-rect.left<rect.width/2?0.5:1));
    sync();
    slider.focus({preventScroll:true});
  }));
  sync();
}

export async function mountEventReview(panel,eventId) {
  const path='/api/events/'+encodeURIComponent(eventId)+'/review';
  let data;
  try {data=await api(path);} catch {return;}
  if (!panel.isConnected || !data.available) return;
  if (!data.canVote && !data.own && data.average==null) return;
  panel.innerHTML='<h2>Avis des pilotes</h2>'+(data.average!=null?`<p class="event-review-average"><span aria-hidden="true">★</span> <strong>${Number(data.average).toFixed(1).replace('.',',')}/5</strong> · ${data.count} avis</p>`:'');
  if (!data.canVote) {
    if(data.own) panel.insertAdjacentHTML('beforeend',`<p>Ton avis : ${formatRating(data.own.rating)}/5</p>${data.own.comment?`<p>${esc(data.own.comment)}</p>`:''}`);
    return;
  }
  panel.insertAdjacentHTML('beforeend',`<form class="event-review-form"><fieldset><legend>Comment as-tu trouvé cet événement ?</legend>
    <div class="event-review-picker">
      <p class="event-review-score"><strong data-rating-value></strong><span> / 5</span></p>
      <div class="event-review-stars" aria-hidden="true">${[1,2,3,4,5].map(starMarkup).join('')}</div>
      <input type="range" name="rating" min="0.5" max="5" step="0.5" value="3.5" aria-label="Note sur 5 étoiles">
      <div class="event-review-scale"><span>Insatisfait</span><span>Excellent</span></div>
    </div></fieldset>
    <label>Commentaire (facultatif)<textarea name="comment" maxlength="1000" rows="3" placeholder="Une suggestion sur le format, la durée, l’organisation…">${esc(data.own?.comment||'')}</textarea></label>
    <small>Les organisateurs verront ton avis sans ton nom. La moyenne est visible par la communauté.</small>
    <div class="event-review-actions"><button class="primary-button" type="submit">${data.own?'Modifier mon avis':'Envoyer mon avis'}</button>${data.own?'<button class="secondary-button" type="button" data-delete-review>Supprimer mon avis</button>':''}<span role="status"></span></div></form>`);
  const form=panel.querySelector('form'), status=form.querySelector('[role=status]');
  bindRatingPicker(form,data.own?.rating??3.5);
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
