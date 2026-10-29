// Fictitious design proposal. Only the explicit administrator test action sends it.
export function eveningDemo(site={}, timestamp=Date.now(), scenario='solo') {
  const origin=site.url||'https://example.com';
  const text=content=>({type:10,content});
  const separator=()=>({type:14,divider:true,spacing:2});
  const section=(heading,details,image,description,extra='')=>({type:9,components:[text(heading),text(details),...(extra?[text(extra)]:[])],accessory:{type:11,media:{url:image},description}});
  const row=(label,key)=>({type:1,components:[
    {type:2,style:5,label,url:`${origin}/events/`,disabled:true},
    {type:2,style:2,label:'Absent',custom_id:`preview:${key}:absent`,disabled:true}
  ]});
  // https://commons.wikimedia.org/wiki/File:LeMansUltimateLogo.png
  const lmuLogo='https://upload.wikimedia.org/wikipedia/commons/8/8a/LeMansUltimateLogo.png';
  const banner=site.bannerUrl||`${origin}/images/endurance-manager-banner.webp`;
  const day=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}).format(timestamp)+' · aperçu fictif';
  const live={type:9,components:[text('### 🟣 LA SOIRÉE AVEC LA PRALINE\n**20:45 · Prise d’antenne**')],accessory:{type:2,style:5,label:'Regarder le live',url:'https://www.twitch.tv/lapraline_tdz',disabled:true}};
  const closing={type:12,items:[{media:{url:banner},description:'Bannière de la communauté'}]};
  const soloHeading='# 🎉 SOIRÉE BOUBOULES AUJOURD’HUI !';
  const soloFacts=`🕘 **21:00 · AMS2 · SAFE**\n📅 ${day}`;
  const soloProgram='### 🏁 SAFE’S RACE · LE PROGRAMME\n🏎️ **GT4 · Ginetta G55**\n\n📍 **MANCHE 01 · VELO CITTÀ**\n🛠️ Essais : 10 min · ⏱️ Qualifications : 10 min\n🏁 **Course : 20 minutes**\n\n📍 **MANCHE 02 · INTERLAGOS**\n🛠️ Essais : 5 min · ⏱️ Qualifications : 10 min\n🏁 **Course : 40 minutes**\n\n### ⚙️ LES CONDITIONS\n🌦️ **Météo** · aléatoire\n⛽ **Carburant** · ×1\n🛞 **Pneus** · ×1';
  const soloParticipation='### 👥 PARTICIPATION\n**13 pilotes inscrits sur 20**\n🟢 **7 places disponibles**';
  const raceHeading='# 🏁 JOUR D’ENDURANCE AUJOURD’HUI !';
  const raceFacts=`🕘 **20:00 · LMU · EN ÉQUIPE**\n📅 ${day}`;
  const raceProgram='### 🏁 6 HEURES DE SPA\n📍 **Circuit** · Spa-Francorchamps\n🏎️ **Catégorie** · GT3\n🕘 **Départ** · 20:00\n⏱️ **Durée** · 6 heures\n\n### ⚙️ LES CONDITIONS\n🌦️ **Météo** · changeante\n⚖️ **Temps de conduite** · partagé';
  const raceParticipation='### 👥 LES ÉQUIPAGES\n**7 pilotes · 3 équipages**\n🟢 **2 équipages cherchent des pilotes**\n\n🟢 **Apex Racing · 2/3**\nFerrari 296 GT3 · Ana, Max\n\n🟢 **Night Shift · 2/3**\nBMW M4 GT3 · Léa, Hugo\n\n🔒 **Endurance Crew · 3/3**\nPorsche 911 GT3 R · Sam, Noah, Alex';
  let components,color;
  if(scenario==='multi'){
    color=0x52d3d8;
    components=[
      text(`# 🏁 CE SOIR, ON PREND LA PISTE !\n${day} · **2 rendez-vous**`),separator(),
      section('## 20:00 · 6 HEURES DE SPA\n**LMU · Endurance en équipe**',`${raceFacts}\n\n${raceProgram}`,lmuLogo,'Le Mans Ultimate',raceParticipation),
      row('Rejoindre la course','spa'),separator(),
      section('## 21:00 · SOIRÉE BOUBOULES\n**AMS2 · Événement SAFE**',`${soloFacts}\n\n${soloProgram}`,`${origin}/images/event-access/safe-ams2.png`,'Événement SAFE sur AMS2',soloParticipation),
      row('M’inscrire','safe'),separator(),live,closing
    ];
  }else{
    const endurance=scenario==='endurance';color=endurance?0xd71920:0xe7b653;
    components=[
      section(endurance?raceHeading:soloHeading,endurance?raceFacts:soloFacts,endurance?lmuLogo:`${origin}/images/event-access/safe-ams2.png`,endurance?'Le Mans Ultimate':'Événement SAFE sur AMS2'),
      separator(),text(endurance?raceProgram:soloProgram),separator(),
      text(endurance?raceParticipation:soloParticipation),row(endurance?'Rejoindre la course':'M’inscrire',endurance?'spa':'safe'),
      separator(),live,closing
    ];
  }
  return {flags:32768,allowed_mentions:{parse:[]},components:[{type:17,accent_color:color,components}]};
}
