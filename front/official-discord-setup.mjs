const endpoint='/api/admin/official-discord-setup',guild='1558538670217101373';
const status=document.querySelector('#status'),button=document.querySelector('#create'),input=document.querySelector('#confirmation');
let ready=false,busy=false,finished=false;
function availability(){button.disabled=busy||!ready||finished||input.value.trim()!==guild;}
async function request(method='GET',body){
  const response=await fetch(endpoint,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'La configuration est indisponible.');return data;
}
function append(parent,tag,text){const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;}
async function preview(){
  ready=false;availability();const data=await request();
  const area=document.querySelector('#plan');area.replaceChildren();
  append(area,'h2',data.guildName);
  const table=append(area,'table','');const head=append(table,'tr','');for(const text of ['Élément','Catégorie','Action'])append(head,'th',text);
  for(const item of data.items){const row=append(table,'tr','');for(const text of [item.name,item.parent||'',{create:'À créer',reuse:'Existant conservé',conflict:'Conflit à résoudre'}[item.action]])append(row,'td',text);}
  const notes=append(area,'ul','');for(const note of data.notes)append(notes,'li',note);
  const messages=document.querySelector('#messages');messages.replaceChildren();for(const [name,content] of Object.entries(data.welcomeMessages)){append(messages,'h3','#'+name);append(messages,'p',content);}
  ready=!data.items.some(item=>item.action==='conflict');availability();return data;
}
document.querySelector('#preview').addEventListener('click',async()=>{
  if(busy)return;busy=true;availability();status.textContent='Chargement de l’aperçu…';
  try{await preview();status.textContent=ready?'Aucun changement effectué. Vérifie l’aperçu avant de créer les éléments.':'Un conflit doit être résolu avant la création.';}catch(error){status.textContent=error.message;}finally{busy=false;availability();}
});
input.addEventListener('input',availability);
document.querySelector('#apply').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!ready||finished||input.value.trim()!==guild)return;
  busy=true;availability();status.textContent='Création du lot en cours…';
  try{const result=await request('POST',{confirmGuildId:input.value.trim()});finished=result.done;await preview();status.textContent=result.message;button.textContent=finished?'Configuration terminée':'Créer le lot suivant';}
  catch(error){ready=false;status.textContent=error.message+' Actualise l’aperçu avant de reprendre.';}finally{busy=false;availability();}
});
