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
        comparable.push({seconds:lap.seconds,wet:lap.wet,night:lap.night,session:session.clientId||session.id||sessions.indexOf(session),startedAt:session.startedAt??null,fuelUsed:lap.fuelUsed,energyUsed:lap.energyUsed});
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
  const knownValidity=total-unknownValidity;
  const bestSeconds=paceGroup.length?Math.min(...paceGroup.map(x=>x.seconds)):null;
  const deviationSeconds=paceGroup.length>=5?median(paceGroup.map(x=>Math.abs(x.seconds-pace))):null;
  const coverage=[
    item('familiarity','Repères de piste',`${total} tour${total===1?'':'s'} enregistré${total===1?'':'s'}`,total>= (level==='discover'?15:5)?'worked':total?'partial':'todo'),
    item('regularity','Rythme de relais',spread==null?`${valid} tours valides${unknownValidity?' · validité parfois inconnue':''}`:`Dispersion habituelle : ${spread.toFixed(1)} % · ${paceGroup.length} tours comparables`,paceGroup.length>=10?'worked':valid?'partial':total&&unknownValidity===total?'unknown':'todo'),
    item('stint','Relais continu',longest?`${Math.floor(longest/60)} min observées · repère ${target} min`:'Aucun relais continu mesuré',longest>=target*60?'worked':longest?'partial':total?'unknown':'todo'),
    item('pits','Procédure des stands',`${pits} tour${pits===1?'':'s'} avec passage aux stands`,pits>=2?'worked':pits?'partial':total&&!sessions.some(s=>s.laps.some(l=>typeof l.pit==='boolean'))?'unknown':'todo')
  ];
  for(const [key,label,required,known,duration] of [['wet','Piste mouillée',conditions.wet,wetKnown,wetSeconds],['night','Nuit',conditions.night,nightKnown,nightSeconds]]){
    if(required===false)continue;
    coverage.push(item(key,label,`${Math.floor(duration/60)} min observées${required==null?' · conditions de course à confirmer':''}`,duration>=900?'worked':duration?'partial':total&&!known?'unknown':required===true?'todo':'optional'));
  }
  return {total,valid,unknownValidity,minutes:Math.floor(seconds/60),longestMinutes:Math.floor(longest/60),paceSeconds:pace,spreadPercent:spread,
    fuelPerLap:median(fuel),energyPerLap:median(energy),fuelSamples:fuel.length,energySamples:energy.length,
    rollingSeconds:seconds,longestSeconds:longest,wetSeconds,nightSeconds,wetKnown,nightKnown,pitLaps:pits,targetStintMinutes:target,
    knownValidity,validPercent:knownValidity?valid/knownValidity*100:null,bestSeconds,deviationSeconds,paceSamples:paceGroup.length,
    paceConditions:paceGroup.length?{wet:paceGroup[0].wet??null,night:paceGroup[0].night??null}:null,
    paceStartedAt:paceGroup[0]?.startedAt??null,coverage};
}

const CONTENT={
  familiarity:{title:'Installer tes repères de course',why:'Trouve une trajectoire et des freinages que tu peux répéter avec le setup commun.',focus:'Freinage · trajectoire · sortie de virage',goal:'Finir avec une série de tours à un rythme confortable, en retrouvant tes repères sans hésiter.',warm:['Sors des stands prudemment et prends un premier tour pour découvrir l’adhérence.','Identifie des repères fixes : panneaux, marquages, début de vibreur. Évite une ombre comme seul repère.'],exercise:['Travaille un ou deux virages où tu hésites : freine tôt, puis ajuste progressivement.','Privilégie une sortie de virage propre. Un petit gain à l’entrée ne vaut pas une perte de contrôle à la sortie.','Termine par des tours complets avec les mêmes repères, sans chercher le meilleur chrono.'],debrief:'Repère les virages encore hésitants. Le site compte le roulage enregistré ; il ne peut pas juger tes points de freinage.'},
  regularity:{title:'Construire ton rythme de relais',why:'En endurance, un rythme répétable est plus utile qu’un tour rapide suivi d’une erreur.',focus:'Tours valides · rythme stable · marge',goal:'Enchaîner une série de tours valides à charge de course, sans forcer pour rattraper une erreur.',warm:['Reprends progressivement tes repères avec le carburant et le setup de course.','Attends un comportement prévisible de la voiture avant d’augmenter le rythme.'],exercise:['Choisis une allure que tu peux répéter. Garde une marge au freinage et à la remise des gaz.','Après un tour raté, reprends ton rythme normal : ne cherche pas à récupérer tout le temps dans le virage suivant.','Si tu rencontres du trafic, prépare le passage et accepte de perdre du temps. Le site ne mesure pas la qualité de tes dépassements.'],debrief:'Compare le chrono médian et l’écart habituel sur les tours comparables. Un tour valide n’exclut pas un contact ; ce bilan ne certifie pas une conduite sûre.'},
  stint:{title:'Tenir la distance d’un relais',why:'Prépare le roulage continu et l’évolution de la voiture avec la charge de course.',focus:'Roulage continu · charge de course · constance',goal:'Approcher la durée de relais prévue par l’équipage sans pause ni retour au garage.',warm:['Pars avec la charge nécessaire au bloc de roulage ; vérifie le carburant et l’énergie disponibles.','La mise en température fait partie du relais : continue à rouler sans interruption.'],exercise:['Reste en piste sans pause ni retour au garage. Privilégie la constance à l’attaque.','Observe l’évolution du freinage, de la motricité et du comportement de la voiture.','Surveille carburant et énergie dans le jeu. Le guide ne remplace pas les informations du tableau de bord.'],debrief:'Regarde le plus long relais mesuré et compare-le à l’objectif de l’équipage. Un passage aux stands, une pause ou un trou de collecte coupe la séquence.'},
  pits:{title:'Répéter ta procédure des stands',why:'Prépare une entrée, un arrêt et une sortie que tu sais reproduire sous pression.',focus:'Entrée des stands · limiteur · sortie',goal:'Répéter la procédure complète en vérifiant les règles applicables à cette course.',warm:['Repère l’accès aux stands, la ligne de limitation et la zone de sortie avant d’attaquer.','Vérifie la commande du limiteur et prépare la demande d’arrêt dans le jeu.'],exercise:['Prépare tes choix d’arrêt avant l’entrée : carburant, énergie et pneus selon la voiture.','Ralentis avant la ligne de limitation, respecte la vitesse imposée et repère ton emplacement.','Repars en contrôlant le trafic et les lignes de sortie. Répète la procédure si le temps disponible le permet.'],debrief:'Vérifie mentalement tes commandes et la procédure. Le site observe des tours avec passage aux stands ; il ne valide ni un arrêt complet ni un changement de pilote.'},
  wet:{title:'Construire ton relais sur piste mouillée',why:'Prépare les freinages, la motricité et la visibilité dans les conditions annoncées.',focus:'Adhérence · motricité · visibilité',goal:'Trouver un rythme reproductible sur le mouillé avec les pneus et le setup prévus par l’équipage.',warm:['Sors des stands prudemment avec les pneus prévus pour le mouillé.','Commence lentement pour évaluer l’adhérence : freinage en ligne, remise des gaz progressive.'],exercise:['Augmente progressivement le rythme ; adapte tes repères au niveau d’adhérence rencontré.','Observe les zones d’eau, les changements d’adhérence et la visibilité. Garde davantage de marge dans le trafic.','Recherche des tours valides et répétables. Les chronos sur le mouillé ne se comparent pas directement à ceux du sec.'],debrief:'Regarde le temps de roulage identifié comme mouillé. Sans information météo fiable, ce temps reste non mesuré.'},
  night:{title:'Préparer ton relais de nuit',why:'Retrouve tes repères quand la lumière change et prépare les zones de visibilité réduite.',focus:'Repères nocturnes · visibilité · stands',goal:'Enchaîner des tours avec des repères visibles de nuit et une entrée aux stands anticipée.',warm:['Rejoins la piste à rythme prudent et vérifie les zones peu éclairées.','Vérifie la visibilité depuis ton cockpit et reprends la piste à rythme prudent.'],exercise:['Identifie les repères qui restent visibles et un repère de secours pour les virages difficiles.','Garde une marge dans les zones sombres et lorsque la visibilité est réduite par le trafic.','Répète l’approche des stands de nuit sans chercher ton meilleur tour.'],debrief:'Vérifie le roulage identifié comme nocturne. Le site ne peut pas savoir si tes repères visuels sont maîtrisés.'}
};
export function nextSession(analysis,level='discover',minutes=30){
  const order=level==='discover'?['familiarity','regularity','wet','night','stint','pits']:['wet','night','stint','regularity','pits','familiarity'];
  let objective=order.map(key=>analysis.coverage.find(x=>x.key===key)).find(x=>x&&['todo','partial'].includes(x.status));
  const maintenance=!objective;
  if(!objective)objective={key:'regularity'};
  const content=CONTENT[objective.key],duration=[20,30,45,60].includes(minutes)?minutes:30;
  const briefing=3,warm=level==='discover'?5:4,finish=3,exercise=duration-briefing-warm-finish;
  const phase=(id,title,start,length,actions)=>({id,title,startMinute:start,endMinute:start+length,minutes:length,actions});
  const prep=['Charge le setup commun, choisis la voiture et le circuit de la course.','Pars avec une charge de course et vérifie tes commandes de stands.'];
  if(objective.key==='wet')prep.push('Configure une piste mouillée dans le jeu et choisis les pneus adaptés.');
  if(objective.key==='night')prep.push('Configure une heure de nuit dans le jeu.');
  const phases=[
    phase('briefing','Briefing au garage',0,briefing,prep),
    phase('warmup','Tour de sortie et mise en température',briefing,warm,content.warm),
    phase('exercise',objective.key==='pits'?'Répétition de la procédure':'Bloc de roulage',briefing+warm,exercise,content.exercise),
    phase('debrief','Retour aux stands et débrief',duration-finish,finish,['Termine le tour en cours, rentre aux stands en respectant la procédure.',content.debrief])
  ];
  const stintTarget=analysis.targetStintMinutes||40,continuousMinutes=warm+exercise;
  const stintAdvice=objective.key==='stint'&&continuousMinutes<stintTarget
    ?`Ce créneau prévoit ${continuousMinutes} min de roulage continu pour un relais cible de ${stintTarget} min. Prévois au moins ${stintTarget+briefing+finish} min au total pour travailler le relais complet.`:null;
  return {...content,key:objective.key,minutes:duration,maintenance,phases,continuousMinutes,stintAdvice,
    steps:phases.map(p=>p.title),
    ...(maintenance?{why:'Entretiens ton rythme de relais et les procédures. Les données absentes restent à confirmer.'}:{})};
}
