import {eveningDemo} from '../shared/discord-evening-demo.mjs';
import {discordPreviewsMarkup,discordExportPayload} from './discord-preview.mjs';

const root=document.getElementById('evening-preview');
const payload=eveningDemo({url:location.origin});
root.innerHTML=discordPreviewsMarkup([{name:'Nouvelle proposition · Programme du soir',payload}]);
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
