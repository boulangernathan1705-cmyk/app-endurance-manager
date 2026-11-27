// DEV-only verification of the dedicated test webhook. No publishing.
import {isDevelopment} from './dev-environment.mjs';
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
