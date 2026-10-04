// Preparation measures exposure, not competence. Unknown data never becomes a failed objective.
export const normalName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const median = values => {const a=[...values].sort((x,y)=>x-y); return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2 : null;};
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function analysePreparation(sessions, conditions = {}, level = 'discover') {
  let total=0,valid=0,unknownValidity=0,seconds=0,wetSeconds=0,nightSeconds=0,wetKnown=0,nightKnown=0,longest=0,pits=0;
  const comparable=[];
  for(const session of sessions){
    let run=0,previous=null;
    for(const lap of session.laps || []){
      if(!positive(lap.seconds))continue;
      total++;seconds+=lap.seconds;
      if(lap.valid===true)valid++; else if(lap.valid==null)unknownValidity++;
      if(typeof lap.wet==='boolean'){wetKnown++;if(lap.wet)wetSeconds+=lap.seconds;}
      if(typeof lap.night==='boolean'){nightKnown++;if(lap.night)nightSeconds+=lap.seconds;}
      // A pause, pit lap, incomplete capture or sequence gap breaks a continuous run.
      if(lap.pit===true)pits++;
      const contiguous=previous===null || lap.number===previous+1;
      run=lap.pit===false&&lap.continuous===true ? (contiguous?run:0)+lap.seconds : 0;
      longest=Math.max(longest,run);previous=lap.number;
      if(lap.valid===true&&lap.pit===false&&lap.continuous===true){
        comparable.push({seconds:lap.seconds,wet:lap.wet,night:lap.night,session:session.clientId||session.id,fuelUsed:lap.fuelUsed,energyUsed:lap.energyUsed});
      }
    }
  }
  // Compare one session and condition group, never mix dry/wet or unrelated sessions into a pace score.
  const groups=new Map();
  for(const lap of comparable){const key=JSON.stringify([lap.session,lap.wet,lap.night]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(lap);}
  const paceGroup=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[];
  const pace=median(paceGroup.map(x=>x.seconds)),spread=paceGroup.length>=5 ? median(paceGroup.map(x=>Math.abs(x.seconds-pace)))/pace*100 : null;
  const fuel=paceGroup.map(x=>x.fuelUsed).filter(positive),energy=paceGroup.map(x=>x.energyUsed).filter(positive);
  const target=Math.min(180,Math.max(20,Number(conditions.stintMinutes)||40));
  const item=(key,label,evidence,status)=>({key,label,evidence,status});
  const coverage=[
    item('familiarity','Repères',`${total} tour${total===1?'':'s'} enregistré${total===1?'':'s'}`,total>= (level==='discover'?15:5)?'worked':total?'partial':'todo'),
    item('regularity','Régularité',spread==null?`${valid} tours valides${unknownValidity?' · validité parfois inconnue':''}`:`Dispersion habituelle : ${spread.toFixed(1)} % · ${paceGroup.length} tours comparables`,paceGroup.length>=10?'worked':valid?'partial':total&&unknownValidity===total?'unknown':'todo'),
    item('stint','Relais continu',longest?`${Math.floor(longest/60)} min observées · repère ${target} min`:'Aucun relais continu mesuré',longest>=target*60?'worked':longest?'partial':total?'unknown':'todo'),
    item('pits','Passages aux stands',`${pits} tour${pits===1?'':'s'} avec passage aux stands`,pits>=2?'worked':pits?'partial':total&&!sessions.some(s=>s.laps.some(l=>typeof l.pit==='boolean'))?'unknown':'todo')
  ];
  for(const [key,label,required,known,duration] of [['wet','Piste mouillée',conditions.wet,wetKnown,wetSeconds],['night','Nuit',conditions.night,nightKnown,nightSeconds]]){
    if(required===false)continue;
    coverage.push(item(key,label,`${Math.floor(duration/60)} min observées${required==null?' · conditions de course à confirmer':''}`,duration>=900?'worked':duration?'partial':total&&!known?'unknown':required===true?'todo':'optional'));
  }
  return {total,valid,unknownValidity,minutes:Math.floor(seconds/60),longestMinutes:Math.floor(longest/60),paceSeconds:pace,spreadPercent:spread,
    fuelPerLap:median(fuel),energyPerLap:median(energy),fuelSamples:fuel.length,coverage};
}

const CONTENT={
  familiarity:{title:'Retrouver tes repères',why:'Construis un rythme confortable avec le setup commun.',steps:['Roule avec une charge de course, à un rythme prudent.','Repère les freinages et les zones où tu hésites.','Termine par une série de tours propres, sans chercher un record.']},
  regularity:{title:'Stabiliser ton rythme',why:'La répétition des tours compte davantage qu’un meilleur tour isolé.',steps:['Utilise le setup commun et une charge de course.','Choisis un rythme que tu peux répéter sans forcer.','Enchaîne les tours ; accepte de perdre du temps pour éviter une erreur.']},
  stint:{title:'Prolonger un relais',why:'Observe le comportement de la voiture sur une séquence continue.',steps:['Pars avec suffisamment de carburant pour la séance.','Roule sans pause ni retour au garage, à ton rythme de course.','Observe les changements de comportement et termine par un arrêt aux stands.']},
  pits:{title:'Répéter les stands',why:'Un passage observé ne prouve pas que toute la procédure est maîtrisée.',steps:['Repère l’entrée et la ligne du limiteur.','Effectue un arrêt complet puis une sortie prudente.','Répète la procédure avec le setup commun ; prépare le changement de pilote avec ton équipage.']},
  wet:{title:'Prendre tes repères sur piste mouillée',why:'La piste mouillée fait partie des conditions à préparer.',steps:['Configure une piste mouillée et les pneus adaptés.','Commence prudemment : freinage, motricité et visibilité.','Cherche des tours propres et réguliers avec le setup prévu par l’équipage.']},
  night:{title:'Retrouver tes repères de nuit',why:'Les repères visibles de jour peuvent devenir difficiles à retrouver.',steps:['Configure une heure de nuit dans le jeu.','Repère les freinages et les zones peu éclairées à rythme prudent.','Enchaîne les tours puis répète une entrée aux stands.']}
};
export function nextSession(analysis,level='discover',minutes=30){
  const order=level==='discover'?['familiarity','regularity','wet','night','stint','pits']:['wet','night','stint','regularity','pits','familiarity'];
  let objective=order.map(key=>analysis.coverage.find(x=>x.key===key)).find(x=>x&&['todo','partial'].includes(x.status));
  const maintenance=!objective;
  if(!objective)objective={key:'regularity'};
  return {...CONTENT[objective.key],key:objective.key,minutes:[20,30,45,60].includes(minutes)?minutes:30,maintenance,
    ...(maintenance?{why:'Les domaines mesurables ont été pratiqués ou restent non mesurés. Entretiens ton rythme et vérifie les procédures avec ton équipage.'}:{})};
}
