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
  if (!data.canVote && !data.own && data.average==null && !data.canReadThreads) return;
  panel.innerHTML='<h2>Avis et discussions</h2>'+(data.average!=null?`<p class="event-review-average"><span aria-hidden="true">★</span> <strong>${Number(data.average).toFixed(1).replace('.',',')}/5</strong> · ${data.count} avis</p>`:'');
  if (!data.canVote) {
    if(data.own) panel.insertAdjacentHTML('beforeend',`<p>Ton avis : ${formatRating(data.own.rating)}/5</p>${data.own.comment?`<p>${esc(data.own.comment)}</p>`:''}`);
    if(data.canDelete) {const button=document.createElement('button');button.className='secondary-button';button.textContent='Supprimer mon avis';button.onclick=async()=>{if(!confirm('Supprimer ton avis et ses réponses ?'))return;try{await api(path,'DELETE');await mountEventReview(panel,eventId);}catch(error){alert(error.message);}};panel.append(button);}
    mountThreads(panel,path,data);
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
    <small>Ton pseudo, ta note et ton commentaire seront visibles par les membres de cette communauté pendant 30 jours après l’événement. Les réponses sont également publiques dans la communauté. Seuls la moyenne et le nombre de votes sont conservés ensuite.</small>
    ${data.own&&!data.own.public?'<p>Ton ancien avis reste privé tant que tu ne le republies pas.</p>':''}<label class="event-review-consent"><input type="checkbox" name="public" required ${data.own?.public?'checked':''}> Je confirme la publication de mon avis avec mon pseudo.</label>
    <div class="event-review-actions"><button class="primary-button" type="submit">${data.own?'Modifier mon avis':'Envoyer mon avis'}</button>${data.own?'<button class="secondary-button" type="button" data-delete-review>Supprimer mon avis</button>':''}<span role="status"></span></div></form>`);
  const form=panel.querySelector('form'), status=form.querySelector('[role=status]');
  bindRatingPicker(form,data.own?.rating??3.5);
  const save=async(method)=>{
    const buttons=[...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
    try {
      await api(path,method,method==='PUT'?{rating:Number(form.elements.rating.value),comment:form.elements.comment.value,public:form.elements.public.checked}:undefined);
      await mountEventReview(panel,eventId);
      if (panel.isConnected) panel.insertAdjacentHTML('beforeend','<p role="status">Ton avis a été enregistré.</p>');
    } catch(error) {status.textContent=error.message;}
    finally {buttons.forEach(b=>b.disabled=false);}
  };
  form.addEventListener('submit',e=>{e.preventDefault();void save('PUT');});
  form.querySelector('[data-delete-review]')?.addEventListener('click',()=>{if(confirm('Supprimer ton avis et ses réponses ?'))void save('DELETE');});
  mountThreads(panel,path,data);
}

function mountThreads(panel,path,data){
  if(!data.canReadThreads)return;
  const section=document.createElement('details');section.className='event-review-threads';
  section.innerHTML='<summary>Voir les avis et discussions</summary><div class="event-review-thread-list"></div>';
  panel.append(section);
  const list=section.lastElementChild;
  const date=value=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const action=(label,run,cls='link-button')=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=run;return b;};
  async function mutate(url,method,body,refresh,button){
    if(button)button.disabled=true;
    try{await api(url,method,body);await refresh();}
    catch(error){alert(error.message);}
    finally{if(button)button.disabled=false;}
  }
  function editor(host,url,method,refresh,{comment='',replyTo}={}){
    host.querySelector('form.event-review-reply-form')?.remove();
    const form=document.createElement('form');form.className='event-review-reply-form';
    form.innerHTML='<label>Ton message<textarea name="comment" maxlength="1000" rows="3" required></textarea></label><small>Ton pseudo est visible par la communauté.</small><div class="event-review-actions"><button class="primary-button" type="submit">Envoyer</button><button type="button" class="link-button" data-cancel>Annuler</button></div>';
    form.elements.comment.value=comment;host.append(form);form.elements.comment.focus();
    form.querySelector('[data-cancel]').onclick=()=>form.remove();
    form.onsubmit=e=>{e.preventDefault();void mutate(url,method,{comment:form.elements.comment.value,...(replyTo?{replyTo}:{})},refresh,form.querySelector('[type=submit]'));};
  }
  async function showReplies(host,review,offset=0){
    const url=path+'/'+encodeURIComponent(review.key)+'/replies';
    host.textContent='Chargement…';
    try{
      const page=await api(url+'?offset='+offset);
      host.replaceChildren();
      const reload=()=>showReplies(host,review,offset);
      for(const reply of page.replies){
        const row=document.createElement('article');row.className='event-review-reply';
        row.innerHTML='<strong>'+esc(reply.author)+'</strong><small>'+esc(date(reply.createdAt))+'</small><p>'+esc(reply.comment)+'</p>';
        const actions=document.createElement('div');actions.className='event-review-actions';row.append(actions);
        if(data.canReply)actions.append(action('Répondre',()=>editor(row,url,'POST',reload,{replyTo:reply.id})));
        if(reply.mine)actions.append(action('Modifier',()=>editor(row,url+'/'+encodeURIComponent(reply.id),'PUT',reload,{comment:reply.comment})));
        if(reply.mine||reply.canModerate)actions.append(action('Supprimer',e=>{if(confirm('Supprimer ce message ?'))void mutate(url+'/'+encodeURIComponent(reply.id),'DELETE',undefined,reload,e.currentTarget);}));
        host.append(row);
      }
      if(!page.replies.length)host.textContent='Aucune réponse pour le moment.';
      if(data.canReply)host.append(action('Répondre à cet avis',()=>editor(host,url,'POST',reload),'secondary-button'));
      if(offset)host.append(action('Réponses précédentes',()=>showReplies(host,review,Math.max(0,offset-20))));
      if(page.more)host.append(action('Réponses suivantes',()=>showReplies(host,review,offset+20)));
    }catch(error){host.textContent=error.message;}
  }
  async function load(offset=0){
    list.textContent='Chargement…';
    try{
      const page=await api(path+'/threads?offset='+offset);
      list.replaceChildren();
      if(!page.reviews.length)list.textContent='Aucun avis public pour le moment.';
      for(const review of page.reviews){
        const article=document.createElement('article');article.className='event-review-thread';
        article.innerHTML='<div class="event-review-thread-head"><strong>'+esc(review.author)+'</strong><span class="event-review-thread-rating">★ '+formatRating(review.rating)+'/5</span></div><small>'+esc(date(review.createdAt))+'</small>'+(review.comment?'<p>'+esc(review.comment)+'</p>':'<p>Aucun commentaire.</p>');
        const buttons=document.createElement('div');buttons.className='event-review-actions';article.append(buttons);
        const replies=document.createElement('details');replies.className='event-review-replies';replies.innerHTML='<summary>'+review.replyCount+' réponse'+(review.replyCount===1?'':'s')+'</summary><div></div>';article.append(replies);
        replies.addEventListener('toggle',()=>{if(replies.open)void showReplies(replies.lastElementChild,review);});
        if(data.canReply)buttons.append(action('Répondre',()=>{replies.open=true;}));
        if(review.mine||review.canModerate)buttons.append(action('Supprimer le commentaire et ses réponses',e=>{if(confirm('Supprimer le commentaire et ses réponses ? La note est conservée.'))void mutate(path+'/'+encodeURIComponent(review.key)+'/comment','DELETE',undefined,()=>load(offset),e.currentTarget);}));
        list.append(article);
      }
      if(offset)list.append(action('Avis précédents',()=>load(Math.max(0,offset-20))));
      if(page.more)list.append(action('Avis suivants',()=>load(offset+20)));
    }catch(error){list.textContent=error.message;}
  }
  section.addEventListener('toggle',()=>{if(section.open)void load();});
}
