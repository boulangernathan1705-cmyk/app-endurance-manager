import {isSolo,ANY_CATEGORY,soloCounts,eventCircuitName} from './solo.mjs';
import {raceHourLabel,raceEndLabel} from '../timeline.mjs';
import {shortDateLabel,timeLabel} from '../dates.mjs';
import {durationLabel,eventMinutes,driverChangeRequired} from '../../shared/duration.mjs';
import {app,state,esc,button,carPreferenceChoices,registrationCarLabel,renderAvailabilityTimeline,notifyRender,logo,categories,CARS,circuitLabel,communityTag,entryCommunities,communityChoice} from './core.mjs';
import {getLocale} from '../i18n.mjs';

// The player's own entries (on an official race, possibly made with another of his communities).
export function ownRegistrations(departure) { return departure.availability.filter(reg => reg.mine); }
export function ownRegistration(departure) { return ownRegistrations(departure)[0]; }
export function registrationDraft(reg) {
  return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',soloDriver:!!reg.soloDriver,id:reg.id,version:reg.version,participantId:reg.participantId,participantUserId:reg.participantUserId||null,discordLinked:!!reg.discordLinked,mine:reg.mine,forOther:!reg.mine,manualOther:!reg.mine&&!reg.participantUserId&&!reg.discordLinked,communityId:reg.community?.id||''};
}
// Official race: the player first chooses the community he enters with (one of his, when he has several).
// Solo event with nothing to choose (no category): one click enters the pilot, no form.
export function canEnterInOneClick(event,departure){
  return Boolean(isSolo(event)&&state.user?.name&&!soloRounds(event).length&&!ownRegistrations(departure).length&&!(event.official&&entryCommunities().length>1));
}
export async function enterInOneClick(event,departure,api){
  return api(`/api/races/${event.id}/departures/${departure.id}/registrations`,'POST',{name:state.user.name.slice(0,32),choices:[],forOther:false});
}
export function needsCommunityChoice(event,departure,stateDraft){
  return Boolean(event.official&&state.user&&!stateDraft.id&&!stateDraft.forOther&&stateDraft.mode!=='category'&&!stateDraft.communityId&&entryCommunities().length>1&&!ownRegistrations(departure).length);
}
function renderCommunityStep(departure){
  return `<form class="form-section registration-form registration-stepper" data-kind="registration" data-departure="${departure.id}" data-step="0">
<p class="registration-step-label">Étape 1 · Communauté</p>
${communityChoice(entryCommunities(),{action:'registration-community',attrs:`data-departure="${departure.id}"`,help:'Course officielle : chaque pilote y court avec l’une de ses communautés, et rejoint les équipages de celle-ci.'})}
</form>`;
}
// Community of the entry, above its first step (changeable until it is saved).
function communityLine(event,departure,stateDraft){
  if(!event.official||!stateDraft.communityId)return '';
  const community=entryCommunities().find(item=>item.id===stateDraft.communityId);
  if(!community)return '';
  const change=!stateDraft.id&&stateDraft.mode!=='category'&&!state.pendingCrewJoin&&entryCommunities().length>1?button('registration-community','Changer',`data-departure="${departure.id}" data-community=""`,'link-button'):'';
  return `<p class="registration-community-line"><span>Communauté</span>${communityTag({community})}<strong>${esc(community.name)}</strong>${change}</p>`;
}
export function draftFor(departure) {
  if (!state.drafts[departure.id]) {
    const mine=ownRegistration(departure);
    state.drafts[departure.id]=mine ? registrationDraft(mine) : {name:state.user?.name?.slice(0,32)||state.pilotName,category:'',cars:[],carAny:false,status:'',preferredPilot:'',soloDriver:false,id:null,version:null,forOther:false};
  }
  return state.drafts[departure.id];
}
export function statusLabel(status) {
  if(status==='whole')return 'Toute la course'; if(status==='unavailable')return 'Indisponible';
  return String(status||'').split(',').map(part=>/^h\d+$/.test(part)?`Heure ${part.slice(1)}`:({beginning:'Début',middle:'Milieu',end:'Fin'}[part]||'')).filter(Boolean).join(' · ');
}
function slotLabel(status) { return status==='whole'?'Toute la course':status==='unavailable'?'Indisponible':String(status||'').split(',').filter(part=>/^h\d+$/.test(part)).map(part=>`Heure ${part.slice(1)}`).join(' · ')||statusLabel(status); }

export function renderRegistration(reg,departure,duration,showCarPreference=true) {
  const locked=departure.startsAt<=Date.now();
  const origin=reg.addedByName?` <span class="registration-origin-info" title="Inscription ajoutée par ${esc(reg.addedByName)}" aria-label="Inscription ajoutée par ${esc(reg.addedByName)}">ⓘ</span>`:'';
  const timeline=renderAvailabilityTimeline({departure,duration,status:reg.status,label:slotLabel(reg.status)});
  return `<div class="pilot-row${reg.mine?' ux-current-pilot':''}"><div class="pilot-main"><span class="pilot-name">${communityTag(reg)}${esc(reg.name)}${origin}</span>${reg.soloDriver?'<span class="solo-driver-badge" data-tip="Fait la course seul, sans équipier.">SOLO</span>':''}<span class="pilot-category-logo" title="${esc(reg.category||'Catégorie')}" aria-label="${esc(reg.category||'Catégorie')}">${reg.category?logo(reg.category):'—'}</span>${showCarPreference?`<span class="pilot-car">${esc(registrationCarLabel(reg))}</span>`:''}${reg.status==='unavailable'?'<span class="registration-status">Indisponible</span>':''}${reg.preferredPilot?`<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(reg.preferredPilot)}</strong></span>`:''}</div>${timeline}${reg.canEdit&&!locked?button('edit-registration','Modifier',`data-id="${reg.id}" data-departure="${departure.id}"`,'edit-button ux-pilot-edit'):''}</div>`;
}

function identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf,withPreferred=true) {
  if(categoryMode)return '';
  const fields=[];
  if(!stateDraft.id&&stateDraft.forOther&&state.user){
    const options=state.participants.filter(participant=>participant.id!==state.user?.id);
    const english=getLocale()==='en';
    const manualSelected=manualOther&&!linkedOther;
    fields.push(`<label class="registration-identity-field"><span class="form-label">Pilote</span><select name="participant" data-departure="${departure.id}" required><option value="" disabled ${!linkedOther&&!manualSelected?'selected':''}>${english?'Choose a driver':'Choisir un pilote'}</option>${options.map(participant=>`<option value="${esc(participant.id)}" ${stateDraft.participantUserId===participant.id?'selected':''}>${esc(participant.name)}</option>`).join('')}<option value="__manual__" ${manualSelected?'selected':''}>${english?'Other driver':'Autre pilote'}</option></select></label>`);
  } else if(stateDraft.forOther&&linkedOther) fields.push(`<div class="registration-identity-field registration-identity-readonly"><span class="form-label">Pilote</span><strong>${esc(stateDraft.name||'Pilote Discord')}</strong></div>`);
  if(manualOther||guestSelf) fields.push(`<label class="registration-identity-field"><span class="form-label">${manualOther?'Pseudo de l’autre pilote':'Pseudo pilote'}</span><input name="pilotName" data-departure="${departure.id}" value="${esc(stateDraft.name)}" maxlength="32" required autocomplete="nickname"></label>`);
  if(withPreferred)fields.push(preferredPilotField(stateDraft,departure));
  if(!fields.length)return '';
  return `<div class="registration-identity-grid ${stateDraft.forOther?'is-other':'is-self'}">${fields.join('')}</div>`;
}

function preferredPilotField(stateDraft,departure){return `<label class="registration-identity-field"><span class="form-label">Pilote souhaité <span class="muted">(facultatif)</span></span><input name="preferredPilot" data-departure="${departure.id}" value="${esc(stateDraft.preferredPilot||'')}" maxlength="32" placeholder="Pseudo du pilote souhaité"></label>`;}

function registrationContext(event,departure,stateDraft) {
  const selected=departure.availability.find(reg=>reg.id===stateDraft.id);
  const same=departure.availability.filter(reg=>stateDraft.participantId&&reg.participantId===stateDraft.participantId);
  const assigned=(departure.crews||[]).some(crew=>crew.registrationIds.some(id=>same.some(reg=>reg.id===id)));
  const source=selected||same[0]||(!stateDraft.forOther?ownRegistrations(departure)[0]:null);
  const canAdd=!!source&&!assigned&&stateDraft.mode!=='category'&&event.categories.some(category=>!same.some(reg=>reg.category===category));
  return {selected,same,assigned,source,canAdd};
}

function renderAddCategoryAction(event,departure,stateDraft) {
  if(isSolo(event))return '';
  const {source,canAdd}=registrationContext(event,departure,stateDraft);
  return canAdd?button('new-registration','Ajouter une catégorie',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,'secondary-button registration-nav-button category-add-button'):'';
}

export function renderRegistrationForm(event,departure,stateDraft=draftFor(departure)) {
  const duration=event.durationHours||6;
  const {selected,same,assigned,source}=registrationContext(event,departure,stateDraft);
  const contextName=stateDraft.name||source?.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const categoryMode=stateDraft.mode==='category'; const otherMode=stateDraft.forOther&&!categoryMode;
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!categoryMode&&!!stateDraft.manualOther; const guestSelf=!stateDraft.forOther&&!state.user;
  const title=registrationTitle(event,departure,stateDraft);
  const banner=categoryMode?`<div class="registration-context-banner category"><span>AJOUT D’UNE CATÉGORIE</span><strong>${esc(contextName||'Pilote')}</strong></div>`:otherMode?`<div class="registration-context-banner other"><span>${stateDraft.id?'INSCRIPTION GÉRÉE':'AUTRE PILOTE'}</span>${contextName?`<strong>${esc(contextName)}</strong>`:''}</div>`:(contextName||state.user?.name?`<div class="registration-context-banner self"><span>PILOTE</span><strong>${esc(contextName||state.user.name)}</strong></div>`:'');
  return `<form class="form-section registration-form" data-kind="registration" data-departure="${departure.id}"><h3 class="form-title">${title}</h3>${banner}${identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf)}<div class="registration-choices"><span class="form-label">Heures de présence (${durationLabel(eventMinutes(event))})</span><p class="availability-hint">Clique sur les créneaux où tu es disponible.</p>${renderAvailabilityTimeline({departure,duration,status:stateDraft.status,interactive:true,label:'Heures de présence'})}<div class="special-availability">${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${stateDraft.status==='whole'}"`,`special-button whole ${stateDraft.status==='whole'?'active':''}`)}</div></div>${stateDraft.status==='unavailable'?'':`<div class="category-area"><span class="form-label">Catégorie</span><div class="categories">${event.categories.map(category=>button('category',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${((assigned&&stateDraft.id&&!categoryMode&&category!==stateDraft.category)||same.some(reg=>reg.id!==stateDraft.id&&reg.category===category))?'disabled':''} aria-pressed="${stateDraft.category===category}"`,`category-button ${categories[category]?.css||''} ${stateDraft.category===category?'active':''}`)).join('')}</div>${stateDraft.category?carPreferenceChoices(stateDraft.category,stateDraft.cars,stateDraft.carAny):''}</div>`}<div class="save-row"><button type="submit" class="save-button">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'S’INSCRIRE'}</button>${stateDraft.id?button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button'):''}</div></form>`;
}

// Step-by-step version of the same form, used in the registration panel of a departure:
// 1 identity + category, 2 cars, 3 hours, 4 summary. Every field stays in the form (hidden steps
// are only hidden), so submitRegistration reads it exactly like the one-page form.
export const REGISTRATION_STEPS=['Catégorie','Voiture(s)','Heures de présence','Récapitulatif'];
export function registrationStep(stateDraft){
  const step=Number(stateDraft.step)||(stateDraft.id?4:1);
  return Math.min(4,Math.max(1,step));
}
// "Je la fais tout seul": allowed everywhere; a warning when the race requires a driver change
// (always on LMU, iRacing races over 4 h unless the organizer decided otherwise).
function soloDriverNotice(event,stateDraft){
  if(!stateDraft.soloDriver)return '';
  return driverChangeRequired(event)
    ?'<p class="solo-driver-warning" role="alert"><span aria-hidden="true">⚠</span> Attention : changement de pilote obligatoire sur cette course. Si tu la fais en solo, ta course ne comptera pas au classement.</p>'
    :'<p class="solo-driver-note">Tu rouleras seul toute la course, sans équipier.</p>';
}
function hoursSummary(status,departure,duration){
  if(status==='whole')return `Toute la course (${durationLabel(Number(departure?.endsAt)?(departure.endsAt-departure.startsAt)/60000:duration*60)})`;
  const hours=String(status||'').split(',').filter(part=>/^h\d+$/.test(part)).map(part=>Number(part.slice(1))).sort((a,b)=>a-b);
  if(!hours.length)return 'Aucune heure choisie';
  // Same hour labels as the timeline (minutes of the start and clock changes included).
  const clock=offset=>offset===duration&&Number(departure.endsAt)?raceEndLabel(departure):raceHourLabel(departure,offset);
  const ranges=[];let first=hours[0],previous=first;
  for(const hour of [...hours.slice(1),null]){
    if(hour!==null&&hour===previous+1){previous=hour;continue;}
    ranges.push(`${clock(first-1)}–${clock(previous)}`);first=hour;previous=hour;
  }
  // The last slot of a race with minutes is shorter (2 h 30: the third slot lasts 30 min).
  const total=Number(departure.endsAt)?(departure.endsAt-departure.startsAt)/60000:duration*60;
  return `${ranges.join(', ')} (${durationLabel(hours.reduce((sum,hour)=>sum+Math.max(0,Math.min(60,total-(hour-1)*60)),0))})`;
}
// Solo race: one step per round (category and car on the same screen), then the summary.
// draft.choices holds one {category,cars,carAny} per round; draft.solo is the number of rounds.
export function soloRounds(event){
  const rounds=event.rounds?.length?event.rounds:[{circuit:event.circuit,durationMinutes:0,categories:event.categories}];
  const list=rounds.map(round=>({...round,categories:round.randomCategory?[]:round.categories?.length?round.categories:event.categories}));
  // No category offered (AMS2, ACE, or none ticked): a simple entry, straight to the summary, unless there are
  // several rounds (the pilot picks the ones he does).
  return list.length<2&&list.every(round=>!round.categories?.length)?[]:list;
}
function initSoloDraft(event,departure,stateDraft){
  const rounds=soloRounds(event);
  stateDraft.solo=rounds.length;stateDraft.soloEvent=true;stateDraft.status='whole';
  if(!Array.isArray(stateDraft.choices)||stateDraft.choices.length!==rounds.length){
    const mine=stateDraft.id?(departure.availability||[]).find(reg=>reg.id===stateDraft.id):null;
    const saved=mine?.roundChoices?.length?mine.roundChoices:mine?[{category:mine.category,cars:mine.cars||[],carAny:mine.carAny}]:[];
    // A round with a single category has it chosen already.
    stateDraft.choices=rounds.map((round,index)=>saved[index]?.skip?{skip:true,category:ANY_CATEGORY,cars:[],carAny:true}:saved[index]&&round.categories.length?{...saved[index],cars:[...(saved[index].cars||[])]}:!round.categories.length?{category:ANY_CATEGORY,cars:[],carAny:true}:{category:round.categories.length===1?round.categories[0]:'',cars:[],carAny:true});
  }
  return rounds;
}
function soloChoiceLabel(choice,round){
  if(choice?.skip)return 'Ne fait pas cette manche';
  if(round&&!round.categories.length)return round.randomCategory?'Je la fais · catégorie aléatoire':'Je la fais';
  if(!choice?.category)return '—';
  if(choice.category===ANY_CATEGORY)return 'Peu importe';
  return `${logo(choice.category)} ${esc(choice.category)}`;
}
function renderSoloStepper(event,departure,stateDraft){
  const rounds=initSoloDraft(event,departure,stateDraft);
  // Opened from a round (« Manche 2 »): that round only; the others are entered on their own.
  const only=Number.isInteger(stateDraft.onlyRound)&&rounds[stateDraft.onlyRound],shown=only?[stateDraft.onlyRound]:rounds.map((_,index)=>index);
  stateDraft.solo=shown.length;stateDraft.shownRounds=shown;
  const total=shown.length+1;
  const step=Math.min(Math.max(Number(stateDraft.step)||(stateDraft.id?total:1),1),total);
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!!stateDraft.manualOther;
  const identity=identityFields(stateDraft,departure,false,manualOther,linkedOther,false,false);
  const stepName=n=>n===total?'Récapitulatif':rounds.length>1?`Manche ${shown[n-1]+1}`:'Catégorie';
  const pane=(n,content)=>`<section class="registration-step" data-step="${n}" ${n===step?'':'hidden'}>${content}</section>`;
  const roundPane=(index,position)=>{
    const round=rounds[index],n=position+1;
    const choice=stateDraft.choices[index];
    // A single category is already chosen: no question, straight to the cars.
    const single=round.categories.length===1;
    const buttons=(single?[]:[...round.categories,ANY_CATEGORY]).map(category=>{
      const any=category===ANY_CATEGORY,active=choice.category===category;
      const label=any?`<span class="solo-any-logo" aria-hidden="true">✱</span><span class="registration-category-copy"><strong>Peu importe</strong><small>N’importe quelle catégorie</small></span>`:`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong></span>`;
      return button('solo-category',label,`data-departure="${departure.id}" data-round="${index}" data-value="${esc(category)}" aria-pressed="${active}"`,`category-button ${any?'':categories[category]?.css||''} ${active?'active':''}`);
    }).join('');
    // Several rounds: the pilot does this one or not.
    const toggle=rounds.length>1&&!only?`<div class="solo-round-toggle" role="group" aria-label="Manche ${index+1}">${[[false,'Je la fais'],[true,'Je ne la fais pas']].map(([skip,label])=>button('solo-skip',label,`data-departure="${departure.id}" data-round="${index}" data-value="${skip?1:0}" aria-pressed="${!!choice.skip===skip}"`,`secondary-button ${!!choice.skip===skip?'active':''}`)).join('')}</div>`:'';
    const heading=rounds.length>1?`<p class="solo-round-heading">Manche ${index+1} · ${esc(eventCircuitName(event,round.circuit))}${round.durationMinutes?` · ${round.durationMinutes} min`:''}</p>${toggle}`:'';
    if(choice.skip)return pane(n,`${n===1?communityLine(event,departure,stateDraft)+identity:''}${heading}<p class="registration-step-help">${stateDraft.forOther?'Ce pilote ne fait pas':'Tu ne fais pas'} cette manche.</p>`);
    // Random circuit and category: nothing to choose for this round.
    if(!round.categories.length)return pane(n,`${n===1?communityLine(event,departure,stateDraft)+identity:''}${heading}${round.randomCategory?'<p class="registration-step-help">Circuit et catégorie aléatoires : rien à choisir pour cette manche.</p>':''}`);
    // Solo event: the category only, the car does not matter.
    const cars='';
    return pane(n,`${n===1?communityLine(event,departure,stateDraft)+identity:''}${heading}${single?`<p class="solo-single-category">${logo(round.categories[0])}<strong>${esc(round.categories[0])}</strong></p>`:`<div class="category-area"><span class="form-label">Dans quelle catégorie ${stateDraft.forOther?'ce pilote veut-il':'veux-tu'} rouler ?</span><div class="categories registration-category-list">${buttons}</div></div>`}${cars}`);
  };
  const summaryRow=(n,label,value)=>`<button type="button" class="registration-summary-row" data-action="registration-step" data-departure="${departure.id}" data-step="${n}" data-edit="true"><span>${label}</span><strong>${value}</strong><em>Modifier</em></button>`;
  const pilot=stateDraft.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const {confirmed,waiting,capacity}=soloCounts(event,departure);
  const waitNotice=!stateDraft.id&&capacity&&confirmed>=capacity?`<p class="solo-wait-notice">La course est complète : ${stateDraft.forOther?'ce pilote sera':'tu seras'} en liste d’attente (${waiting+1}${waiting===0?'er':'e'}). En cas de désistement, la place revient automatiquement au premier en attente.</p>`:'';
  const summary=`<div class="registration-summary">${pilot?`<div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(pilot)}</strong></div>`:''}${shown.map((index,position)=>summaryRow(position+1,rounds.length>1?`Manche ${index+1}`:'Catégorie',soloChoiceLabel(stateDraft.choices[index],rounds[index]))).join('')}</div>${waitNotice}${stateDraft.id&&!only?`<div class="registration-danger-zone">${button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button')}</div>`:''}`;
  const next=step<total?button('registration-step',stateDraft.returnToSummary?'Revenir au récapitulatif':'Continuer',`data-departure="${departure.id}" data-step="${stateDraft.returnToSummary?total:step+1}"`,'primary-button registration-next'):`<button type="submit" class="save-button registration-next">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'JE PARTICIPE'}</button>`;
  return `<form class="form-section registration-form registration-stepper" data-kind="registration" data-departure="${departure.id}" data-step="${step}" data-last-step="${total}">
<div class="registration-progress" aria-hidden="true">${Array.from({length:total},(_,index)=>`<span class="${index<step?'done':''}"></span>`).join('')}</div>
<p class="registration-step-label">Étape ${step} sur ${total} · ${step===1&&identity?(rounds.length?'Pilote et catégorie':'Pilote'):stepName(step)}</p>
${shown.map(roundPane).join('')}
${pane(total,`${rounds.length?'':communityLine(event,departure,stateDraft)+identity}${summary}`)}
<div class="registration-step-nav">${step>1?button('registration-step','Retour',`data-departure="${departure.id}" data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>
</form>`;
}
if(typeof document!=='undefined')document.addEventListener('change',event=>{
  const field=event.target;
  if(!field?.dataset?.soloRound)return;
  const draft=state.drafts[field.dataset.departure],choice=draft?.choices?.[Number(field.dataset.soloRound)];
  if(!choice)return;
  if(field.dataset.soloField==='carAny'){
    choice.carAny=field.checked;
    field.closest('fieldset')?.querySelectorAll('[data-solo-field="car"]').forEach(input=>{input.disabled=field.checked;if(field.checked)input.checked=false;});
    if(field.checked)choice.cars=[];
  } else choice.cars=[...field.closest('fieldset').querySelectorAll('[data-solo-field="car"]:checked')].map(input=>input.value);
});
export function renderSteppedRegistration(event,departure,stateDraft=draftFor(departure)) {
  if(needsCommunityChoice(event,departure,stateDraft))return renderCommunityStep(departure);
  if(isSolo(event))return renderSoloStepper(event,departure,stateDraft);
  const duration=event.durationHours||6,step=registrationStep(stateDraft);
  const {same,assigned}=registrationContext(event,departure,stateDraft);
  const categoryMode=stateDraft.mode==='category';
  const linkedOther=stateDraft.forOther&&!!(stateDraft.participantUserId||stateDraft.discordLinked);
  const manualOther=stateDraft.forOther&&!linkedOther&&!categoryMode&&!!stateDraft.manualOther; const guestSelf=!stateDraft.forOther&&!state.user;
  const pane=(n,content)=>`<section class="registration-step" data-step="${n}" ${n===step?'':'hidden'}>${content}</section>`;
  const categoryButtons=event.categories.map(category=>{
    const disabled=(assigned&&stateDraft.id&&!categoryMode&&category!==stateDraft.category)||same.some(reg=>reg.id!==stateDraft.id&&reg.category===category);
    const count=departure.availability.filter(reg=>reg.category===category&&reg.status!=='unavailable').length;
    return button('category',`${logo(category)}<span class="registration-category-copy"><strong>${esc(category)}</strong><small>${count} inscrit${count>1?'s':''} sur ce départ</small></span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${disabled?'disabled':''} aria-pressed="${stateDraft.category===category}"`,`category-button ${categories[category]?.css||''} ${stateDraft.category===category?'active':''}`);
  }).join('');
  const identity=identityFields(stateDraft,departure,categoryMode,manualOther,linkedOther,guestSelf,false);
  const summaryRow=(n,label,value)=>`<button type="button" class="registration-summary-row" data-action="registration-step" data-departure="${departure.id}" data-step="${n}" data-edit="true"><span>${label}</span><strong>${value}</strong><em>Modifier</em></button>`;
  const cars=stateDraft.carAny?'Peu importe':(stateDraft.cars||[]).length?esc(stateDraft.cars.join(', ')):'—';
  const pilot=stateDraft.name||(!stateDraft.forOther?state.user?.name:'')||'';
  const next=step<4?button('registration-step',stateDraft.returnToSummary?'Revenir au récapitulatif':'Continuer',`data-departure="${departure.id}" data-step="${stateDraft.returnToSummary?4:step+1}"`,'primary-button registration-next'):`<button type="submit" class="save-button registration-next">${stateDraft.id?'ENREGISTRER':stateDraft.forOther?'INSCRIRE LE PILOTE':'VALIDER MON INSCRIPTION'}</button>`;
  return `<form class="form-section registration-form registration-stepper" data-kind="registration" data-departure="${departure.id}" data-step="${step}">
<div class="registration-progress" aria-hidden="true">${REGISTRATION_STEPS.map((_,index)=>`<span class="${index<step?'done':''}"></span>`).join('')}</div>
<p class="registration-step-label">Étape ${step} sur 4 · ${step===1&&identity?'Pilote et catégorie':REGISTRATION_STEPS[step-1]}</p>
${pane(1,`${communityLine(event,departure,stateDraft)}${identity}<div class="category-area"><span class="form-label">Dans quelle catégorie ${stateDraft.forOther?'ce pilote veut-il':'veux-tu'} rouler ?</span><div class="categories registration-category-list">${categoryButtons}</div>${categoryMode?'':'<p class="registration-step-help">Tu pourras ajouter une autre catégorie ensuite : les organisateurs choisiront au moment de former les équipages.</p>'}</div>`)}
${pane(2,stateDraft.category?carPreferenceChoices(stateDraft.category,stateDraft.cars,stateDraft.carAny):'<p class="registration-step-help">Choisis d’abord une catégorie.</p>')}
${pane(3,`<div class="registration-choices"><span class="form-label">Heures de présence (${durationLabel(eventMinutes(event))})</span><p class="availability-hint">Touche les heures où tu seras là.</p>${renderAvailabilityTimeline({departure,duration,status:stateDraft.status,interactive:true,label:'Heures de présence'})}<div class="special-availability">${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${stateDraft.status==='whole'}"`,`special-button whole ${stateDraft.status==='whole'&&!stateDraft.soloDriver?'active':''}`)}${button('solo-driver','JE LA FAIS TOUT SEUL',`data-departure="${departure.id}" aria-pressed="${!!stateDraft.soloDriver}"`,`special-button solo-driver ${stateDraft.soloDriver?'active':''}`)}</div><p class="registration-step-help">${esc(hoursSummary(stateDraft.status,departure,duration))}${stateDraft.soloDriver?'<span class="solo-driver-tag">en solo</span>':''}</p>${soloDriverNotice(event,stateDraft)}</div>`)}
${pane(4,`<div class="registration-summary">${pilot?`<div class="registration-summary-row is-static"><span>Pilote</span><strong>${esc(pilot)}</strong></div>`:''}${summaryRow(1,'Catégorie',stateDraft.category?`${logo(stateDraft.category)} ${esc(stateDraft.category)}`:'—')}${summaryRow(2,'Voiture(s)',cars)}${summaryRow(3,'Présence',esc(hoursSummary(stateDraft.status,departure,duration))+(stateDraft.soloDriver?'<span class="solo-driver-tag">en solo</span>':''))}</div>${soloDriverNotice(event,stateDraft)}${preferredPilotField(stateDraft,departure)}${stateDraft.id?`<div class="registration-danger-zone">${button('delete-registration',stateDraft.forOther?'Supprimer l’inscription':'Se désinscrire',`data-id="${stateDraft.id}" data-departure="${departure.id}"`,'danger-button')}</div>`:''}`)}
<div class="registration-step-nav">${step>1?button('registration-step','Retour',`data-departure="${departure.id}" data-step="${step-1}"`,'secondary-button registration-back'):''}${next}</div>
</form>`;
}

function registrationTitle(event,departure,stateDraft){
  const {source}=registrationContext(event,departure,stateDraft);
  const contextName=stateDraft.name||source?.name||(!stateDraft.forOther?state.user?.name:'')||'';
  if(stateDraft.mode==='category')return `Ajouter une catégorie · ${esc(contextName||'Pilote')}`;
  if(stateDraft.forOther)return stateDraft.id?`Modifier l’inscription · ${esc(contextName||'Pilote')}`:'Inscrire un autre pilote';
  return stateDraft.id?'Modifier ton inscription':'Ton inscription';
}

export function renderRegistrationWorkspace(event,departure) {
  const stateDraft=draftFor(departure);
  const addCategory=renderAddCategoryAction(event,departure,stateDraft);
  const when=`${esc(event.name)} · ${esc(shortDateLabel(departure.startsAt))} · ${esc(timeLabel(departure.time))}`;
  return `<div class="registration-sheet" role="dialog" aria-modal="true" aria-labelledby="registration-title-${departure.id}"><div class="registration-workspace-head"><div class="registration-workspace-title"><h2 id="registration-title-${departure.id}" tabindex="-1">${registrationTitle(event,departure,stateDraft)}</h2><p>${when}</p></div><span class="registration-workspace-actions">${addCategory}${button('close-registration','Fermer',`data-departure="${departure.id}" aria-label="Fermer l’inscription"`,'secondary-button registration-close-button')}</span></div>${renderSteppedRegistration(event,departure,stateDraft)}</div>`;
}

export function rerenderRegistrationSection(event,departure,focusSelector='',fallback=()=>{}) {
  const section=document.getElementById('departure-'+departure.id)?.querySelector('.fold-registration');
  if(!section){fallback();return;}
  const x=window.scrollX,y=window.scrollY;
  const timelineOffsets=[...section.querySelectorAll('.presence-timeline')].map(timeline=>timeline.scrollLeft);
  section.innerHTML=renderRegistrationWorkspace(event,departure);
  const restoreTimelineOffsets=()=>section.querySelectorAll('.presence-timeline').forEach((timeline,index)=>{const offset=timelineOffsets[index];if(Number.isFinite(offset))timeline.scrollLeft=offset;});
  restoreTimelineOffsets();
  if(focusSelector)section.querySelector(focusSelector)?.focus({preventScroll:true});
  restoreTimelineOffsets();
  window.scrollTo(x,y);
  notifyRender();
  requestAnimationFrame(restoreTimelineOffsets);
}

if(typeof document!=='undefined')document.addEventListener('change',event=>{
  const field=event.target;
  if(field?.name!=='participant'||!field.dataset?.departure)return;
  const draft=state.drafts[field.dataset.departure];
  if(draft)draft.manualOther=field.value==='__manual__';
},true);

// A new own entry made with another of the player's communities (official race).
const entryCommunity=draft=>!draft.id&&!draft.forOther&&draft.communityId&&draft.communityId!==state.community?.id?{communityId:draft.communityId}:{};
export async function submitRegistration(form,api) {
  const departureId=form.dataset.departure; const event=state.events.find(item=>item.id===state.currentEventId); const departure=event.departures.find(item=>item.id===departureId); const draft=draftFor(departure);
  if(draft.forOther&&!draft.id&&!draft.participantUserId&&!draft.manualOther)throw Error('Choisis un pilote.');
  draft.name=form.elements.pilotName?.value.trim()||draft.name||(!draft.forOther?state.user?.name?.slice(0,32):'');
  if(!draft.name)throw Error(draft.forOther?'Indique le pseudo du pilote.':'Ton compte Discord ne contient pas de nom utilisable.');
  if(draft.soloEvent){
    // Solo race: one category / car choice per round.
    if(draft.choices.length&&draft.choices.every(choice=>choice.skip))throw Error('Choisis au moins une manche.');
    const payload={name:draft.name,choices:draft.choices.map(choice=>choice.skip?{skip:true}:({category:choice.category,cars:[],carAny:true})),version:draft.version,participantId:draft.participantId,participantUserId:draft.participantUserId,forOther:!!draft.forOther,...entryCommunity(draft)};
    const result=await api(draft.id?`/api/registrations/${draft.id}`:`/api/races/${event.id}/departures/${departure.id}/registrations`,draft.id?'PATCH':'POST',payload);
    if(!draft.forOther){state.pilotName=draft.name;try{localStorage.setItem('em_pilot_name',state.pilotName);}catch{}}
    delete state.drafts[departureId]; state.registrationOpen.delete(departureId); return result;
  }
  if(!draft.status)throw Error('Choisis ta disponibilité.'); if(draft.status!=='unavailable'&&!draft.category)throw Error('Choisis ta catégorie.');
  draft.cars=[...form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value); draft.carAny=!!form.elements.carAny?.checked;
  if(draft.status!=='unavailable'&&!draft.carAny&&!draft.cars.length)throw Error('Choisis au moins une voiture, ou coche « Peu importe la voiture ».');
  const payload={name:draft.name,status:draft.status,category:draft.category,cars:draft.cars,carAny:draft.carAny,preferredPilot:draft.preferredPilot||'',soloDriver:!!draft.soloDriver,version:draft.version,participantId:draft.participantId,participantUserId:draft.participantUserId,forOther:!!draft.forOther,...entryCommunity(draft)};
  const result=await api(draft.id?`/api/registrations/${draft.id}`:`/api/races/${event.id}/departures/${departure.id}/registrations`,draft.id?'PATCH':'POST',payload);
  if(!draft.forOther){state.pilotName=draft.name;try{localStorage.setItem('em_pilot_name',state.pilotName);}catch{}}
  delete state.drafts[departureId]; state.registrationOpen.delete(departureId); return result;
}

// An event in several rounds: entering one round, or leaving it. A round with nothing to choose is done in one
// click; one with categories opens the registration on that round (the others kept as they are, or skipped).
function choicesOf(event,reg){
  const rounds=soloRounds(event);
  return rounds.map((round,index)=>{
    const saved=reg?.roundChoices?.[index];
    if(!reg||saved?.skip)return {skip:true};
    if(!round.categories.length||!saved?.category)return {category:ANY_CATEGORY,cars:[],carAny:true};
    return {category:saved.category,cars:saved.cars||[],carAny:!!saved.carAny};
  });
}
export async function enterRound(event,departure,index,api){
  const rounds=soloRounds(event),own=ownRegistration(departure),choices=choicesOf(event,own);
  state.roundFocus={...(state.roundFocus||{}),[departure.id]:index};
  if(rounds[index].categories.length<2&&!(event.official&&!own&&entryCommunities().length>1)){
    choices[index]={category:rounds[index].categories[0]||ANY_CATEGORY,cars:[],carAny:true};
    const body={name:own?.name||state.user.name.slice(0,32),choices,forOther:false,...(own?{version:own.version}:{})};
    await api(own?`/api/registrations/${own.id}`:`/api/races/${event.id}/departures/${departure.id}/registrations`,own?'PATCH':'POST',body);
    return true;
  }
  // Categories to choose: the registration opens on this round.
  const draft=own?registrationDraft(own):{name:'',status:'',preferredPilot:'',forOther:false,participantUserId:null,category:'',cars:[],carAny:false,id:null,version:null};
  choices[index]={category:rounds[index].categories.length===1?rounds[index].categories[0]:'',cars:[],carAny:true};
  state.drafts[departure.id]={...draft,choices,step:1,onlyRound:index};
  state.registrationOpen.add(departure.id);
  return false;
}
export function editRound(event,departure,index){
  const own=ownRegistration(departure);
  state.roundFocus={...(state.roundFocus||{}),[departure.id]:index};
  state.drafts[departure.id]={...registrationDraft(own),choices:choicesOf(event,own),step:1,onlyRound:index};
  state.registrationOpen.add(departure.id);
}
// « Absent » on a round the pilot does: he leaves it; on his only round, he leaves the event.
export async function skipRound(event,departure,index,api){
  const own=ownRegistration(departure),choices=choicesOf(event,own);
  choices[index]={skip:true};
  if(choices.every(choice=>choice.skip)){
    if(!confirm('Te désinscrire de cette manche ? C’était ta seule manche de l’événement.'))return false;
    await api(`/api/registrations/${own.id}`,'DELETE',{version:own.version});
    return true;
  }
  await api(`/api/registrations/${own.id}`,'PATCH',{name:own.name,version:own.version,choices,forOther:false});
  return true;
}
