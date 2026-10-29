import {eveningDemo} from '../shared/discord-evening-demo.mjs';
import {discordPreviewsMarkup,discordExportPayload} from './discord-preview.mjs';

const root=document.getElementById('evening-preview');
const scenario=document.getElementById('evening-scenario');
let previewAuthorized=false,previewGeneration=0;
let requestedChannel=new URLSearchParams(location.search).get('channel')||'';
try{
  if(/^\d{15,22}$/.test(requestedChannel))sessionStorage.setItem('em-preview-channel',requestedChannel);
  else if(!requestedChannel)requestedChannel=sessionStorage.getItem('em-preview-channel')||'';
}catch{/* The channel can still be selected when browser storage is disabled. */}
let payload=eveningDemo({url:location.origin},Date.now(),scenario.value);
const render=()=>{root.innerHTML=discordPreviewsMarkup([{name:'Nouvelle proposition · Programme du soir',payload}]);};
render();
async function refreshPreview(){
  const generation=++previewGeneration,selected=scenario.value;
  payload=eveningDemo({url:location.origin},Date.now(),selected);render();
  if(previewAuthorized){
    const result=await api('/api/community/discord/announcement-preview',{variant:'evening',scenario:selected});
    if(generation===previewGeneration){payload=result.previews[0].payload;render();}
  }
}
scenario.addEventListener('change',()=>refreshPreview().catch(error=>{document.querySelector('[data-send-status]').textContent=error.message;}));
root.addEventListener('click',event=>{
  const size=event.target.closest('[data-discord-preview-size]');
  if(size){
    root.classList.toggle('is-mobile',size.dataset.discordPreviewSize==='mobile');
    for(const button of root.querySelectorAll('[data-discord-preview-size]'))button.setAttribute('aria-pressed',String(button===size));
  }
  if(event.target.closest('[data-discord-export]')){
    const href=URL.createObjectURL(new Blob([JSON.stringify(discordExportPayload(payload),null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=href;link.download='programme-du-soir-exemple.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
});

async function api(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Cette action a échoué.');return result;
}
async function prepareSender(){
  const panel=document.getElementById('evening-send'),status=panel.querySelector('[data-send-status]');
  try{
    const session=await api('/api/session');
    if(!session.user){
      status.textContent='Connecte-toi avec ton compte administrateur pour choisir ton salon de test.';
      const login=document.createElement('a');login.className='primary-button';login.textContent='Se connecter avec Discord';
      login.href='/api/auth/discord?return='+encodeURIComponent(location.pathname);panel.append(login);return;
    }
    if(!session.permissions?.includes('admin')){status.textContent='L’envoi est réservé aux administrateurs de cette communauté.';return;}
    previewAuthorized=true;
    const [destinations]=await Promise.all([api('/api/community/recap/destinations'),refreshPreview()]);
    const channels=(destinations.destinations||[]).filter(channel=>channel.type===0);
    const requested=requestedChannel;
    const form=document.createElement('form'),label=document.createElement('label'),select=document.createElement('select'),button=document.createElement('button');
    label.textContent='Salon de test';select.name='channel';select.required=true;
    const empty=document.createElement('option');empty.value='';empty.textContent='Choisir le salon texte';select.append(empty);
    for(const channel of channels){
      const option=document.createElement('option');option.value=channel.id;
      option.disabled=channel.announceMissing?.some(right=>right!=='Mentionner @everyone')||false;
      option.textContent=`# ${channel.name}${option.disabled?' · droits du bot à corriger':''}`;select.append(option);
    }
    if(channels.some(channel=>channel.id===requested&&!channel.announceMissing?.some(right=>right!=='Mentionner @everyone')))select.value=requested;
    label.append(select);button.type='submit';button.className='primary-button';button.textContent='Envoyer la maquette sur Discord';button.disabled=!select.value;
    select.addEventListener('change',()=>{button.disabled=!select.value;});form.append(label,button);panel.append(form);
    status.textContent=requested&&!select.value?'Le salon demandé est indisponible dans cette communauté. Choisis un salon où le bot peut publier.':'Un exemple avec des données fictives sera envoyé, sans notification ni inscription.';
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!select.value||button.disabled)return;
      button.disabled=true;scenario.disabled=true;status.textContent='Envoi de la maquette…';
      try{
        const sent=await api('/api/community/discord/announcement-test',{channel:select.value,variant:'evening',scenario:scenario.value});
        status.textContent='Maquette envoyée. ';
        if(/^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/.test(sent.url)){
          const link=document.createElement('a');link.href=sent.url;link.target='_blank';link.rel='noopener';link.textContent='Ouvrir le message dans Discord';status.append(link);
        }
      }catch(error){status.textContent=error.message;}
      finally{button.disabled=!select.value;scenario.disabled=false;}
    });
  }catch(error){status.textContent=error.message||'Impossible de charger les salons de test.';}
}
prepareSender();
