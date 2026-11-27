// DEV-only, fixed illustrative cards for visual review. Never invokes the bot, sync, or crew lifecycle.
import {isDevelopment} from './dev-environment.mjs';
import {carShortName} from '../shared/car-brands.mjs';
const DEV_ORIGIN='https://dev.endurance-manager.app';
const safeId=id=>typeof id==='string'&&/^\d{15,22}$/.test(id);
function webhook(env){
  if(!isDevelopment(env)||env.APP_ORIGIN!==DEV_ORIGIN)return null;
  try{
    const url=new URL(String(env.DISCORD_TEST_WEBHOOK||'').trim());
    if(!['https://discord.com','https://discordapp.com'].includes(url.origin)||url.username||url.password||url.search||url.hash||
       !/^\/api\/(?:v\d{1,2}\/)?webhooks\/\d{15,22}\/[A-Za-z0-9_-]{20,200}\/?$/.test(url.pathname))return null;
    const path=url.pathname.replace(/^\/api\/(?:v\d{1,2}\/)?/,'/api/v10/').replace(/\/$/,'');
    return new URL(path,'https://discord.com');
  }catch{return null;}
}
export const discordPreviewAvailable=env=>Boolean(webhook(env));
const errorCodes={10003:'Salon introuvable',10015:'Webhook introuvable ou supprimé',50001:'Accès manquant',50013:'Permission refusée',50027:'Token du webhook invalide',50035:'Format du message refusé',50083:'Fil archivé',220001:'Webhook de forum : un fil est requis'};
// Workers supports manual redirects, not the standard error mode. Never forward a webhook token.
async function refusal(response,stage){
  if(response.status>=300&&response.status<400)return {ok:false,stage,httpStatus:response.status,discordCode:0,error:'Redirection Discord refusée pour protéger le webhook.'};
  const data=await response.json().catch(()=>null);
  const code=Number.isSafeInteger(data?.code)&&data.code>0?data.code:0;
  const explanation=errorCodes[code]||({400:'Requête refusée',401:'Authentification refusée',403:'Accès refusé',404:'Webhook ou salon introuvable',429:'Limite Discord atteinte'}[response.status]||'Réponse Discord inattendue');
  return {ok:false,stage,httpStatus:response.status,discordCode:code,error:`${explanation} (HTTP ${response.status}${code?' · Discord '+code:''}).`};
}
function networkError(stage,error){
  const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
  return {ok:false,stage,error:timeout?'Discord ne répond pas dans le délai imparti.':'Connexion à Discord impossible depuis le Worker.'};
}
export async function diagnoseDiscordPreview(env,request=(url,init)=>fetch(url,init)){
  const url=webhook(env);
  if(!url)return {ok:false,stage:'configuration',error:String(env?.DISCORD_TEST_WEBHOOK||'').trim()?'Format du secret incorrect : colle uniquement l’URL Discord du webhook.':'Secret DISCORD_TEST_WEBHOOK absent ou vide.'};
  try{
    const response=await request(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return await refusal(response,'connexion');
    const data=await response.json().catch(()=>null);
    if(!safeId(data?.channel_id)||!safeId(data?.guild_id)||data?.type!==1)return {ok:false,stage:'connexion',error:'Le webhook ne correspond pas à un webhook entrant lié à un salon de serveur.'};
    return {ok:true,stage:'connexion',channelId:data.channel_id,guildId:data.guild_id,channelUrl:`https://discord.com/channels/${data.guild_id}/${data.channel_id}`};
  }catch(error){return networkError('connexion',error);}
}
const stamp='APERÇU DEV · données fictives · aucune inscription réelle';
const voiceName=(name,car,category)=>`#${name} · ${carShortName(car)} · ${category}`;
export function discordPreviewMessages(){
  const crew=(name,car,category,locked,pilots)=>`${category} **${name}** ${locked?'🔒':'🔓'}\n🏎️ ${car}\n${pilots.map(pilot=>`👤 ${pilot}`).join('\n')}`;
  const row=(name,track,duration,cats,date,count)=>`**${name}**\n📍 ${track} · ⏱️ ${duration}\nCatégories : ${cats}\n📅 ${date}\n👤 ${count} pilotes inscrits`;
  const footer={text:stamp};
  const banner={url:`${DEV_ORIGIN}/images/endurance-manager-banner.webp`};
  return [
    {content:'**TEST 1/3 — Récapitulatif de la semaine**',embeds:[
      {title:'📝 Semaine à venir',color:0x52d3d8,author:{name:'Endurance Manager'},image:banner},
      {title:'🏎️ LMU · 2 courses à venir',color:0xd8322c,description:[
        row('6H de Spa','Spa-Francorchamps','6 h','HY · LMP2 WEC · GT3','sam. · 14h, 20h',4),
        row('4H de Portimão','Portimão','4 h','LMP2 ELMS · LMP3 · GT3','dim. · 16h',0)
      ].join('\n\n'),footer}
    ]},
    {content:'**TEST 2/3 — Fil : LMU · 6H de Spa**',embeds:[{
      title:'🏁 6H de Spa',color:0xd8322c,description:'📍 Spa-Francorchamps · ⏱️ 6 h\nCatégories : HY · LMP2 WEC · GT3\n📅 **sam.** · 14h, 20h',
      fields:[
        {name:'Sam. · 14h00',value:[crew('TDZ TEST 01','Toyota GR010 Hybrid','HY',true,['Pilote A','Pilote B']),crew('TDZ TEST 02','Ferrari 296 LMGT3','GT3',false,['Pilote C','Pilote D'])].join('\n\n'),inline:false},
        {name:'Sam. · 20h00',value:'Personne d’inscrit pour l’instant.',inline:false}
      ],footer
    }]},
    {content:'**TEST 3/3 — Fiche d’équipage et noms des vocaux**',embeds:[
      {title:'6H de Spa',author:{name:'🏎️ LMU · Spa-Francorchamps'},color:0xe5484d,
        description:'Équipage **TDZ TEST 01** · 🔒 Complet\n\n🟢 **Sam. · 14h00**\n⏱️ 6 h · arrivée 20h00\n🚗 Toyota GR010 Hybrid · HY\n\n👥 **Pilotes · 2**\nPilote A\nPilote B',
        footer:{text:'Ce vocal ferme 2 h après l’arrivée · APERÇU DEV'}},
      {title:'Noms des vocaux (simulation uniquement)',color:0x52d3d8,description:[
        voiceName('TDZ TEST 01','Toyota GR010 Hybrid','HY'),voiceName('TDZ TEST 02','Ferrari 296 LMGT3','GT3'),
        voiceName('TDZ TEST 03','Oreca 07 Gibson ELMS','LMP2 ELMS'),voiceName('TDZ TEST 04','Oreca 07 Gibson','LMP2 WEC'),
        voiceName('TDZ TEST 05','Ligier JS P325','LMP3'),voiceName('TDZ TEST 06','Ferrari 488 GTE','GTE')
      ].map(name=>`\`${name}\``).join('\n'),footer},
      {title:'Aperçu des images de marque',description:'Les emojis intégrés du bot nécessitent un essai avec le bot propriétaire. Le webhook ne crée aucun emoji. Les logos ci-dessous sont les images utilisées par le site.',color:0x52d3d8,thumbnail:{url:`${DEV_ORIGIN}/images/brands/toyota.webp`},footer}
    ]}
  ].map(payload=>({...payload,allowed_mentions:{parse:[],users:[],roles:[],replied_user:false},flags:4096}));
}
// Only the configured webhook may receive these fixed messages. No user-provided content or destination.
// No automatic retry: after a timeout a Discord message may already exist.
export async function sendDiscordPreview(env,request=(url,init)=>fetch(url,init)){
  const url=webhook(env);
  if(!url)return {ok:false,sent:0,error:'Webhook de test non configuré sur dev.'};
  url.searchParams.set('wait','true');
  const messages=[];
  for(const payload of discordPreviewMessages()){
    try{
      const response=await request(url.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return {...await refusal(response,`message ${messages.length+1}/3`),sent:messages.length,messages};
      const data=await response.json();
      if(!safeId(data?.id)||!safeId(data?.channel_id))return {ok:false,sent:messages.length,error:'Envoi non confirmé par Discord. Vérifie le salon avant de réessayer.',messages};
      messages.push({id:data.id,channelId:data.channel_id,...(safeId(data.guild_id)?{url:`https://discord.com/channels/${data.guild_id}/${data.channel_id}/${data.id}`}:{})});
    }catch(error){return {...networkError(`message ${messages.length+1}/3`,error),sent:messages.length,messages};}
  }
  return {ok:true,sent:messages.length,messages};
}
