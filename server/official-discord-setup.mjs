// One-off, explicit setup of the official server. No token is ever returned to the browser.
export const OFFICIAL_GUILD = '1558538670217101373';
export const OFFICIAL_APPLICATION = '1546535605805125742';
const VIEW=1024n,SEND=2048n,HISTORY=65536n,THREAD_SEND=1n<<38n,VOICE=(1n<<20n)|(1n<<21n);
export const SETUP_PERMISSIONS=String(VIEW|SEND|HISTORY|THREAD_SEND|VOICE|16n|(1n<<28n));
const ROLE_NAMES=['Administrateur','Modérateur','Support','Membre'];
const CATEGORIES=['Accueil','Communauté','Aide et retours','Courses LMU','Courses iRacing','Vocaux généraux','Équipe'];
const CHANNELS=[
  ['bienvenue',0,'Accueil'],['règlement',0,'Accueil'],['annonces',5,'Accueil'],['bien-démarrer',0,'Accueil'],
  ['discussion',0,'Communauté'],['aide',15,'Aide et retours'],['bugs',15,'Aide et retours'],['fonctionnalités',15,'Aide et retours'],
  ['Discussion',2,'Vocaux généraux'],['Détente',2,'Vocaux généraux'],['modération',0,'Équipe'],['suivi-discord',0,'Équipe'],['logs-bot',0,'Équipe']
];
const POSTS={
  bienvenue:'Bienvenue sur le Discord officiel d’Endurance Manager !\nLe site organise les courses, les inscriptions et les équipages. Ici, échangeons, trouvons de l’aide et préparons nos courses ensemble. Consulte le règlement et le salon bien-démarrer.',
  règlement:'Respecte les autres membres. Aucun harcèlement, discrimination, spam ou partage de données personnelles. Ne publie jamais de token, mot de passe ou secret. Garde les discussions dans les salons adaptés et respecte les décisions de modération.',
  'bien-démarrer':'Connecte-toi à https://endurance-manager.app avec Discord pour gérer tes inscriptions et tes équipages.\n• aide : un sujet par question.\n• bugs : indique les étapes, le résultat attendu et le résultat obtenu ; masque les données personnelles des captures.\n• fonctionnalités : explique le besoin et propose un exemple.\n• Courses LMU et Courses iRacing : espaces alimentés par le site lorsque les modules sont configurés. Le vocal d’un équipage expire 24 h après la fin de son départ ; le texte du récap expire 24 h après le dernier départ.\n• Vocaux généraux : discussion libre.'
};
function failure(status,message){return Object.assign(new Error(message),{status});}
async function request(env,method,path,body){
  if(!env.DISCORD_BOT_TOKEN)throw failure(503,'Le token du bot est absent de ce Worker.');
  const response=await fetch('https://discord.com/api/v10'+path,{method,signal:AbortSignal.timeout(8000),headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw failure(response.status===429?429:502,response.status===429?'Discord limite les requêtes. Attends avant de reprendre.':'Discord refuse la configuration : vérifie la présence et les permissions du bot.');
  return response.status===204?null:response.json();
}
function rights(roles,member){
  const ids=new Set([OFFICIAL_GUILD,...member.roles]);
  return roles.filter(role=>ids.has(role.id)).reduce((value,role)=>value|BigInt(role.permissions||0),0n);
}
async function snapshot(env,userId){
  const guild=await request(env,'GET',`/guilds/${OFFICIAL_GUILD}`);
  if(guild.owner_id!==userId)throw failure(403,'Seul le propriétaire du serveur officiel peut exécuter cette configuration.');
  if(!guild.features?.includes('COMMUNITY'))throw failure(409,'Active le mode Communauté sur Discord avant de continuer.');
  if(env.DISCORD_CLIENT_ID!==OFFICIAL_APPLICATION)throw failure(409,'Ce Worker n’utilise pas l’application Discord du serveur officiel.');
  const roles=await request(env,'GET',`/guilds/${OFFICIAL_GUILD}/roles`);
  const member=await request(env,'GET',`/guilds/${OFFICIAL_GUILD}/members/${OFFICIAL_APPLICATION}`);
  const channels=await request(env,'GET',`/guilds/${OFFICIAL_GUILD}/channels`);
  const permissions=rights(roles,member),required=BigInt(SETUP_PERMISSIONS);
  if(!(permissions&8n)&&(permissions&required)!==required)throw failure(409,'Le bot doit gérer les salons et les rôles, voir les salons, envoyer et lire les messages, envoyer des messages dans les fils, se connecter et parler.');
  return {guild,roles,channels};
}
function permissions(category,roles){
  if(category==='Équipe')return [{id:OFFICIAL_GUILD,type:0,allow:'0',deny:String(VIEW)},
    {id:OFFICIAL_APPLICATION,type:1,allow:String(VIEW|SEND|HISTORY),deny:'0'},
    ...roles.filter(role=>['Administrateur','Modérateur'].includes(role.name)).map(role=>({id:role.id,type:0,allow:String(VIEW|SEND|HISTORY),deny:'0'}))];
  const readOnly=category==='Accueil';
  return [{id:OFFICIAL_GUILD,type:0,allow:String(VIEW|HISTORY|(readOnly?0n:SEND|THREAD_SEND)|(category==='Vocaux généraux'?VOICE:0n)),deny:readOnly?String(SEND):'0'},
    {id:OFFICIAL_APPLICATION,type:1,allow:String(VIEW|SEND|HISTORY),deny:'0'},
    ...roles.filter(role=>['Administrateur','Modérateur'].includes(role.name)).map(role=>({id:role.id,type:0,allow:String(VIEW|SEND|HISTORY),deny:'0'}))];
}
function samePermissions(actual,expected){
  return actual?.length===expected.length&&expected.every(want=>actual.some(have=>have.id===want.id&&have.type===want.type&&String(have.allow||0)===want.allow&&String(have.deny||0)===want.deny));
}
function plan(state){
  const items=[];
  const add=(key,name,type,parent,existing,body)=>{
    const conflict=existing.length>1||existing.some(item=>type!==null&&item.type!==type);
    items.push({key,name,type,parent,action:conflict?'conflict':existing.length?'reuse':'create',id:existing.length===1?existing[0].id:null,body});
  };
  for(const name of ROLE_NAMES)add('role:'+name,name,null,null,state.roles.filter(role=>role.name===name),{name,permissions:'0',mentionable:false});
  for(const name of CATEGORIES){
    const existing=state.channels.filter(channel=>channel.name===name);
    add('category:'+name,name,4,null,existing,{name,type:4,permission_overwrites:permissions(name,state.roles)});
    if(name==='Équipe'&&existing.length===1&&!samePermissions(existing[0].permission_overwrites,permissions(name,state.roles)))items.at(-1).action='conflict';
  }
  for(const [name,type,parent] of CHANNELS){
    const category=items.find(item=>item.key==='category:'+parent);
    const communityId=name==='règlement'?state.guild.rules_channel_id:name==='suivi-discord'?state.guild.public_updates_channel_id:null;
    const existing=communityId?state.channels.filter(channel=>channel.id===communityId):state.channels.filter(channel=>channel.name===name);
    add('channel:'+name,name,type,parent,existing,{name,type,parent_id:category.id,...(type===15?{available_tags:['À examiner','En cours','Résolu'].map(name=>({name,moderated:false}))}:{})});
    if(existing.length===1&&!communityId&&existing[0].parent_id!==category.id)items.at(-1).action='conflict';
  }
  return items;
}
export async function previewOfficialDiscord(env,userId){
  const state=await snapshot(env,userId),items=plan(state);
  return {guildId:OFFICIAL_GUILD,guildName:state.guild.name,items:items.map(({body,...item})=>item),welcomeMessages:POSTS,
    notes:['Les éléments existants réutilisés conservent leurs permissions et leur emplacement.','Les rôles créés ne donnent aucune permission globale ; le propriétaire attribue ensuite les rôles et les pouvoirs de modération.','Les salons de course et les vocaux d’équipage sont créés par les modules du site, pas par cette configuration.','Le salon de suivi choisi dans le mode Communauté est conservé ; vérifie qu’il est réservé à l’équipe.']};
}
export async function applyOfficialDiscord(env,userId,confirmation){
  if(confirmation!==OFFICIAL_GUILD)throw failure(400,'Confirme l’identifiant du serveur officiel après avoir consulté l’aperçu.');
  const now=Date.now(),token=crypto.randomUUID();
  await env.DB.prepare('INSERT OR IGNORE INTO official_discord_setup(guild_id) VALUES(?)').bind(OFFICIAL_GUILD).run();
  const lock=await env.DB.prepare('UPDATE official_discord_setup SET lock_token=?,lock_until=? WHERE guild_id=? AND lock_until<?').bind(token,now+180000,OFFICIAL_GUILD,now).run();
  if(!lock.meta.changes)throw failure(409,'Une configuration est déjà en cours.');
  try{
    const state=await snapshot(env,userId),items=plan(state);
    if(items.some(item=>item.action==='conflict'))throw failure(409,'Des noms ou permissions existants sont en conflit. Consulte l’aperçu avant de continuer.');
    let created=0;
    // Eight mutations per call, saving through Discord identities and re-reading before the next batch.
    for(const item of items.filter(item=>item.action==='create').slice(0,8)){
      if(item.parent){const category=items.find(candidate=>candidate.key==='category:'+item.parent);if(!category.id)break;item.body.parent_id=category.id;}
      if(item.type===4)item.body.permission_overwrites=permissions(item.name,state.roles);
      const result=await request(env,'POST',`/guilds/${OFFICIAL_GUILD}/${item.type===null?'roles':'channels'}`,item.body);
      item.id=result.id;item.action='reuse';created++;
      if(item.type===null)state.roles.push(result);else state.channels.push(result);
    }
    if(items.some(item=>item.action==='create'))return {done:false,created,message:'Lot créé. Consulte de nouveau l’aperçu puis reprends la configuration.'};
    // Stable nonce + history recovery keeps initial messages unique and silent on retries.
    const saved=await env.DB.prepare('SELECT message_ids FROM official_discord_setup WHERE guild_id=?').bind(OFFICIAL_GUILD).first();
    const identities=JSON.parse(saved.message_ids);
    for(const [name,content] of Object.entries(POSTS)){
      if(identities[name])continue;
      const channel=items.find(item=>item.key==='channel:'+name),nonce='em-official-'+name;
      const messages=await request(env,'GET',`/channels/${channel.id}/messages?limit=100`);
      const message=messages.find(message=>message.author?.id===OFFICIAL_APPLICATION&&(message.nonce===nonce||message.content===content))
        || await request(env,'POST',`/channels/${channel.id}/messages`,{content,nonce,enforce_nonce:true,flags:4096,allowed_mentions:{parse:[]}});
      identities[name]=message.id;
      await env.DB.prepare('UPDATE official_discord_setup SET message_ids=? WHERE guild_id=? AND lock_token=?').bind(JSON.stringify(identities),OFFICIAL_GUILD,token).run();
    }
    return {done:true,created,message:'Organisation créée. Aucun module de course n’a été activé.'};
  }finally{await env.DB.prepare("UPDATE official_discord_setup SET lock_token='',lock_until=0 WHERE guild_id=? AND lock_token=?").bind(OFFICIAL_GUILD,token).run();}
}

export function officialSetupPage(){
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configuration du Discord officiel</title><link rel="stylesheet" href="/styles.css"></head><body><main style="max-width:900px;margin:40px auto;padding:20px"><h1>Discord officiel d’Endurance Manager</h1><p>Serveur : ${OFFICIAL_GUILD}. Consulte l’aperçu avant de créer les éléments. Les salons existants ne sont ni déplacés ni supprimés.</p><button id="preview" type="button">Actualiser l’aperçu</button><p id="status" role="status" aria-live="polite"></p><div id="plan"></div><h2>Messages d’accueil proposés</h2><div id="messages"></div><form id="apply"><label>Pour confirmer le serveur, recopie son identifiant <input id="confirmation" autocomplete="off" inputmode="numeric" required></label><button id="create" type="submit" disabled>Créer les éléments présentés</button></form><p>La création se fait par petits lots. Tu peux consulter le nouvel aperçu avant de lancer le lot suivant.</p></main><script type="module" src="/front/official-discord-setup.mjs"></script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff'}});
}
