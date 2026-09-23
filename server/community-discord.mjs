import {fail} from './core.mjs';

const DISCORD_ID=/^\d{15,22}$/;
const API='https://discord.com/api/v10';
const MANAGE_GUILD=32n;
const ADMINISTRATOR=8n;

function validId(value,label='Identifiant Discord'){
  const id=String(value||'').trim();
  if(!DISCORD_ID.test(id))fail(400,`${label} invalide.`);
  return id;
}

async function botRequest(env,path,{allowMissing=false}={}){
  if(!env.DISCORD_BOT_TOKEN)fail(503,'Le bot Discord Endurance Manager doit être configuré avant de lier un serveur.');
  let response;
  try{
    response=await fetch(`${API}${path}`,{
      headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'User-Agent':'EnduranceManager/1.0'},
      signal:AbortSignal.timeout(8000)
    });
  }catch{
    fail(503,'Discord ne répond pas pour le moment. Réessaie dans quelques instants.');
  }
  if(response.status===404&&allowMissing)return null;
  if(response.status===401)fail(503,'Le bot Discord Endurance Manager n’est pas correctement configuré.');
  if(response.status===403)fail(409,'Le bot Endurance Manager n’a pas accès à ce serveur Discord. Ajoute-le au serveur puis réessaie.');
  if(!response.ok)fail(503,'Discord ne permet pas de vérifier ce serveur pour le moment.');
  return response.json();
}

function discordAsset(kind,guildId,hash,size){
  if(!hash)return'';
  const ext=String(hash).startsWith('a_')?'gif':'webp';
  return `https://cdn.discordapp.com/${kind}/${encodeURIComponent(guildId)}/${encodeURIComponent(hash)}.${ext}?size=${size}`;
}
function discordAccent(value){
  const number=Number(value);
  if(!Number.isInteger(number)||number<0||number>0xffffff)return'';
  return '#'+number.toString(16).padStart(6,'0');
}

function rolePermissions(member,roles,guildId){
  const roleIds=new Set([guildId,...(member?.roles||[])]);
  let permissions=0n;
  for(const role of roles||[]){
    if(!roleIds.has(role.id))continue;
    try{permissions|=BigInt(role.permissions||'0');}catch{}
  }
  return permissions;
}

export function discordBotInviteUrl(env){
  const clientId=String(env.DISCORD_CLIENT_ID||'').trim();
  if(!DISCORD_ID.test(clientId))return'';
  const url=new URL('https://discord.com/oauth2/authorize');
  url.search=new URLSearchParams({client_id:clientId,scope:'bot',permissions:'0'}).toString();
  return url.href;
}

export async function inspectDiscordGuild(env,userId,guildId){
  const guild=await botRequest(env,`/guilds/${validId(guildId,'Identifiant du serveur Discord')}`);
  const [roles,member]=await Promise.all([
    botRequest(env,`/guilds/${guild.id}/roles`),
    botRequest(env,`/guilds/${guild.id}/members/${validId(userId,'Compte Discord')}`,{allowMissing:true})
  ]);
  if(!member)fail(403,'Ton compte Discord ne fait pas partie de ce serveur.');
  const permissions=rolePermissions(member,roles,guild.id);
  const canManage=guild.owner_id===userId||Boolean(permissions&ADMINISTRATOR)||Boolean(permissions&MANAGE_GUILD);
  if(!canManage)fail(403,'Il faut être propriétaire du serveur ou avoir la permission Gérer le serveur pour le lier à cette communauté.');
  return {
    id:guild.id,
    name:String(guild.name||'Serveur Discord').slice(0,100),
    iconUrl:discordAsset('icons',guild.id,guild.icon,256),
    bannerUrl:discordAsset('banners',guild.id,guild.banner,1024),
    accentColor:discordAccent(guild.accent_color),
    roles:(roles||[])
      .filter(role=>role.id!==guild.id&&!role.managed)
      .sort((a,b)=>(Number(b.position)||0)-(Number(a.position)||0))
      .map(role=>({id:role.id,name:String(role.name||'Rôle').slice(0,100)}))
  };
}

export async function discordEligibility(env,userId,organization){
  const guildId=String(organization?.discord_guild_id||'').trim();
  const roleId=String(organization?.discord_role_id||'').trim();
  if(!guildId)return {linked:false,available:true,member:true,eligible:true,roleRequired:false};
  if(!env.DISCORD_BOT_TOKEN)return {linked:true,available:false,member:false,eligible:false,roleRequired:Boolean(roleId)};
  const member=await botRequest(env,`/guilds/${validId(guildId,'Serveur Discord')}/members/${validId(userId,'Compte Discord')}`,{allowMissing:true});
  if(!member)return {linked:true,available:true,member:false,eligible:false,roleRequired:Boolean(roleId)};
  const hasRole=!roleId||(member.roles||[]).includes(roleId);
  return {linked:true,available:true,member:true,eligible:hasRole,roleRequired:Boolean(roleId)};
}

export async function discordCommunityStatus(env,userId,organization){
  const status=await discordEligibility(env,userId,organization);
  if(!status.linked||!status.available||!status.member)return {...status,manager:false};
  const managerRoleId=String(organization?.discord_manager_role_id||'').trim();
  if(!managerRoleId)return {...status,manager:false};
  const member=await botRequest(env,`/guilds/${validId(organization.discord_guild_id,'Serveur Discord')}/members/${validId(userId,'Compte Discord')}`,{allowMissing:true});
  return {...status,manager:Boolean(member&&(member.roles||[]).includes(managerRoleId))};
}

export async function requireDiscordCommunityAccess(env,userId,organization,{joining=false}={}){
  const status=await discordEligibility(env,userId,organization);
  if(!status.linked)return status;
  if(!status.available)fail(503,'La vérification Discord de cette communauté est momentanément indisponible.');
  if((joining||organization?.join_mode==='discord')&&!status.member)fail(403,'Cette communauté demande d’être membre de son serveur Discord.');
  if(!joining&&status.roleRequired&&!status.eligible){
    const role=organization.discord_role_name?` « ${organization.discord_role_name} »`:'';
    fail(403,`Cette communauté demande le rôle Discord${role} pour participer à ses endurances.`);
  }
  return status;
}
