// Fictitious design proposal. Sent only by the explicit administrator test action.
export function eveningDemo(site={}, timestamp=Date.now()) {
  const origin=site.url||'https://example.com';
  const text=content=>({type:10,content});
  const separator=()=>({type:14,divider:true,spacing:1});
  const row=(label,key)=>({type:1,components:[
    {type:2,style:5,label,url:`${origin}/events/`,disabled:true},
    {type:2,style:2,label:'Absent',custom_id:`preview:${key}:absent`,disabled:true}
  ]});
  const section=(content,image,description)=>({type:9,components:[text(content)],accessory:{type:11,media:{url:image},description}});
  // LMU logo from https://commons.wikimedia.org/wiki/File:LeMansUltimateLogo.png
  const lmuLogo='https://upload.wikimedia.org/wikipedia/commons/8/8a/LeMansUltimateLogo.png';
  const banner=site.bannerUrl||`${origin}/images/endurance-manager-banner.webp`;
  const day=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}).format(timestamp);
  return {flags:32768,allowed_mentions:{parse:[]},components:[
    text('# CE SOIR, ON PREND LA PISTE\nDeux rendez-vous. Une même passion.'),
    text(`**LE PROGRAMME DU SOIR**\n${day} · données d’exemple`),
    {type:17,accent_color:0xd71920,components:[
      section('## 20:00 · 6 HEURES DE SPA\n**LMU · Endurance en équipe**',lmuLogo,'Le Mans Ultimate'),
      separator(),
      text('Spa-Francorchamps · GT3 · 6 heures\n\n**12 pilotes · 3 équipages**\n🟢 **2 équipages cherchent des pilotes**'),
      row('Rejoindre la course','spa')
    ]},
    {type:17,accent_color:0xe7b653,components:[
      section('## 21:00 · SAFE’S RACE\n**AMS2 · Deux manches pour faire la différence**',`${origin}/images/event-access/safe-ams2.png`,'Événement SAFE sur AMS2'),
      separator(),
      text('**01 · VELO CITTÀ**\nGT4 · Course de 20 minutes'),
      separator(),
      text('**02 · INTERLAGOS**\nGT4 · Course de 40 minutes'),
      text('🟢 **13 inscrits · 7 places disponibles**'),
      row('M’inscrire','safe')
    ]},
    {type:17,accent_color:0x9146ff,components:[
      text('### LA SOIRÉE AVEC LA PRALINE\nPrise d’antenne à **20:45**\nRetrouve les courses en direct.'),
      {type:1,components:[{type:2,style:5,label:'Regarder sur Twitch',url:'https://www.twitch.tv/lapraline_tdz',disabled:true}]}
    ]},
    {type:12,items:[{media:{url:banner},description:'Bannière de la communauté'}]}
  ]};
}
