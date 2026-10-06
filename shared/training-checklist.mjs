import {analyse, normal} from './training.mjs';

// A menu of exercises, not a timed plan or a prescribed order.
export const EXERCISES = [
  {key:'discover',title:'Repérer le circuit',tip:'Roule tranquillement pour repérer freinages, trajectoires et zones à risque.',rule:'4 tours roulés',default:true},
  {key:'pace',title:'Tenir un rythme régulier',tip:'Enchaîne 10 tours propres sans chercher le record. Vise un écart moyen inférieur à une seconde.',rule:'10 tours propres consécutifs et écart moyen ≤ 1 s',default:true},
  {key:'stint',title:'Faire un relais long',tip:'Roule presque un plein sans interruption. Observe la concentration, la consommation et les pneus en fin de relais.',rule:'Au moins 90 % du relais estimé, sans interruption',default:true},
  {key:'pit',title:'Travailler l’entrée et la sortie des stands',tip:'Repère la ligne de limitation, ton emplacement et la sortie. Vérifie toi-même le respect de la vitesse.',rule:'Passage aux stands suivi de tours en piste',default:true},
  {key:'refuel',title:'Tester le ravitaillement et les pneus',tip:'Répète un arrêt avec plein et 4 pneus. Vérifie les réglages du menu de stand avant d’entrer.',rule:'Plein et 4 pneus lors d’un même arrêt, puis reprise en piste',default:true},
  {key:'consumption',title:'Comprendre la consommation',tip:'Compare le carburant et l’énergie par tour à ton rythme de course pour prévoir la longueur d’un relais.',rule:'10 tours exploitables avec une consommation mesurée',default:true},
  {key:'rain',title:'S’entraîner sous la pluie',tip:'Si la pluie est possible, roule avec les pneus adaptés et trouve des repères de freinage sur piste mouillée.',rule:'5 tours valides sous la pluie détectée par SimHub',default:false},
  {key:'night',title:'Rouler de nuit',tip:'Teste tes repères et ta visibilité de nuit si la course en comporte. Ajuste la luminosité avant le départ.',rule:'À confirmer par toi : l’heure du jeu n’est pas transmise',default:false},
  {key:'traffic',title:'Gérer le trafic et les dépassements',tip:'Travaille les dépassements et les voitures plus rapides, sans sacrifier la sécurité pour un seul virage.',rule:'À confirmer par toi après une séance avec du trafic',default:false},
  {key:'start',title:'Préparer le départ',tip:'Entraîne-toi avec pneus et freins froids. Prépare le premier tour, les premières zones de freinage et le départ lancé.',rule:'À confirmer par toi',default:false},
  {key:'crew',title:'Répéter le changement de pilote',tip:'Avec l’équipage, répète la communication, le changement de pilote et les réglages à transmettre.',rule:'À confirmer par toi avec ton équipage',default:false},
  {key:'simulation',title:'Tester les conditions de course',tip:'Fais une simulation avec les réglages, la météo et la stratégie prévus. Vérifie que le plan fonctionne.',rule:'À confirmer par toi : les conditions prévues ne sont pas détectables',default:false}
];
export const checklistScope = (circuit,carClass) => `${circuit||'general'}::${normal(carClass||'all')||'all'}`;
export function analysisFromLive(sessions) {
  return analyse(sessions.map(session=>({...session,laps:session.laps.map(lap=>({...lap,s:[null,null,null],
    pit:lap.pit||lap.invalid,fuel:session.capacity&&lap.fuel?lap.fuel/session.capacity*100:null}))})));
}
export function checklistEvidence(a,liveSessions=[]) {
  const b=liveSessions.length?analysisFromLive(liveSessions):null;
  const candidates=[a,b].filter(Boolean);
  const proof={};
  const discovery=Math.max(...candidates.map(item=>item.totalLaps||0));
  if(discovery>=4)proof.discover=`${discovery} tours roulés`;
  const regular=candidates.find(item=>item.longestRun>=10&&item.regularity!==null&&item.regularity<=1);
  if(regular)proof.pace=`${regular.longestRun} tours propres consécutifs · écart moyen ± ${regular.regularity.toFixed(2).replace('.',',')} s`;
  const stint=candidates.find(item=>item.tankLaps&&item.longestRun>=Math.max(5,Math.floor(item.tankLaps*.9)));
  if(stint)proof.stint=`${stint.longestRun} tours consécutifs · plein estimé à ${stint.tankLaps} tours`;
  if(candidates.some(item=>item.pitDone))proof.pit='Passage aux stands et reprise en piste détectés';
  const clean=liveSessions.flatMap(session=>session.laps.filter(lap=>!lap.pit&&!lap.invalid));
  const wet=clean.filter(lap=>lap.rain!==null&&lap.rain>=.05).length;
  if(wet>=5)proof.rain=`${wet} tours valides sous la pluie`;
  if(candidates.some(item=>item.cleanLaps>=10&&(item.fuelPerLap>0||item.energyPerLap>0)))proof.consumption='10 tours exploitables ou plus avec consommation mesurée';
  for(const session of liveSessions)for(const stop of session.stops||[]) {
    if(!session.laps.some(lap=>lap.n>stop.lap&&!lap.pit&&!lap.invalid))continue;
    proof.pit='Arrêt aux stands et reprise en piste détectés';
    if(stop.tyres===4&&(stop.fuel>1||stop.ve>1))proof.refuel='Plein et 4 pneus détectés, puis reprise en piste';
  }
  return proof;
}
export function checklistItems(rows=[]) {
  return EXERCISES.map(exercise=>{
    const row=rows.find(item=>item.exercise===exercise.key);
    return {...exercise,selected:row?Boolean(row.selected):exercise.default,manual:Boolean(row?.manual),auto:Boolean(row?.auto),
      done:Boolean(row?.manual||row?.auto),proof:row?.auto?row.proof:row?.manual?'Validé par toi':''};
  });
}
