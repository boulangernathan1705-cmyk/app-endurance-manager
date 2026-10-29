import {buildAnnounceEvent,buildAnnounceIntro,buildCompleteAnnouncement} from './discord-weekly-format.mjs';
import {durationLabel} from '../shared/duration.mjs';

const plain=value=>String(value??'').replace(/([\\`*_~|<>\[\]])/g,'\\$1');
const text=content=>({type:10,content});
const divider=()=>({type:14,divider:true,spacing:2});
const WEATHER={sun:'☀️ Ensoleillé',cloud:'⛅ Nuageux',overcast:'☁️ Couvert',rain:'🌧️ Pluie',random:'🎲 Aléatoire'};
function inert(payload){
  const copy=structuredClone(payload);
  const visit=items=>{for(const item of items||[]){if(item.type===2)item.disabled=true;visit(item.components);if(item.accessory)visit([item.accessory]);}};
  visit(copy.components);copy.allowed_mentions={parse:[]};return copy;
}

// Both presentations use the same authoritative event snapshot. No sample values.
export function rallyComparison(event,site={},timestamp=Date.now(),absent=null){
  const card=buildAnnounceEvent(event,site,timestamp,absent);
  if(event.sourceUrl){
    card.embeds[0].url=event.sourceUrl;
    for(const row of card.components||[])for(const button of row.components||[])if(button.style===5)button.url=event.sourceUrl;
  }
  const current=inert(buildCompleteAnnouncement(buildAnnounceIntro({events:1,streams:site.streams||[]},site),[{name:event.name,payload:card}],site));
  const round=event.rounds?.[0]||{},rally=event.rally||{};
  const unix=Math.floor(Number(event.startsAt)/1000);
  const when=event.timePending?'🕘 **Horaire à confirmer**':`🕘 **<t:${unix}:t>** · 📅 <t:${unix}:D>`;
  const heading=text(`# 🎉 SOIRÉE BOUBOULES AUJOURD’HUI !\n**${plain(event.name)}**\n${when}\n🎮 **Assetto Corsa Rally**${event.access?` · ${plain(event.access.toUpperCase())}`:''}`);
  const header=event.logoUrl?{type:9,components:[heading],accessory:{type:11,media:{url:event.logoUrl},description:'Événement Assetto Corsa Rally'}}:heading;
  const sections=[];
  if(rally.stages?.length)sections.push(`### 🏔 LES SPÉCIALES\n${rally.stages.map((stage,index)=>`**${String(index+1).padStart(2,'0')}** · ${plain(stage)}`).join('\n')}`);
  else if(rally.stagesPending)sections.push('### 🏔 LES SPÉCIALES\nSpéciales à définir.\nLes spéciales seront choisies pendant la soirée.');
  const cars=rally.carMode==='all'?'Choix libre · toutes les voitures':rally.carMode==='car'&&round.car?plain(round.car):rally.carMode==='category'&&round.category?plain(round.category):'';
  if(cars)sections.push(`### 🏎 LES VOITURES\n${cars}`);
  const lobby=[rally.host&&`👤 **Hôte** · ${plain(rally.host)}`,event.capacity!=null&&`👥 **Capacité** · ${event.capacity} places`,event.password&&'🔑 Mot de passe disponible sur la fiche'].filter(Boolean);
  if(lobby.length)sections.push(`### 🏠 LE LOBBY\n${lobby.join('\n')}`);
  const conditions=[round.weather&&`🌦️ **Météo** · ${WEATHER[round.weather]||plain(round.weather)}`,rally.minutes>0&&`⏱️ **Durée estimée** · ${durationLabel(rally.minutes)}`,round.fuel!=null&&`⛽ **Carburant** · ×${round.fuel}`,round.tyres!=null&&`🛞 **Pneus** · ×${round.tyres}`].filter(Boolean);
  if(conditions.length)sections.push(`### ⚙️ LES CONDITIONS\n${conditions.join('\n')}`);
  if(event.note)sections.push(`### 📝 CONSIGNES DE L’ORGANISATEUR\n${plain(event.note)}`);
  const entered=Number(event.entered)||0,capacity=event.capacity;
  const participation=[`### 👥 PARTICIPATION\n✅ **${capacity==null?entered:Math.min(entered,capacity)} inscrit${entered===1?'':'s'}${capacity==null?'':` sur ${capacity}`}**`];
  if(capacity!=null)participation.push(entered<capacity?`🟢 **${capacity-entered} place${capacity-entered===1?'':'s'} disponible${capacity-entered===1?'':'s'}**`:'🔴 **Complet**');
  if(capacity!=null&&entered>capacity)participation.push(`⏳ **${entered-capacity} en attente**`);
  if(event.absentCount!=null)participation.push(`❌ **${Number(event.absentCount)} absent${Number(event.absentCount)===1?'':'s'}**`);
  const children=[header,...(sections.length?[divider(),text(sections.join('\n\n'))]:[]),divider(),text(participation.join('\n'))];
  children.push(...structuredClone(card.components||[]));
  if(site.streamUrl){
    const times=[...new Set((site.streams||[]).map(item=>item.time).filter(value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))].sort();
    const channel=URL.canParse(site.streamUrl)?new URL(site.streamUrl).pathname.split('/').filter(Boolean)[0]:'';
    children.push(divider(),{type:9,components:[text(`### 🟣 ${plain(site.streamName||channel||'LE LIVE')}${times.length?`\n🕘 **${times.join(' · ')}**`:''}`)],accessory:{type:2,style:5,label:'Regarder le live',url:site.streamUrl,disabled:true}});
  }
  if(site.bannerUrl)children.push({type:12,items:[{media:{url:site.bannerUrl},description:'Bannière de la communauté'}]});
  const proposed=inert({flags:32768,components:[{type:17,accent_color:0x8b5cf6,components:children}]});
  const walk=items=>items.flatMap(item=>[item,...walk(item.components||[]),...(item.accessory?walk([item.accessory]):[])]);
  const all=walk(proposed.components),characters=all.filter(item=>item.type===10).reduce((n,item)=>n+item.content.length,0);
  if(all.length>40||characters>4000)throw Object.assign(new Error('Les détails de cet événement dépassent les limites V2. Aucun contenu n’a été supprimé.'),{status:422});
  return [{name:'Présentation actuelle · capture TDZ',format:current.flags&32768?'v2':'embed',view:'current',source:'capture',payload:current},{name:'Nouvelle proposition · capture TDZ',format:'v2',view:'proposed',source:'capture',payload:proposed}];
}
