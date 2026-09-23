import {app,state,esc,button,canManage,CATEGORIES,EVENT_TYPES,CIRCUITS,categories,logo,notifyRender} from './core.mjs';

const managedCommunities=()=>[
  ...(state.organizations?.communities||[])
].filter(community=>['owner','manager'].includes(community.role));

function knownCommunity(id){
  if(!id)return null;
  return [
    ...(state.organizations?.communities||[]),
    ...(state.organizations?.discoverableCommunities||[])
  ].find(community=>community.id===id)||null;
}

function canManageCommunity(id){
  return managedCommunities().some(community=>community.id===id);
}

function eventOrganizationField(event,selectedOrganizationId){
  if(event){
    const community=knownCommunity(selectedOrganizationId);
    return `<label class="form-label">Espace<input type="hidden" name="eventOrganization" value="${esc(selectedOrganizationId)}"><span class="event-organization-fixed">${selectedOrganizationId?`Communauté · ${esc(community?.name||'Communauté')}`:'Endurance Manager · Général'}</span></label>`;
  }

  const communities=managedCommunities();
  const selectedCommunity=knownCommunity(selectedOrganizationId);
  if(selectedCommunity&&canManage()&&!communities.some(community=>community.id===selectedCommunity.id))communities.unshift(selectedCommunity);
  const options=[];
  if(canManage())options.push('<option value="">Endurance indépendante · Général</option>');
  options.push(...communities.map(community=>`<option value="${community.id}" ${community.id===selectedOrganizationId?'selected':''}>Communauté · ${esc(community.name)}</option>`));
  if(!options.length)throw Error('Tu dois être organisateur du site ou d’une communauté pour créer une endurance.');
  return `<label class="form-label">Espace<select name="eventOrganization">${options.join('')}</select></label>`;
}

export function departureFields(departure={}){
  const id=crypto.randomUUID();
  return `<div class="departure-field" data-id="${esc(departure.id||'')}"><div><label class="form-label" for="date-${id}">Date</label><input id="date-${id}" name="date" type="date" value="${esc(departure.date||'')}" required></div><div><label class="form-label" for="time-${id}">Heure (Paris)</label><input id="time-${id}" name="time" type="time" value="${esc(departure.time||'00:00')}" required></div>${button('remove-departure','×','aria-label="Supprimer ce départ"','remove-departure')}</div>`;
}

export function updateRemoveButtons(){
  const buttons=app.querySelectorAll('[data-action="remove-departure"]');
  buttons.forEach(item=>{item.disabled=buttons.length===1;});
}

export function renderEventForm(event=null,{organizationId=state.eventCreationOrganizationId}={}){
  const selectedOrganizationId=event?.organizationId||organizationId||'';
  const allowed=event
    ? (selectedOrganizationId?canManage()||canManageCommunity(selectedOrganizationId):canManage())
    : (canManage()||canManageCommunity(selectedOrganizationId));
  if(!allowed)throw Error('Connecte-toi avec un compte autorisé.');

  state.page='form';
  state.editingEvent=event?structuredClone(event):null;
  state.eventCreationOrganizationId=selectedOrganizationId||null;

  const selectedCategories=new Set(event?.categories||[]);
  app.innerHTML=`
    ${button('home','← Retour','','secondary-button back-button')}
    <h1 class="page-title">${event?'MODIFIER L’ÉVÉNEMENT':'NOUVEL ÉVÉNEMENT'}</h1>
    <form class="form-panel event-creation" data-kind="event">
      <div class="creation-intro">
        <span class="creation-kicker">${event?'ÉDITION':'CONFIGURATION'} DE LA COURSE</span>
        <h2>${event?'Mettre à jour la course':'Préparer une nouvelle course'}</h2>
        <p>Renseigne les informations essentielles, puis ajoute les départs et les catégories ouvertes aux pilotes.</p>
      </div>

      <section class="creation-card creation-basics">
        <div class="creation-card-heading">
          <span class="creation-step">01</span>
          <div>
            <h2>Informations générales</h2>
            <p>Le nom, l’espace, le format et le circuit apparaîtront dans le récapitulatif.</p>
          </div>
        </div>
        <div class="creation-field-grid">
          <label class="form-label">Nom de l’événement<input name="eventName" maxlength="100" value="${esc(event?.name||'')}" required></label>
          <label class="form-label">Durée de la course<input name="eventDuration" type="number" min="1" max="24" step="1" value="${esc(event?.durationHours||6)}" required></label>
          ${eventOrganizationField(event,selectedOrganizationId)}
          <label class="form-label">Type d’événement<select name="eventType">${Object.entries(EVENT_TYPES).map(([key,item])=>`<option value="${key}" ${(event?.eventType||'private')===key?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label>
          <label class="form-label">Circuit<select name="eventCircuit" required><option value="">Sélectionner un circuit</option>${CIRCUITS.map(c=>`<option value="${c.id}" ${(event?.circuit||'')===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
        </div>
      </section>

      <fieldset class="creation-card creation-fieldset">
        <legend>02 · Catégories autorisées</legend>
        <p class="creation-help">Choisis une ou plusieurs catégories disponibles pour cette course.</p>
        <div class="event-category-options">
          ${CATEGORIES.map(category=>`<label class="event-category-option ${categories[category].css}"><input type="checkbox" name="eventCategory" value="${esc(category)}" ${selectedCategories.has(category)?'checked':''}>${logo(category)}<span>${esc(category)}</span></label>`).join('')}
        </div>
      </fieldset>

      <fieldset class="creation-card creation-fieldset">
        <legend>03 · Départs possibles</legend>
        <p class="creation-help">Les dates et heures sont saisies à l’heure de Paris.</p>
        <div id="departureFields" class="departure-fields">${(event?.departures||[{}]).map(departureFields).join('')}</div>
        ${button('add-departure','+ Ajouter un départ','','secondary-button add-departure-button')}
      </fieldset>

      ${event?'<p class="creation-help">L’espace d’une endurance reste fixe après sa création. Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée.</p>':''}
      <div class="creation-actions"><button type="submit" class="primary-button">${event?'ENREGISTRER LES MODIFICATIONS':'CRÉER L’ÉVÉNEMENT'}</button></div>
    </form>`;
  updateRemoveButtons();
  notifyRender();
}
