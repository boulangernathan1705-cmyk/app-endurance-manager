import {CATEGORIES, EVENT_TYPES, CIRCUITS, categories, CARS} from './shared/catalog.mjs';
import {countdown, dateLabel, groupEvents} from './front/schedule.mjs';
const app = document.getElementById('app');
const nav = document.getElementById('navigation');
let events=[], user=null, discordReady=false, currentEventId=null, page='home', editingEvent=null;
let drafts={}, recoveryLink='', busy=false, members=[], participants=[], flash='', eventFilter='upcoming';
let selectedDepartureId=null, eventSection='race', crewDraft=null;
let pilotName='';
try { pilotName = localStorage.getItem('fmt_pilot_name') || ''; } catch {}
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canManage = () => ['admin','organizer'].includes(user?.role);
const isAdmin = () => user?.role === 'admin';
const roleLabel = role => ({admin:'Administrateur',organizer:'Organisateur',pilot:'Pilote'}[role] || 'Pilote');
function logo(category) {
  const config=categories[category];
  return config?.image ? `<img class="category-logo" src="/images/${config.image}" alt="">` : `<span class="category-text-logo" aria-hidden="true">${esc(category)}</span>`;
}
function badge(category) { return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span>${esc(category)}</span></span>`; }
function eventCategoryCount(event,category) {
  return event.departures.reduce((total,departure)=>total+departure.availability.filter(reg=>reg.category===category&&reg.status!=='unavailable').length,0);
}
function pilotCount(registrations) { return new Set(registrations.filter(r=>r.status!=='unavailable').map(r=>r.participantId||r.id)).size; }
function eventBadge(category,count) {
  return `<span class="event-category-badge ${categories[category]?.css || ''}">${logo(category)}<span class="event-category-copy"><strong>${esc(category)}</strong><small>${count} inscrit${count>1?'s':''}</small></span></span>`;
}
function eventTypeBadge(type) { const item=EVENT_TYPES[type]||EVENT_TYPES.private; return `<span class="event-type-badge ${item.css}">${item.label}</span>`; }
function circuitInfo(id) { return CIRCUITS.find(c=>c.id===id) || null; }
function circuitLabel(id) { return circuitInfo(id)?.name || 'Circuit à préciser'; }
function circuitVisual(id, compact=false) { const circuit=circuitInfo(id); if(!circuit)return ''; return `<span class="circuit-visual ${compact?'compact':''}"><img data-circuit="${circuit.id}" src="/images/circuits/${circuit.file}" alt="Plan du ${esc(circuit.name)}" loading="lazy"></span>`; }
function button(action,label,extra='',css='secondary-button') { return `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`; }
function carPreferenceChoices(category, selected=[], any=false) {
  const values = Array.isArray(selected) ? selected : (selected ? [selected] : []);
  return `<fieldset class="car-preference-panel"><legend class="form-label">Voiture(s) souhaitée(s)</legend><label class="car-any-option"><input type="checkbox" name="carAny" ${any?'checked':''}><span>Peu importe la voiture</span></label><div class="car-preference-grid">${(CARS[category]||[]).map(car=>`<label class="car-preference-option"><input type="checkbox" name="carPreference" value="${esc(car)}" ${values.includes(car)&&!any?'checked':''} ${any?'disabled':''}><span>${esc(car)}</span></label>`).join('')}</div><p class="car-preference-help">Choisis un ou plusieurs modèles, ou coche « Peu importe la voiture ». Ces souhaits aident les organisateurs à former les équipages.</p></fieldset>`;
}
function registrationCarLabel(reg) { return reg.carAny ? 'N’importe quelle voiture' : ((reg.cars?.length ? reg.cars.join(' · ') : reg.car) || 'Pas de préférence'); }
function pilotAvailability(reg,departure,duration) {
  if(!departure)return '';
  const parts=new Set(String(reg.status||'').split(',').filter(x=>/^h\d+$/.test(x)));
  return `<div class="crew-pilot-availability"><span class="crew-pilot-availability-label">Disponibilité</span><div class="crew-pilot-hours duration-${duration}">${Array.from({length:duration},(_,i)=>{const present=reg.status==='whole'||parts.has(`h${i+1}`);return `<span class="crew-pilot-hour ${phaseClass(i,duration)} ${present?'present':''}" title="${raceHourLabel(departure,i)} · ${present?'Disponible':'Absent'}">${raceHourLabel(departure,i)}</span>`;}).join('')}</div></div>`;
}
function pilotWishes(reg,departure=null,duration=0) {
  return `<dl class="pilot-wishes"><div><dt>Voiture(s) souhaitée(s)</dt><dd>${esc(registrationCarLabel(reg))}</dd></div><div><dt>Coéquipier souhaité</dt><dd>${esc(reg.preferredPilot || 'Aucune préférence renseignée')}</dd></div></dl>${departure&&duration?pilotAvailability(reg,departure,duration):''}`;
}
function updateAssignmentPreview(select) {
  const event=events.find(e=>e.id===currentEventId);
  const departure=event?.departures.find(d=>d.id===select.dataset.departure);
  const reg=departure?.availability.find(r=>r.id===select.value);
  const preview=document.getElementById(select.getAttribute('aria-controls'));
  const removed=reg?departure.availability.filter(r=>r.id!==reg.id&&r.participantId&&r.participantId===reg.participantId):[];
  if(preview) preview.innerHTML=reg?`<strong>${esc(reg.name)}</strong>${pilotWishes(reg,departure,event?.durationHours||6)}<p class="assignment-effect">Affectation en <strong>${esc(reg.category)}</strong>. ${removed.length?`Les autres inscriptions de ce pilote sur ce départ seront retirées : ${removed.map(r=>esc(r.category||'Indisponible')).join(', ')}.`:'Aucune autre inscription à retirer sur ce départ.'}</p>`:'Sélectionne un pilote pour voir ses souhaits et ses disponibilités avant de l’ajouter.';
}
function crewColorClass(crewId, index=null) { if(index!=null) return `crew-palette-${index%10}`; let hash=0; for(const char of String(crewId||'')) hash=(hash*31+char.charCodeAt(0))>>>0; return `crew-palette-${hash%10}`; }
function errorBox() { return '<p id="error" class="creation-error" role="alert" tabindex="-1" hidden></p>'; }
function showError(error) {
  let box=document.getElementById('error');
  if (!box) { app.insertAdjacentHTML('afterbegin',errorBox()); box=document.getElementById('error'); }
  box.textContent=error.message || String(error); box.hidden=false; box.focus();
}
async function api(path,method='GET',data) {
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(data || {})});
  let result;
  try { result=await response.json(); } catch { throw Error('Le service partagé ne répond pas. Vérifie que la nouvelle configuration du site est terminée.'); }
  if (!response.ok) throw Error(result.error || 'Cette action a échoué.');
  return result;
}
async function load() {
  const [session,result]=await Promise.all([api('/api/session'),api('/api/events')]);
  user=session.user;discordReady=session.discordReady;events=result.events;
  participants=canManage()?(await api('/api/participants')).participants:[];
  if (user && !pilotName) pilotName=user.name.slice(0,30);
  renderNav();
}
function renderNav() {
  nav.innerHTML=`${button('home','Événements')}
    ${canManage()?button('create','+ Événement','','primary-button'):''}
    ${isAdmin()?button('members','Gestion des membres'):''}
    ${user?`<span class="account-name">${esc(user.name)} <small>${roleLabel(user.role)}</small></span>${button('logout','Déconnexion')}`:
      discordReady?'<a class="discord-button" href="/api/auth/discord">Se connecter avec Discord</a>':'<span class="account-name">Connexion Discord à configurer</span>'}`;
}
function renderEventCard({event,next,running,archived,end}) {
  const untilNext=next?next.startsAt-Date.now():Infinity;
  const statusClass=archived?'finished':running?'running':next&&untilNext<=3600000?'soon':'upcoming';
  return `<button class="event-card event-type-${event.eventType||'private'} ${archived?'archived':''}" data-action="open" data-id="${event.id}">
    <span class="event-card-body"><span class="event-card-title-row"><span class="event-name">${esc(event.name)}</span><span class="event-info">${eventTypeBadge(event.eventType)} <span>· ${event.durationHours||6} h · ${event.departures.length} départ${event.departures.length>1?'s':''}</span></span></span>
    ${circuitVisual(event.circuit,true)}
    <span class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</span>
    <span class="event-card-status">${running?'<span class="event-countdown event-countdown-primary running">COURSE EN COURS</span>':''}
    <span class="event-countdown ${statusClass}" ${next&&!archived?`data-status-time="${next.startsAt}"`:''}>${next?`Prochain départ : ${esc(dateLabel(next))} à ${esc(next.time)} · <span data-countdown="${next.startsAt}">${countdown(next.startsAt)}</span>`:archived?`Terminé le ${esc(dateLabel({startsAt:end}))}`:running?'':'Dates à confirmer'}</span></span></span>
  </button>`;
}
function renderHome(message='') {
  page='home';currentEventId=null;editingEvent=null;drafts={};
  const groups=groupEvents(events,eventFilter);
  app.innerHTML=`<h1 class="page-title">ÉVÉNEMENTS</h1>
    <p class="page-subtitle">Gestion des courses d’endurance · Horaires de Paris</p>
    ${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${errorBox()}
    <div class="toolbar">${button('refresh','Actualiser')}${button('my-entries','Mes inscriptions')}${!user?button('guest-link','Mon lien personnel'):''}</div>
    <div class="event-filter" role="group" aria-label="Filtrer les événements">${button('event-filter','À venir',`data-filter="upcoming" aria-pressed="${eventFilter==='upcoming'}"`,'event-filter-button')}${button('event-filter','Archivés',`data-filter="archived" aria-pressed="${eventFilter==='archived'}"`,'event-filter-button')}</div>
    ${groups.length?`<div class="event-agenda">${groups.map(group=>`<section class="event-period" aria-labelledby="period-${group.key}"><h2 class="event-period-heading" id="period-${group.key}"><span>${esc(group.label)}</span><small>${group.items.length} événement${group.items.length>1?'s':''}</small></h2><div class="event-list">${group.items.map(renderEventCard).join('')}</div></section>`).join('')}</div>`:`<div class="empty">${eventFilter==='upcoming'?'Aucun événement à venir.':'Aucun événement archivé.'}</div>`}`;
  showRecoveryLink();
}
function showRecoveryLink() {
  if (!recoveryLink) return;
  app.insertAdjacentHTML('afterbegin',`<section class="recovery-panel"><label for="personalLink">Ton lien personnel pour retrouver et modifier tes inscriptions sans compte</label><input id="personalLink" readonly value="${esc(recoveryLink)}"><p>Conserve ce lien et garde-le privé.</p>${button('copy-link','Copier le lien')}${button('hide-link','Masquer')}</section>`);
}
function ownRegistrations(departure) { return departure.availability.filter(r=>r.mine); }
function ownRegistration(departure) { return ownRegistrations(departure)[0]; }
function registrationDraft(reg) {
  return {name:reg.name,category:reg.category,cars:reg.cars||[],carAny:!!reg.carAny,status:reg.status,preferredPilot:reg.preferredPilot||'',id:reg.id,version:reg.version,participantId:reg.participantId,mine:reg.mine,forOther:!reg.mine};
}
function draftFor(departure) {
  if (!drafts[departure.id]) {
    const mine=ownRegistration(departure);
    drafts[departure.id]=mine?registrationDraft(mine):{name:user?.name?.slice(0,30)||pilotName,category:'',cars:[],carAny:false,status:'',preferredPilot:'',id:null,version:null,forOther:false};
  }
  return drafts[departure.id];
}
function statusLabel(status) {
  if(status==='whole')return 'Toute la course';if(status==='unavailable')return 'Indisponible';
  return status.split(',').map(x=>/^h\d+$/.test(x)?`Heure ${x.slice(1)}`:({beginning:'Début',middle:'Milieu',end:'Fin'}[x]||'')).filter(Boolean).join(' · ');
}
function registrationSlotLabel(status,departure,duration) {
  if(status==='whole')return 'Toute la course'; if(status==='unavailable')return 'Indisponible';
  return status.split(',').filter(x=>/^h\d+$/.test(x)).map(x=>`Heure ${x.slice(1)}`).join(' · ') || statusLabel(status);
}
function phaseColor(index,duration) {
  const ratio=duration>1?index/(duration-1):0;
  return `hsl(${Math.round(145-141*ratio)} 72% 48%)`;
}
function phaseClass(index,duration) { return `phase-${duration>1?Math.round(index*23/(duration-1)):0}`; }
const raceTimeFormatter=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
function raceHourLabel(departure,index) {
  const label=raceTimeFormatter.format(new Date(departure.startsAt+index*3600000)).replace(':','h');
  return label.endsWith('h00')?label.slice(0,-2):label;
}
function renderRegistration(reg,departure,duration,showCarPreference=true) {
  const locked=departure.startsAt<=Date.now();
  const parts=new Set(reg.status.split(',').filter(x=>/^h\d+$/.test(x))),hours=Array.from({length:duration},(_,i)=>`h${i+1}`);
  const presentCount=reg.status==='whole'?duration:parts.size;
  const timeline=`<div class="availability-readonly" aria-label="${esc(registrationSlotLabel(reg.status,departure,duration))}"><span class="timeline-edge">DÉPART</span><div class="availability-mini-grid duration-${duration}">${hours.map((hour,i)=>`<span class="availability-mini-hour ${phaseClass(i,duration)} ${reg.status==='whole'||parts.has(hour)?'present':''}" title="${raceHourLabel(departure,i)}">${raceHourLabel(departure,i)}</span>`).join('')}</div><span class="timeline-edge">ARRIVÉE</span></div>`;
  return `<div class="pilot-row"><div class="pilot-main"><span class="pilot-name">${esc(reg.name)}${reg.mine?' <small>(toi)</small>':reg.managed?' <small>(inscription gérée par toi)</small>':''}</span>
    <span class="pilot-category-logo">${reg.category?logo(reg.category):'—'}</span>${showCarPreference?`<span class="pilot-car">${esc(registrationCarLabel(reg))}</span>`:''}<span class="registration-status">${reg.status==='unavailable'?'Indisponible':`${presentCount} h disponible${presentCount>1?'s':''}`}</span>${reg.preferredPilot?`<span class="pilot-preference">Souhaite rouler avec : <strong>${esc(reg.preferredPilot)}</strong></span>`:''}</div>${timeline}
    ${reg.canEdit&&!locked?button('edit-registration','Modifier',`data-id="${reg.id}" data-departure="${departure.id}"`,'edit-button'):''}</div>`;
}
function renderRegistrationForm(event,departure) {
  const state=draftFor(departure),duration=event.durationHours||6,parts=state.status==='whole'?Array.from({length:duration},(_,i)=>`h${i+1}`):state.status.split(',').filter(Boolean);
  const selected=departure.availability.find(r=>r.id===state.id),same=departure.availability.filter(r=>state.participantId&&r.participantId===state.participantId);
  const assigned=(departure.crews||[]).some(c=>c.registrationIds.some(id=>same.some(r=>r.id===id)));
  const source=selected||same[0]||(!state.forOther?ownRegistrations(departure)[0]:null);
  const canAdd=source&&!assigned&&event.categories.some(c=>!same.some(r=>r.category===c));
  const addButtons=`${button('my-registration','Mon inscription',`data-departure="${departure.id}"`,'secondary-button add-pilot-button')}${canManage()?button('new-registration','+ Inscrire un pilote',`data-departure="${departure.id}" data-mode="pilot"`,'secondary-button add-pilot-button'):''}${canAdd?button('new-registration','+ Ajouter une catégorie',`data-departure="${departure.id}" data-mode="category" data-registration="${source.id}"`,'secondary-button add-pilot-button'):''}`;
  const formTitle=state.id?`Modifier l’inscription de ${esc(state.name)}`:state.mode==='category'?'Ajouter une catégorie':state.forOther?'Inscrire un pilote':'Mon inscription';
  return `<form class="form-section registration-form" data-kind="registration" data-departure="${departure.id}">
    <h3 class="form-title">${formTitle}<span class="registration-form-actions">${addButtons}</span></h3>
    ${selected&&!selected.mine?'<p class="creation-help">Tu gères cette inscription pour un autre pilote.</p>':''}
    ${!state.id&&state.forOther&&canManage()?`<label class="form-label" for="participant-${departure.id}">Pilote déjà inscrit</label><select id="participant-${departure.id}" name="participant" data-departure="${departure.id}"><option value="">Créer une nouvelle fiche pilote</option>${participants.map(p=>`<option value="${esc(p.id)}" ${state.participantId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><p class="creation-help">Choisis la fiche existante pour garder ensemble ses catégories, même si un autre organisateur l’a inscrit.</p>`:''}
    ${assigned?'<p class="assignment-effect">Ce pilote est affecté à un équipage. Sa catégorie est fixée ; ses heures et ses préférences restent modifiables.</p>':''}
    <label class="form-label" for="name-${departure.id}">Pseudo pilote</label>
    <input id="name-${departure.id}" name="pilotName" data-departure="${departure.id}" value="${esc(state.name)}" maxlength="30" required autocomplete="nickname" ${!state.id&&state.participantId?'readonly':''}>
    <label class="form-label" for="preference-${departure.id}">Pilote souhaité dans le même équipage <span class="muted">(facultatif)</span></label>
    <input id="preference-${departure.id}" name="preferredPilot" data-departure="${departure.id}" value="${esc(state.preferredPilot||'')}" maxlength="30" placeholder="Pseudo du pilote souhaité">
    <div class="registration-choices"><span class="form-label">Heures de présence (${duration} h)</span><p class="availability-hint">Sélectionne les heures de présence. Les cases cochées indiquent les disponibilités ; la couleur suit la progression de la course.</p><div class="availability-hour-grid compact-hours duration-${duration}">${Array.from({length:duration},(_,index)=>{const part=`h${index+1}`,active=parts.includes(part);const hourLabel=raceHourLabel(departure,index);return button('availability',`<span class="hour-card-number">${hourLabel}</span><span class="hour-card-state">${active?'✓':''}</span>`,`data-departure="${departure.id}" data-value="${part}" aria-pressed="${active}" aria-label="${hourLabel} : ${active?'présent':'disponible ?'}" title="${hourLabel} · ${active?'Présent':'Disponible ?'}"`,`hour-card ${phaseClass(index,duration)} ${active?'active':''}`);}).join('')}</div><div class="special-availability">
      ${button('availability','TOUTE LA COURSE',`data-departure="${departure.id}" data-value="whole" aria-pressed="${state.status==='whole'}"`,`special-button whole ${state.status==='whole'?'active':''}`)}
      ${button('availability','INDISPONIBLE',`data-departure="${departure.id}" data-value="unavailable" ${assigned?'disabled':''} aria-pressed="${state.status==='unavailable'}"`,`special-button unavailable ${state.status==='unavailable'?'active':''}`)}
    </div></div>
    ${state.status==='unavailable'?'':`<div class="category-area"><span class="form-label">Catégorie</span><div class="categories">
      ${event.categories.map(category=>button('category',`${logo(category)}<span>${esc(category)}</span>`,`data-departure="${departure.id}" data-value="${esc(category)}" ${(assigned&&category!==state.category)||same.some(r=>r.id!==state.id&&r.category===category)?'disabled':''} aria-pressed="${state.category===category}"`,`category-button ${categories[category]?.css||''} ${state.category===category?'active':''}`)).join('')}
    </div>${state.category?carPreferenceChoices(state.category,state.cars,state.carAny):''}</div>`}
    <div class="save-row"><button type="submit" class="save-button">${state.id?'ENREGISTRER':'S’INSCRIRE'}</button>
      ${state.id?button('delete-registration','Se désinscrire',`data-id="${state.id}" data-departure="${departure.id}"`,'danger-button'):''}</div>
  </form>`;
}
function renderEvent(message='') {
  page='event';
  const event=events.find(e=>e.id===currentEventId);
  if(!event){renderHome('Cet événement n’est plus disponible.');return;}
  if(!canManage()) eventSection='race';
  const nextDeparture=event.departures.find(d=>d.startsAt>Date.now())||event.departures[0];
  const totalPilots=pilotCount(event.departures.flatMap(d=>d.availability));
  const totalCrews=event.departures.reduce((sum,d)=>sum+(d.crews||[]).length,0);
  app.innerHTML=`${button('home','← Retour aux événements','','secondary-button back-button')}
    <div class="event-header event-header-compact event-type-${event.eventType||'private'}">
      <div class="event-heading-line"><div class="event-heading-copy"><h1 class="event-title">${esc(event.name)}</h1><p class="event-subtitle">${eventTypeBadge(event.eventType)} <span>· Horaires de Paris</span></p></div>${circuitVisual(event.circuit)}</div>
      <div class="event-header-summary">
        <div class="event-category-badges">${event.categories.map(category=>eventBadge(category,eventCategoryCount(event,category))).join('')}</div>
        <div class="event-header-stats" aria-label="Récapitulatif de la course"><span><strong>${event.durationHours||6} h</strong><small>durée</small></span><span><strong>${event.departures.length}</strong><small>départ${event.departures.length>1?'s':''}</small></span><span><strong>${totalPilots}</strong><small>pilote${totalPilots>1?'s':''}</small></span><span><strong>${totalCrews}</strong><small>équipage${totalCrews>1?'s':''}</small></span></div>
        <span class="event-header-countdown">${nextDeparture?.startsAt>Date.now()?`Prochain départ <strong data-countdown="${nextDeparture.startsAt}">${countdown(nextDeparture.startsAt)}</strong>`:'Tous les départs ont eu lieu'}</span>
      </div>
    </div>
    <div class="toolbar">${button('refresh','Actualiser')}${canManage()?button('edit-event','Modifier l’événement',`data-id="${event.id}"`):''}${isAdmin()?button('delete-event','Supprimer l’événement',`data-id="${event.id}"`,'danger-button'):''}</div>
    ${message?`<p class="creation-success" role="status">${esc(message)}</p>`:''}${errorBox()}
    ${canManage()?`<nav class="event-section-tabs" aria-label="Sections de l’événement">${button('event-section','Course',`data-section="race" aria-pressed="${eventSection==='race'}"`,'event-section-tab')}${button('event-section','Équipages',`data-section="crews" aria-pressed="${eventSection==='crews'}"`,'event-section-tab')}</nav>`:''}
    ${eventSection==='crews'?renderCrewPage(event,nextDeparture):`<section class="departure-accordion" aria-label="Départs de la course">${event.departures.map((departure,index)=>renderDeparturePanel(event,departure,index,departure.id===nextDeparture?.id||departure.id===selectedDepartureId)).join('')}</section>`}`;
  showRecoveryLink();
}
function renderDeparturePanel(event,departure,index,open=false) {
  const locked=departure.startsAt<=Date.now(),crews=departure.crews||[],available=pilotCount(departure.availability);
  return `<details class="departure-fold" id="departure-${departure.id}" ${open?'open':''}>
    <summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong>${esc(dateLabel(departure))}</strong><span>${departure.time} · ${locked?'Départ passé':'Départ à venir'}</span></span><span class="fold-meta">${available} pilote${available>1?'s':''} · ${crews.length} équipage${crews.length>1?'s':''}</span><span class="fold-countdown" data-countdown="${departure.startsAt}">${countdown(departure.startsAt)}</span></summary>
    <div class="departure-fold-body"><div class="fold-toolbar"><span>${locked?'Les inscriptions sont verrouillées pour ce départ.':'Inscription et organisation du départ'}</span>${button('focus-registration','Aller à mon inscription',`data-departure="${departure.id}"`)}</div>
      ${locked?'<p class="finished-history">Les inscriptions sont verrouillées. Les pilotes et équipages restent consultables.</p>':''}
      <section class="fold-section"><h2>Pilotes inscrits</h2>${renderPilots(event,departure)}</section>
      ${locked?'':`<section class="fold-section fold-registration"><h2>Mon inscription</h2>${renderRegistrationForm(event,departure)}</section>`}
    </div>
  </details>`;
}
function renderCrewPage(event,nextDeparture) {
  return `<section class="departure-accordion crew-page-accordion" aria-label="Gestion des équipages">${event.departures.map((departure,index)=>`<details class="departure-fold" id="crew-departure-${departure.id}" ${departure.id===nextDeparture?.id||departure.id===selectedDepartureId?'open':''}>
    <summary><span class="fold-index">${String(index+1).padStart(2,'0')}</span><span class="fold-date"><strong>${esc(dateLabel(departure))}</strong><span>${departure.time} · ${departure.startsAt<=Date.now()?'Départ passé':'Départ à venir'}</span></span><span class="fold-meta">${(departure.crews||[]).length} équipage${(departure.crews||[]).length>1?'s':''}</span><span class="fold-countdown" data-countdown="${departure.startsAt}">${countdown(departure.startsAt)}</span></summary>
    <div class="departure-fold-body"><section class="fold-section crew-only-section"><h2>Équipages du départ</h2>${renderCrews(event,departure)}</section></div>
  </details>`).join('')}</section>`;
}
function renderPilots(event,departure) {
  return `<div class="pilot-section">
    ${event.categories.map(category=>{const regs=departure.availability.filter(r=>r.category===category&&r.status!=='unavailable'),allCrews=departure.crews||[],crews=allCrews.filter(crew=>crew.category===category),assigned=new Set(crews.flatMap(crew=>crew.registrationIds)),unassigned=regs.filter(reg=>!assigned.has(reg.id));if(!regs.length)return '';return `<div class="category-group"><div class="category-group-header ${categories[category]?.css||''}">${logo(category)}<span>${esc(category)} · ${regs.length}</span></div>${crews.map(crew=>{const crewRegs=crew.registrationIds.map(id=>regs.find(reg=>reg.id===id)).filter(Boolean);return crewRegs.length?`<div class="crew-pilot-group ${crewColorClass(crew.id,allCrews.indexOf(crew))}"><div class="crew-pilot-group-header"><strong>${esc(crew.name)}</strong><span>${esc(crew.car||'Voiture à choisir')}</span></div>${crewRegs.map(reg=>renderRegistration(reg,departure,event.durationHours||6,false)).join('')}</div>`:'';}).join('')}${unassigned.map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}</div>`;}).join('')}
    ${departure.availability.filter(r=>r.status==='unavailable').map(reg=>renderRegistration(reg,departure,event.durationHours||6)).join('')}
    ${!departure.availability.length?'<p class="no-pilots">Aucun pilote inscrit sur ce départ.</p>':''}</div>`;
}
function coversHour(reg,index) { return reg.status==='whole'||reg.status.split(',').includes(`h${index+1}`); }
function renderCrewForm(event) {
  const draft=crewDraft;
  const departure=event.departures.find(d=>d.id===draft.departureId);
  const preferences=(departure?.availability||[]).filter(r=>r.status!=='unavailable'&&r.category===draft.category);
  const preferenceList=preferences.length?`<ul class="crew-preference-list">${preferences.map(r=>`<li class="crew-preference-item"><strong>${esc(r.name)}</strong>${pilotWishes(r,departure,event.durationHours||6)}</li>`).join('')}</ul>`:'<p class="muted">Aucun pilote inscrit dans cette catégorie pour ce départ.</p>';
  return `<form class="crew-form" data-kind="crew" data-departure="${esc(draft.departureId||selectedDepartureId||'')}"><h3>${draft.id?'Modifier l’équipage':'Nouvel équipage'}</h3>
    <label>Nom de l’équipage<input name="crewName" maxlength="60" required value="${esc(draft.name)}" placeholder="Ex. FMT Racing 1"></label>
    <label>Catégorie<select name="crewCategory">${event.categories.map(c=>`<option ${draft.category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>
    <label>Voiture de l’équipage<select name="crewCar"><option value="">Voiture à définir</option>${(CARS[draft.category]||[]).map(car=>`<option value="${esc(car)}" ${draft.car===car?'selected':''}>${esc(car)}</option>`).join('')}</select></label>
    <div class="crew-preferences"><strong>Préférences des pilotes à affecter</strong>${preferenceList}</div>
    <p class="creation-help">Choisis le modèle retenu pour l’équipage. Les préférences affichées viennent des pilotes inscrits.</p>
    <div class="toolbar"><button type="submit" class="primary-button">Enregistrer l’équipage</button>${button('cancel-crew','Annuler')}</div></form>`;
}
function renderCrews(event,departure) {
  const crews=departure.crews||[],manage=canManage()&&departure.startsAt>Date.now(),duration=event.durationHours||6;
  const assigned=new Set(crews.flatMap(c=>c.registrationIds));
  const unassigned=departure.availability.filter(r=>!assigned.has(r.id)&&r.status!=='unavailable');
  return `<div class="crew-section"><div class="crew-heading"><div><h2>Équipages</h2><p>Composition définie par les organisateurs. Chaque équipage est identifié par son nom et sa couleur.</p></div>${manage&&!crewDraft?button('new-crew','+ Créer un équipage',`data-departure="${departure.id}"`,'primary-button'):''}</div>
    ${manage&&crewDraft?.departureId===departure.id?renderCrewForm(event):''}
    ${crews.length?`<div class="crew-list">${crews.map((crew,crewIndex)=>{
      const regs=crew.registrationIds.map(id=>departure.availability.find(r=>r.id===id)).filter(Boolean);
      const counts=Array.from({length:duration},(_,i)=>regs.filter(r=>coversHour(r,i)).length);
      const candidates=unassigned.filter(r=>r.category===crew.category);
      const covered=counts.filter(n=>n>0).length;
      return `<article class="crew-card crew-category-${categories[crew.category]?.css||''} ${crewColorClass(crew.id,crewIndex)}" data-crew="${crew.id}"><div class="crew-card-header"><div>${badge(crew.category)}<h3>${esc(crew.name)}</h3><p class="crew-car">${esc(crew.car||'Voiture à choisir')}</p></div><span class="coverage-summary">${regs.length} pilote(s) · ${covered}/${duration} h</span></div>
        <ul class="crew-roster">${regs.map(r=>`<li><div><strong class="crew-pilot-name">${esc(r.name)}</strong><small>${esc(registrationCarLabel(r))} · ${esc(statusLabel(r.status))}${r.preferredPilot?` · souhaite ${esc(r.preferredPilot)}`:''}</small></div>${manage?button('remove-crew-pilot','Retirer',`data-id="${crew.id}" data-departure="${departure.id}" data-registration="${r.id}" aria-label="Retirer ${esc(r.name)} de cet équipage"`):''}</li>`).join('')||'<li>Aucun pilote affecté.</li>'}</ul>
        <div class="crew-availability-line duration-${duration}" aria-label="Disponibilité de l’équipage">${counts.map((n,i)=>`<span class="crew-availability-hour ${phaseClass(i,duration)} ${n?'covered':'gap'}" title="${raceHourLabel(departure,i)} : ${n?`${n} pilote(s)`:'aucun pilote'}">${raceHourLabel(departure,i)}</span>`).join('')}</div>
        <p class="coverage-note">${covered===duration?'Toutes les heures sont couvertes.':`${duration-covered} heure(s) sans présence.`}</p>
        ${regs.some(r=>/beginning|middle|end/.test(r.status))?'<p class="coverage-note">Certaines disponibilités anciennes doivent être précisées heure par heure ; elles ne sont pas comptées dans la couverture.</p>':''}
        ${manage?`<div class="crew-assignment"><label for="assign-${crew.id}">Ajouter un pilote inscrit · ${esc(crew.category)}</label><div><select id="assign-${crew.id}" data-assignment-preview data-departure="${departure.id}" aria-controls="wishes-${crew.id}" ${!candidates.length?'disabled':''}><option value="">${candidates.length?'Choisir un pilote':'Aucun pilote à affecter dans cette catégorie'}</option>${candidates.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>${button('add-crew-pilot','Ajouter',`data-id="${crew.id}" data-departure="${departure.id}" ${!candidates.length?'disabled':''}`)}</div>${candidates.length?`<section id="wishes-${crew.id}" class="assignment-wishes" aria-live="polite">Sélectionne un pilote pour voir ses souhaits avant de l’ajouter.</section>`:''}</div><div class="crew-actions">${button('edit-crew','Modifier',`data-id="${crew.id}" data-departure="${departure.id}"`)}${button('delete-crew','Supprimer',`data-id="${crew.id}" data-departure="${departure.id}"`,'danger-button')}</div>`:''}</article>`;
    }).join('')}</div>`:'<div class="empty">Aucun équipage créé sur ce départ pour le moment.</div>'}
    ${manage?`<details class="unassigned-list"><summary>${pilotCount(unassigned)} pilote(s) restant à affecter · ${unassigned.length} choix de catégorie</summary><ul class="unassigned-pilots">${unassigned.map(r=>`<li><strong>${esc(r.name)}</strong> <span class="muted">· ${esc(r.category)}</span>${pilotWishes(r,departure,duration)}</li>`).join('')||'<li>Tous les pilotes inscrits disponibles sont affectés.</li>'}</ul></details>`:''}</div>`;
}
function departureFields(departure={}) {
  const fieldId=crypto.randomUUID();
  return `<div class="departure-field" data-id="${esc(departure.id||'')}"><div><label class="form-label" for="date-${fieldId}">Date</label><input id="date-${fieldId}" name="date" type="date" value="${esc(departure.date||'')}" required></div>
    <div><label class="form-label" for="time-${fieldId}">Heure (Paris)</label><input id="time-${fieldId}" name="time" type="time" value="${esc(departure.time||'')}" required></div>
    ${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}
function renderEventForm(event=null) {
  if(!canManage())throw Error('Connecte-toi avec un compte autorisé.');
  page='form';editingEvent=event?structuredClone(event):null;
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}
    <h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1>
    <form class="form-panel event-creation" data-kind="event">
      <div class="creation-intro"><span class="creation-kicker">${event?'ÉDITION':'CONFIGURATION'} DE LA COURSE</span><h2>${event?'Mettre à jour la course':'Préparer une nouvelle course'}</h2><p>Renseigne les informations essentielles, puis ajoute les départs et les catégories ouvertes aux pilotes.</p></div>
      <section class="creation-card creation-basics"><div class="creation-card-heading"><span class="creation-step">01</span><div><h2>Informations générales</h2><p>Le nom, le format et le circuit apparaîtront dans le récapitulatif.</p></div></div>
        <div class="creation-field-grid"><label class="form-label" for="eventName">Nom de l’événement<input id="eventName" name="eventName" maxlength="100" value="${esc(event?.name||'')}" placeholder="Ex : Daytona 8H" required></label>
          <label class="form-label" for="eventDuration">Durée de la course<input id="eventDuration" name="eventDuration" type="number" min="1" max="24" step="1" value="${esc(event?.durationHours||6)}" required><small>De 1 à 24 heures. Une case sera créée pour chaque heure.</small></label>
          <label class="form-label" for="eventType">Type d’événement<select id="eventType" name="eventType" class="event-type-select">${Object.entries(EVENT_TYPES).map(([key,item])=>`<option value="${key}" ${((event?.eventType||'private')===key)?'selected':''}>${item.label}</option>`).join('')}</select><small>La couleur sera reprise sur les cartes et le détail.</small></label>
          <label class="form-label" for="eventCircuit">Circuit<select id="eventCircuit" name="eventCircuit" class="event-circuit-select" required><option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${(event?.circuit||'')===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select><small>L’image du circuit sera affichée automatiquement.</small></label>
        </div>
      </section>
      <fieldset class="creation-card creation-fieldset"><legend>02 · Catégories autorisées</legend><p class="creation-help">Choisis une ou plusieurs catégories disponibles pour cette course.</p>
        <div class="event-category-options">${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="eventCategory" value="${esc(category)}" ${event?.categories.includes(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="creation-card creation-fieldset"><legend>03 · Départs possibles</legend><p class="creation-help">Les dates et heures sont saisies en heure de Paris.</p>
        <div id="departureFields" class="departure-fields">${(event?.departures||[{}]).map(departureFields).join('')}</div>${button('add-departure','+ Ajouter un départ','','secondary-button add-departure-button')}</fieldset>
      ${event?'<p class="creation-help">Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée. Préviens les pilotes si tu changes un horaire.</p>':''}
      <div class="creation-actions">${errorBox()}<button type="submit" class="primary-button">${event?'ENREGISTRER LES MODIFICATIONS':'CRÉER L’ÉVÉNEMENT'}</button></div>
    </form>`;
  updateRemoveButtons();
}
function updateRemoveButtons(){const buttons=app.querySelectorAll('[data-action="remove-departure"]');buttons.forEach(b=>b.disabled=buttons.length===1);}
async function renderMembers() {
  if(!isAdmin())throw Error('Accès réservé aux administrateurs.');
  const result=await api('/api/members');members=result.members;page='members';
  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<h1 class="page-title">GESTION DES MEMBRES</h1>
    <p class="creation-help">Un pilote apparaît ici après sa première connexion Discord. Le rôle Organisateur permet de créer et modifier les événements.</p>${errorBox()}
    <div class="member-list">${members.map(member=>`<form class="member-row" data-kind="member" data-id="${member.id}"><div><strong>${esc(member.name)}</strong><small>Discord : ${member.id}</small></div>
      ${member.role==='admin'?'<span>Administrateur principal</span>':`<label><span class="sr-only">Rôle de ${esc(member.name)}</span><select name="role"><option value="pilot" ${member.role==='pilot'?'selected':''}>Pilote</option><option value="organizer" ${member.role==='organizer'?'selected':''}>Organisateur</option></select></label><button class="secondary-button" type="submit">Enregistrer</button>`}</form>`).join('')}</div>`;
}
function renderMyEntries() {
  page='my-entries';
  const entries=events.flatMap(event=>event.departures.flatMap(departure=>departure.availability.filter(r=>r.mine||r.managed).map(reg=>({event,departure,reg}))));

  function entryCard({event,departure,reg}) {
    const duration=event.durationHours||6;
    const sameCategory=departure.availability.filter(r=>r.category===reg.category&&r.status!=='unavailable');
    const crew=(departure.crews||[]).find(c=>c.registrationIds.includes(reg.id));
    const crewRegs=crew?crew.registrationIds.map(id=>departure.availability.find(r=>r.id===id)).filter(Boolean):[];
    const crewCounts=crew?Array.from({length:duration},(_,i)=>crewRegs.filter(r=>coversHour(r,i)).length):[];
    const crewCovered=crewCounts.filter(n=>n>0).length;
    const eventCrewCount=(departure.crews||[]).length;
    const assignedIds=new Set((departure.crews||[]).flatMap(c=>c.registrationIds||[]));
    const unassignedSameCategory=sameCategory.filter(p=>!assignedIds.has(p.id));
    const existingCrews=(departure.crews||[]).filter(c=>c.category===reg.category);
    const mineTimeline=pilotAvailability(reg,departure,duration);
    const startState=departure.startsAt<=Date.now()?'Départ passé':countdown(departure.startsAt);

    const crewBlock=crew?`<section class="my-entry-section my-entry-crew"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">MON ÉQUIPAGE</span><h3>${esc(crew.name)}</h3></div><span class="my-entry-pill">${esc(crew.car||'Voiture à définir')}</span></div>
      <div class="my-entry-crew-roster">${crewRegs.map(p=>`<article class="my-entry-pilot ${p.id===reg.id?'is-me':''}"><div class="my-entry-pilot-head"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><span>${esc(statusLabel(p.status))}</span></div>${pilotAvailability(p,departure,duration)}</article>`).join('')}</div>
      <div class="crew-availability-line duration-${duration}" aria-label="Couverture de mon équipage">${crewCounts.map((n,i)=>`<span class="crew-availability-hour ${phaseClass(i,duration)} ${n?'covered':'gap'}" title="${raceHourLabel(departure,i)} : ${n?`${n} pilote(s)`:'aucun pilote'}">${raceHourLabel(departure,i)}</span>`).join('')}</div>
      <p class="coverage-note">${crewCovered===duration?'Toutes les heures sont couvertes par ton équipage.':`${duration-crewCovered} heure(s) restent sans présence dans ton équipage.`}</p>
    </section>`:`<section class="my-entry-section my-entry-waiting"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">PILOTE EN AFFECTATION</span><h3>${esc(reg.name)}</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>
      <div class="my-entry-preferences"><div><span>Voiture(s) souhaitée(s)</span><strong>${esc(registrationCarLabel(reg))}</strong></div><div><span>Coéquipier souhaité</span><strong>${esc(reg.preferredPilot||'Aucune préférence')}</strong></div></div>${mineTimeline}
      <p class="coverage-note">Ton équipage n’est pas encore validé.</p></section>`;

    const pilotsBlock=`<section class="my-entry-section my-entry-pilots-summary"><div class="my-entry-section-heading"><div><span class="my-entry-kicker">PILOTES EN AFFECTATION</span><h3>${unassignedSameCategory.length} pilote${unassignedSameCategory.length>1?'s':''} sans équipage</h3></div><span class="my-entry-pill">${esc(reg.category)}</span></div>
      <div class="my-entry-compact-pilots">${unassignedSameCategory.map(p=>`<span class="my-entry-compact-pilot ${p.id===reg.id?'is-me':''}"><strong>${esc(p.name)}${p.id===reg.id?' · Moi':''}</strong><small>${esc(registrationCarLabel(p))}${p.preferredPilot?` · souhaite ${esc(p.preferredPilot)}`:''}</small></span>`).join('')||'<p class="muted">Tous les pilotes de ta catégorie sont déjà affectés à un équipage.</p>'}</div>
      ${!crew?`<div class="my-entry-existing-crews-wrap"><h4>ÉQUIPAGES DÉJÀ FORMÉS</h4><div class="my-entry-existing-crews">${existingCrews.map(c=>{const names=(c.registrationIds||[]).map(id=>departure.availability.find(p=>p.id===id)?.name).filter(Boolean);return `<div class="my-entry-existing-crew"><strong>${esc(c.name)}</strong><span>${esc(c.car||'Voiture à définir')}</span><small>${names.length?esc(names.join(' · ')):'Aucun pilote affecté'}</small></div>`;}).join('')||'<p class="muted">Aucun équipage formé dans ta catégorie pour le moment.</p>'}</div></div>`:''}
      <p class="coverage-note">Voir l’événement complet pour consulter les disponibilités détaillées des autres pilotes.</p>
    </section>`;

    return `<details class="my-entry-card my-entry-accordion event-type-${event.eventType||'private'}">
      <summary class="my-entry-header"><span class="my-entry-toggle" aria-hidden="true">+</span><div class="my-entry-title"><span class="my-entry-kicker">${esc(dateLabel(departure))} · ${esc(departure.time)}</span><h2>${esc(event.name)}</h2><div class="my-entry-meta">${eventTypeBadge(event.eventType)} ${badge(reg.category)} <span>${esc(circuitLabel(event.circuit))}</span><span>· ${duration} h</span><span>· ${esc(startState)}</span></div></div><div class="my-entry-summary-side">${circuitVisual(event.circuit,true)}</div></summary>
      <div class="my-entry-accordion-body">
        <div class="my-entry-actions my-entry-actions-top"><button type="button" class="primary-button" data-action="open" data-id="${event.id}" data-departure="${departure.id}" data-registration="${reg.id}">Voir l’événement complet</button></div>
        ${crewBlock}
        ${pilotsBlock}
      </div>
    </details>`;
  }

  const section=(title,list)=>`<section class="my-entries-group"><div class="my-entries-group-heading"><h2>${title}</h2><span>${list.length} inscription${list.length>1?'s':''}</span></div>${list.length?`<div class="my-entry-dashboard">${list.map(entryCard).join('')}</div>`:'<p class="empty">Aucune inscription.</p>'}</section>`;

  app.innerHTML=`${button('home','← Retour','','secondary-button back-button')}<div class="my-entries-heading"><div><span class="creation-kicker">ESPACE PILOTE</span><h1 class="page-title">MES INSCRIPTIONS</h1><p>Retrouve ici tes courses, ton équipage et les pilotes inscrits sur le même départ.</p></div></div>${errorBox()}
    ${!user?'<p class="creation-help">Les inscriptions de cet appareil ou de ton lien personnel sont affichées ici.</p>':''}
    ${section('Mes inscriptions personnelles',entries.filter(x=>x.reg.mine))}${entries.some(x=>x.reg.managed)?section('Inscriptions que je gère',entries.filter(x=>x.reg.managed)):''}`;
}

async function submitRegistration(form) {
  const departureId=form.dataset.departure,event=events.find(e=>e.id===currentEventId),departure=event.departures.find(d=>d.id===departureId),state=draftFor(departure);
  state.name=form.elements.pilotName.value.trim();
  if(!state.name)throw Error('Indique ton pseudo.');
  if(!state.status)throw Error('Choisis ta disponibilité.');
  if(state.status!=='unavailable'&&!state.category)throw Error('Choisis ta catégorie.');
  state.cars=[...form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value);
  state.carAny=!!form.elements.carAny?.checked;
  if(state.status!=='unavailable'&&!state.carAny&&!state.cars.length)throw Error('Choisis au moins une voiture, ou coche « Peu importe la voiture ».');
  const payload={name:state.name,status:state.status,category:state.category,cars:state.cars,carAny:state.carAny,preferredPilot:state.preferredPilot||'',version:state.version,participantId:state.participantId,forOther:!!state.forOther};
  const result=await api(state.id?`/api/registrations/${state.id}`:`/api/events/${event.id}/departures/${departure.id}/registrations`,state.id?'PATCH':'POST',payload);
  if(!state.forOther){pilotName=state.name;try{localStorage.setItem('fmt_pilot_name',pilotName);}catch{}}
  if(result.recoveryLink)recoveryLink=result.recoveryLink;
  delete drafts[departureId];
  await refreshAfterSave('Inscription enregistrée.');
}
async function submitEvent(form) {
  const data={name:form.elements.eventName.value.trim(),durationHours:Number(form.elements.eventDuration.value),eventType:form.elements.eventType.value,circuit:form.elements.eventCircuit.value,categories:[...form.querySelectorAll('[name="eventCategory"]:checked')].map(input=>input.value),departures:[...form.querySelectorAll('.departure-field')].map(row=>({id:row.dataset.id||undefined,date:row.querySelector('[name="date"]').value,time:row.querySelector('[name="time"]').value})),version:editingEvent?.version};
  if(!data.categories.length)throw Error('Sélectionne au moins une catégorie.');
  if(!data.circuit)throw Error('Sélectionne le circuit de la course.');
  const editing=!!editingEvent;
  const result=await api(editing?`/api/events/${editingEvent.id}`:'/api/events',editing?'PATCH':'POST',data);
  if(editing){currentEventId=editingEvent.id;page='event';}else{page='home';currentEventId=null;}
  await refreshAfterSave(editing?'Événement modifié.':'Événement créé.',result.id);
}
async function refreshAfterSave(message,firstId) {
  try {
    await load();
    drafts={};
    if(firstId)events.sort((a,b)=>a.id===firstId?-1:b.id===firstId?1:0);
    if(page==='event')renderEvent(message);else renderHome(message);
  } catch {
    // The write already succeeded: do not offer the original submit again.
    app.innerHTML=`<p class="creation-success" role="status">${esc(message)}</p><p>La mise à jour de l’affichage a échoué.</p>${button('refresh','Recharger les données')}${errorBox()}`;
  }
}
async function refresh() {
  await load();drafts={};
  if(page==='event')renderEvent();else if(page==='my-entries')renderMyEntries();else if(page==='members')await renderMembers();else renderHome();
}
async function perform(action,target) {
  const event=events.find(e=>e.id===currentEventId);
  switch(action){
    case 'home':renderHome();break;
    case 'event-filter':eventFilter=target.dataset.filter||'upcoming';renderHome();break;
    case 'refresh':await refresh();break;
    case 'open':{currentEventId=target.dataset.id;selectedDepartureId=target.dataset.departure||null;eventSection='race';crewDraft=null;drafts={};const reg=events.find(e=>e.id===currentEventId)?.departures.find(d=>d.id===selectedDepartureId)?.availability.find(r=>r.id===target.dataset.registration);if(reg)drafts[selectedDepartureId]=registrationDraft(reg);renderEvent();break;}
    case 'focus-registration':{const fold=document.getElementById('departure-'+target.dataset.departure);if(fold){fold.open=true;fold.querySelector('.fold-registration')?.scrollIntoView({behavior:'smooth',block:'start'});}break;}
    case 'event-section':eventSection=target.dataset.section;crewDraft=null;renderEvent();break;
    case 'departure-prev':case 'departure-next':{
      if(crewDraft&&!confirm('Quitter le formulaire d’équipage sans l’enregistrer ?'))return;
      const index=event.departures.findIndex(d=>d.id===selectedDepartureId)+(action==='departure-next'?1:-1);
      if(event.departures[index]){selectedDepartureId=event.departures[index].id;crewDraft=null;renderEvent();}break;
    }
    case 'new-crew':selectedDepartureId=target.dataset.departure;crewDraft={name:'',category:event.categories[0],car:'',departureId:selectedDepartureId};renderEvent();app.querySelector(`[name="crewName"][data-departure="${selectedDepartureId}"]`)?.focus();break;
    case 'cancel-crew':crewDraft=null;renderEvent();break;
    case 'edit-crew':selectedDepartureId=target.dataset.departure;crewDraft={...structuredClone(event.departures.find(d=>d.id===selectedDepartureId).crews.find(c=>c.id===target.dataset.id)),departureId:selectedDepartureId};renderEvent();app.querySelector(`[name="crewName"][data-departure="${selectedDepartureId}"]`)?.focus();break;
    case 'delete-crew':case 'add-crew-pilot':case 'remove-crew-pilot':{
      selectedDepartureId=target.dataset.departure||selectedDepartureId;
      const crew=event.departures.find(d=>d.id===selectedDepartureId).crews.find(c=>c.id===target.dataset.id);
      if(action==='delete-crew'){
        if(!confirm(`Supprimer « ${crew.name} » ? Les inscriptions des pilotes seront conservées.`))return;
        await api('/api/crews/'+crew.id,'DELETE',{version:crew.version});
      }else if(action==='add-crew-pilot'){
        const registrationId=document.getElementById('assign-'+crew.id).value;
        if(!registrationId)throw Error('Choisis un pilote dans la liste.');
        const result=await api('/api/crews/'+crew.id+'/members','POST',{registrationId,version:crew.version});
        crewDraft=null;await refreshAfterSave(`Pilote affecté. ${result.removedRegistrations||0} autre(s) inscription(s) retirée(s) pour ce départ.`);break;
      }else{
        if(!confirm('Retirer ce pilote de l’équipage ? Son inscription sera conservée.'))return;
        await api('/api/crews/'+crew.id+'/members/'+target.dataset.registration,'DELETE',{version:crew.version});
      }
      crewDraft=null;await refreshAfterSave('Équipages mis à jour.');break;
    }
    case 'create':renderEventForm();break;
    case 'edit-event':renderEventForm(event);break;
    case 'add-departure':if(app.querySelectorAll('.departure-field').length>=30)throw Error('Maximum 30 départs par événement.');document.getElementById('departureFields').insertAdjacentHTML('beforeend',departureFields());updateRemoveButtons();break;
    case 'remove-departure':if(app.querySelectorAll('.departure-field').length>1)target.closest('.departure-field').remove();updateRemoveButtons();break;
    case 'availability':{
      selectedDepartureId=target.dataset.departure;
      const departure=event.departures.find(d=>d.id===target.dataset.departure),state=draftFor(departure),value=target.dataset.value;
      if(['whole','unavailable'].includes(value))state.status=value;
      else{const duration=event.durationHours||6;const parts=new Set(state.status==='whole'?Array.from({length:duration},(_,i)=>`h${i+1}`):state.status.split(',').filter(part=>/^h\d+$/.test(part)));parts.has(value)?parts.delete(value):parts.add(value);state.status=parts.size===duration?'whole':Array.from(parts).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).join(',');}
      renderEvent();break;
    }
    case 'my-registration':{selectedDepartureId=target.dataset.departure;delete drafts[selectedDepartureId];renderEvent();break;}
    case 'new-registration':{
      selectedDepartureId=target.dataset.departure;
      const departure=event.departures.find(d=>d.id===target.dataset.departure);
      const categoryMode=target.dataset.mode==='category',existing=departure.availability.find(r=>r.id===target.dataset.registration)||ownRegistrations(departure)[0];
      drafts[departure.id]={...(categoryMode&&existing?registrationDraft(existing):{name:'',status:'',preferredPilot:'',forOther:canManage()}),category:'',cars:[],carAny:false,id:null,version:null,mode:categoryMode?'category':'pilot'};
      renderEvent();document.getElementById('name-'+departure.id)?.focus();break;
    }
    case 'category':{selectedDepartureId=target.dataset.departure;const state=draftFor(event.departures.find(d=>d.id===target.dataset.departure));state.category=target.dataset.value;state.cars=(state.cars||[]).filter(car=>CARS[state.category]?.includes(car));state.carAny=false;renderEvent();break;}
    case 'edit-registration':{
      selectedDepartureId=target.dataset.departure;
      const departure=event.departures.find(d=>d.id===target.dataset.departure),reg=departure.availability.find(r=>r.id===target.dataset.id);
      if(!reg?.canEdit)throw Error('Cette inscription ne t’appartient pas.');drafts[departure.id]=registrationDraft(reg);eventSection='race';renderEvent();document.getElementById('name-'+departure.id)?.focus();break;
    }
    case 'delete-registration':{
      const departure=event.departures.find(d=>d.id===target.dataset.departure),reg=departure.availability.find(r=>r.id===target.dataset.id);
      if(!confirm(`Supprimer l’inscription de ${reg.name} pour ce départ ?`))return;
      await api('/api/registrations/'+reg.id,'DELETE',{version:reg.version});delete drafts[departure.id];await refreshAfterSave('Inscription supprimée.');break;
    }
    case 'delete-event':if(!confirm(`Supprimer « ${event.name} » et toutes ses inscriptions ? Cette suppression est définitive.`))return;await api('/api/events/'+event.id,'DELETE',{version:event.version});page='home';await refreshAfterSave('Événement supprimé.');break;
    case 'members':await renderMembers();break;
    case 'my-entries':await load();renderMyEntries();break;
    case 'logout':await api('/api/auth/logout','POST');recoveryLink='';await load();renderHome('Déconnexion effectuée.');break;
    case 'guest-link':recoveryLink=(await api('/api/guest/link','POST')).link;if(page==='event')renderEvent();else renderHome();break;
    case 'copy-link':try{await navigator.clipboard.writeText(recoveryLink);target.textContent='Lien copié';}catch{document.getElementById('personalLink')?.select();throw Error('Copie le lien sélectionné avec Ctrl+C.');}break;
    case 'hide-link':recoveryLink='';target.closest('.recovery-panel').remove();break;
  }
}
document.addEventListener('input',event=>{const field=event.target;if(field.dataset.departure&&drafts[field.dataset.departure]){if(field.name==='pilotName')drafts[field.dataset.departure].name=field.value;if(field.name==='preferredPilot')drafts[field.dataset.departure].preferredPilot=field.value;}});
document.addEventListener('change',event=>{
  const field=event.target;
  if(field.name==='participant'){
    const draft=drafts[field.dataset.departure],participant=participants.find(p=>p.id===field.value);
    if(draft){draft.participantId=participant?.id;draft.name=participant?.name||'';draft.category='';draft.cars=[];draft.carAny=false;renderEvent();}return;
  }
  if(field.hasAttribute('data-assignment-preview')){updateAssignmentPreview(field);return;}
  const departureId=field.form?.dataset.departure;
  if(departureId&&drafts[departureId]&&(field.name==='carPreference'||field.name==='carAny')){
    const draft=drafts[departureId];
    draft.cars=[...field.form.querySelectorAll('[name="carPreference"]:checked')].map(input=>input.value);
    draft.carAny=!!field.form.elements.carAny?.checked;
    if(draft.carAny)draft.cars=[];
    for(const input of field.form.querySelectorAll('[name="carPreference"]')){
      input.disabled=draft.carAny;
      if(draft.carAny)input.checked=false;
    }
  }
  if(field.name==='crewCategory'&&crewDraft){crewDraft.category=field.value;crewDraft.car='';renderEvent();return;}
  if(field.name==='crewCar'&&crewDraft)crewDraft.car=field.value;
});
document.addEventListener('input',event=>{if(!crewDraft)return;const key={crewName:'name'}[event.target.name];if(key)crewDraft[key]=event.target.value;});
document.addEventListener('error',event=>{
  const image=event.target;
  if(!(image instanceof HTMLImageElement)||!image.matches('.circuit-visual img'))return;
  const circuit=circuitInfo(image.dataset.circuit), slug=image.dataset.circuit, attempts=Number(image.dataset.attempts||0), sources=[`/images/${circuit?.file||slug+'.png'}`,`/images/circuits/${slug}.png`,`/images/${slug}.png`,`/images/circuits/${slug}.jpg`,`/images/${slug}.jpg`,`/images/circuits/${slug}.webp`,`/images/${slug}.webp`];
  if(attempts<sources.length){image.dataset.attempts=String(attempts+1);image.src=sources[attempts];}else image.remove();
},true);
document.addEventListener('change',event=>{
  if(event.target.id!=='departure-select')return;
  if(busy||(crewDraft&&!confirm('Quitter le formulaire d’équipage sans l’enregistrer ?'))){event.target.value=selectedDepartureId;return;}
  selectedDepartureId=event.target.value;crewDraft=null;renderEvent();
});
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;event.preventDefault();if(busy)return;
  busy=true;target.disabled=true;
  try{await perform(target.dataset.action,target);}catch(error){showError(error);}finally{busy=false;if(target.isConnected)target.disabled=false;updateRemoveButtons();}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.dataset.kind)return;event.preventDefault();if(busy)return;
  busy=true;const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
    if(form.dataset.kind==='event')await submitEvent(form);
    else if(form.dataset.kind==='registration')await submitRegistration(form);
    else if(form.dataset.kind==='crew'){
      const draft=crewDraft;
      const departureId=form.dataset.departure||draft.departureId||selectedDepartureId;
      await api(draft.id?'/api/crews/'+draft.id:`/api/events/${currentEventId}/departures/${departureId}/crews`,draft.id?'PATCH':'POST',{name:form.elements.crewName.value,category:form.elements.crewCategory.value,car:form.elements.crewCar.value,version:draft.version});
      crewDraft=null;await refreshAfterSave('Équipage enregistré. Tu peux maintenant y affecter les pilotes.');
    }
    else if(form.dataset.kind==='member'){await api('/api/members/'+form.dataset.id,'PATCH',{role:form.elements.role.value});await renderMembers();app.insertAdjacentHTML('afterbegin','<p class="creation-success" role="status">Autorisations mises à jour.</p>');}
  }catch(error){showError(error);}finally{busy=false;if(submit.isConnected)submit.disabled=false;}
});
setInterval(()=>{
  document.querySelectorAll('[data-countdown]').forEach(element=>element.textContent=countdown(Number(element.dataset.countdown)));
},1000);
async function start(){
  try{
    const token=new URLSearchParams(location.hash.slice(1)).get('access');
    if(token){history.replaceState(null,'',location.pathname+location.search);await api('/api/guest/recover','POST',{token});flash='Tes inscriptions invitées sont accessibles sur cet appareil.';}
    const authError=new URLSearchParams(location.search).get('auth');
    if(authError){history.replaceState(null,'',location.pathname);flash='La connexion Discord n’a pas abouti. Tu peux réessayer.';}
    await load();renderHome(flash);
  }catch(error){app.innerHTML=`<h1 class="page-title">ENDURANCE MANAGER</h1>${errorBox()}${button('refresh','Réessayer')}`;showError(error);}
}
start();
