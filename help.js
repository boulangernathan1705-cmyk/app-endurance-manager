const HELP_BUTTON_ID = 'help-nav-button';
const HELP_PAGE_CLASS = 'help-page';

const nav = document.getElementById('navigation');
const app = document.getElementById('app');

function normalizedRole() {
  const roleText = nav?.querySelector('.account-name small')?.textContent?.trim().toLowerCase() || '';
  if (roleText.includes('administrateur')) return 'admin';
  if (roleText.includes('organisateur')) return 'organizer';
  return 'pilot';
}

function accountLabel(role) {
  const account = nav?.querySelector('.account-name');
  if (!account) return 'Utilisation sans connexion';
  const clone = account.cloneNode(true);
  clone.querySelector('small')?.remove();
  const name = clone.textContent.trim();
  const label = role === 'admin' ? 'Administrateur' : role === 'organizer' ? 'Organisateur' : 'Pilote';
  return `${name} · ${label}`;
}

function helpItem(index, title, body, open = false) {
  return `<details class="help-item"${open ? ' open' : ''}>
    <summary><span class="help-index">${String(index).padStart(2, '0')}</span><span>${title}</span><span class="help-chevron" aria-hidden="true">⌄</span></summary>
    <div class="help-item-body">${body}</div>
  </details>`;
}

function visual(title, content, hint) {
  return `<figure class="help-visual" aria-label="Illustration : ${title}">
    <div class="help-visual-top"><span class="help-visual-dot"></span><span class="help-visual-dot"></span><span class="help-visual-dot"></span><strong>${title}</strong></div>
    <div class="help-visual-screen">${content}</div>
    ${hint ? `<figcaption><span class="help-arrow" aria-hidden="true">↳</span>${hint}</figcaption>` : ''}
  </figure>`;
}

function fakeButton(label, focus = false, danger = false) {
  return `<span class="help-fake-button${focus ? ' is-focus' : ''}${danger ? ' is-danger' : ''}">${label}</span>`;
}

function fakeHours(active = [1,2,3,6,7,8], focusWhole = false) {
  return `<div class="help-fake-hours">${Array.from({length:8},(_,i)=>`<span class="${active.includes(i+1)?'is-active':''}">${i+1}</span>`).join('')}</div>
    <div class="help-fake-actions">${fakeButton('TOUTE LA COURSE', focusWhole)}${fakeButton('INDISPONIBLE')}</div>`;
}

function pilotVisual(kind, connected) {
  const visuals = {
    events: visual('Événements', `<div class="help-mock-toolbar">${fakeButton('À venir', true)}${fakeButton('Archivés')}</div><div class="help-mock-event is-focus"><div><strong>Daytona 8H</strong><small>8 h · Hypercar · GT3</small></div><span>›</span></div><div class="help-mock-event"><div><strong>Le Mans 6H</strong><small>6 h · Hypercar</small></div><span>›</span></div>`, 'Clique sur la course que tu veux consulter.'),
    connection: connected
      ? visual('Compte pilote', `<div class="help-mock-nav"><span>Événements</span>${fakeButton('Mes inscriptions', true)}<span class="help-mock-account">Nathan · Pilote</span></div><div class="help-mock-note">Tes inscriptions sont liées à ton compte Discord.</div>`, 'Utilise « Mes inscriptions » pour les retrouver rapidement.')
      : visual('Sans compte', `<div class="help-mock-nav"><span>Événements</span>${fakeButton('Mon lien personnel', true)}${fakeButton('Se connecter avec Discord')}</div><div class="help-mock-link">https://…/#access=••••••••</div>`, 'Conserve ton lien personnel et ne le partage pas.'),
    registration: visual('Mon inscription', `<div class="help-mock-departure"><strong>Samedi 12 septembre · 16:00</strong><span>4 pilotes · 1 équipage</span></div><div class="help-call-target"><span class="help-call-label">1</span>${fakeButton('Mon inscription', true)}<span class="help-inline-arrow">← ouvre cette zone</span></div><div class="help-mock-form"><label>Pseudo pilote</label><span class="help-mock-input">Nathan</span>${fakeButton('S’INSCRIRE', true)}</div>`, 'Ouvre le départ, puis remplis « Mon inscription » et valide.'),
    availability: visual('Heures de présence', `${fakeHours([1,2,3,6,7,8], true)}<div class="help-call-target"><span class="help-call-label">1</span><span>Cases = heures où tu peux rouler</span></div><div class="help-call-target"><span class="help-call-label">2</span><span>« Toute la course » sélectionne tout d’un coup</span></div>`, 'Clique sur chaque heure disponible, ou sur « Toute la course ».') ,
    category: visual('Catégorie', `<div class="help-mock-categories"><span>Hypercar</span><span>LMP2</span><span class="is-focus">GT3</span><span>GTE</span></div><div class="help-inline-arrow centered">↑ Choisis la catégorie dans laquelle tu souhaites rouler</div>`, 'La catégorie sélectionnée devient ta proposition pour ce départ.'),
    cars: visual('Voitures souhaitées', `<div class="help-mock-checks"><span>☐ Peu importe la voiture</span><span class="is-focus">☑ Ferrari 296 LMGT3</span><span>☑ Porsche 911 GT3 R LMGT3</span><span>☐ BMW M4 LMGT3</span></div>`, 'Tu peux sélectionner plusieurs voitures, ou « Peu importe la voiture ».') ,
    teammate: visual('Coéquipier souhaité', `<label class="help-mock-label">Pilote souhaité dans le même équipage</label><div class="help-mock-input is-focus">Josselin</div><small class="help-mock-help">Facultatif</small>`, 'Écris le pseudo du pilote avec qui tu aimerais rouler.'),
    edit: visual('Pilote inscrit', `<div class="help-mock-pilot"><div><strong>Nathan <small>(toi)</small></strong><span>GT3 · 6 h disponibles</span></div><div>${fakeButton('Modifier', true)} ${fakeButton('Se désinscrire', false, true)}</div></div>`, 'Utilise « Modifier » avant le verrouillage du départ.'),
    crew: visual('Équipage', `<div class="help-mock-crew is-focus"><div class="help-mock-crew-head"><strong>FMT Racing 1</strong><span>GT3</span><span>Ferrari 296</span><span class="help-mock-status">🔓 Ouvert⌄</span><b>⌄</b></div><div class="help-mock-crew-pilots">Nathan · Josselin · Rico</div></div><div class="help-inline-arrow centered">↑ Clique sur la ligne pour ouvrir le détail</div>`, 'Le cadenas indique si l’équipage est encore ouvert ou déjà complet.'),
    entries: visual('Mes inscriptions', `<div class="help-mock-nav">${fakeButton('Mes inscriptions', true)}</div><div class="help-mock-event"><div><strong>Daytona 8H · Nathan</strong><small>Samedi · 16:00 · GT3</small></div><span>›</span></div>`, 'Clique sur une inscription pour retourner directement sur la course.'),
    rights: visual('Droits pilote', `<div class="help-visual-rights"><div><strong>✓ Tu peux</strong><span>T’inscrire</span><span>Modifier tes dispos</span><span>Voir les équipages</span></div><div><strong>× Tu ne peux pas</strong><span>Créer une course</span><span>Affecter les pilotes</span><span>Gérer les rôles</span></div></div>`, 'Ton rôle te laisse gérer ta participation, pas l’organisation générale.'),
    organizer: visual('Quand contacter un organisateur ?', `<div class="help-flow"><span class="is-focus">Pilote</span><b>→</b><span class="is-focus">Organisateur</span><b>→</b><span>Course / équipage</span></div><div class="help-mock-note">Dispos changées · problème d’affectation · inscription verrouillée · situation particulière</div>`, 'L’organisateur peut intervenir sur l’organisation quand tu ne peux plus le faire toi-même.')
  };
  return visuals[kind] || '';
}

function organizerVisual(kind) {
  const visuals = {
    role: visual('Rôle organisateur', `<div class="help-flow"><span>Pilotes</span><b>→</b><span class="is-focus">Organisateur</span><b>→</b><span>Équipages</span><b>→</b><span>Course prête</span></div>`, 'Tu transformes les disponibilités des pilotes en équipages cohérents.'),
    createEvent: visual('Navigation organisateur', `<div class="help-mock-nav"><span>Événements</span>${fakeButton('+ Événement', true)}<span>Organisateur</span></div><div class="help-inline-arrow centered">↑ Commence ici</div>`, 'Clique sur « + Événement » pour créer une nouvelle course.'),
    editEvent: visual('Course', `<div class="help-mock-event"><div><strong>Daytona 8H</strong><small>8 h · 2 départs · GT3 / Hypercar</small></div></div><div class="help-mock-toolbar">${fakeButton('Actualiser')}${fakeButton('Modifier l’événement', true)}</div>`, 'Ouvre la course puis utilise « Modifier l’événement ».') ,
    departures: visual('Départs', `<div class="help-mock-departure is-focus"><strong>01 · Samedi 12 septembre · 16:00</strong><span>7 pilotes · 2 équipages⌄</span></div><div class="help-mock-departure"><strong>02 · Dimanche 13 septembre · 10:00</strong><span>4 pilotes · 1 équipage⌄</span></div>`, 'Ouvre toujours le départ que tu veux organiser avant d’agir.'),
    registrationInfo: visual('Fiche pilote', `<div class="help-mock-pilot"><div><strong>Nathan</strong><span>GT3 · Ferrari / Porsche</span><span>Souhaite rouler avec : Josselin</span></div></div>${fakeHours([1,2,3,4,7,8])}`, 'Lis les heures, la catégorie et les préférences avant de composer l’équipage.'),
    registerPilot: visual('Inscription organisateur', `<div class="help-call-target"><span class="help-call-label">1</span>${fakeButton('Inscrire un pilote', true)}</div><div class="help-mock-form"><label>Pilote déjà inscrit</label><span class="help-mock-select">Choisir une fiche pilote⌄</span></div>`, 'Utilise « Inscrire un pilote » puis rattache si possible la fiche existante.'),
    multiCategory: visual('Plusieurs catégories', `<div class="help-mock-multi"><span>Nathan · Hypercar</span><span>Nathan · GT3</span></div><div class="help-flow"><span>2 propositions</span><b>→</b><span class="is-focus">Affecté en GT3</span><b>→</b><span>Hypercar retirée</span></div>`, 'L’affectation à un équipage fixe la catégorie retenue pour ce départ.'),
    createCrew: visual('Équipages', `<div class="help-mock-tabs"><span>Course</span><span class="is-focus">Équipages</span></div><div class="help-call-target"><span class="help-call-label">1</span>${fakeButton('Créer un équipage', true)}</div><div class="help-mock-form"><span class="help-mock-input">FMT Racing 1</span><span class="help-mock-select">GT3⌄</span><span class="help-mock-select">Ferrari 296 LMGT3⌄</span></div>`, 'Va dans « Équipages », puis crée l’équipage du départ concerné.'),
    assign: visual('Affecter un pilote', `<div class="help-mock-assign"><label>Ajouter un pilote inscrit · GT3</label><div><span class="help-mock-select is-focus">Nathan⌄</span>${fakeButton('Ajouter', true)}</div><small>Ferrari 296 · souhaite Josselin</small></div>`, 'Sélectionne le pilote, vérifie ses souhaits puis clique sur « Ajouter ».') ,
    unassigned: visual('Pilotes restant à affecter', `<div class="help-mock-unassigned is-focus"><strong>3 pilotes restant à affecter⌄</strong><span>Nathan · GT3</span><span>Rico · Hypercar</span><span>Manu · GT3</span></div>`, 'Utilise cette liste pour vérifier que personne n’est oublié.'),
    coverage: visual('Couverture de l’équipage', `${fakeHours([1,2,3,4,5,6,7,8])}<div class="help-mock-note success">8 / 8 h couvertes</div>`, 'Toutes les heures doivent être couvertes avant de finaliser l’équipage.'),
    status: visual('Statut équipage', `<div class="help-mock-status-menu"><span class="is-focus">🔓 Ouvert⌄</span><div><span>🔓 Ouvert</span><span class="is-focus">🔒 Équipage complet</span></div></div><div class="help-inline-arrow centered">↑ Ouvre ce menu pour changer le statut</div>`, 'Passe sur « Équipage complet » lorsque la composition est finalisée.'),
    crewActions: visual('Actions équipage', `<div class="help-mock-crew"><div class="help-mock-crew-head"><strong>FMT Racing 1</strong><span>GT3</span></div><div class="help-mock-toolbar">${fakeButton('Modifier', true)}${fakeButton('Supprimer', false, true)}</div></div>`, 'Modifier change l’équipage ; supprimer l’équipage ne supprime pas les inscriptions des pilotes.'),
    managedEntry: visual('Mes inscriptions', `<div class="help-mock-section-title">Inscriptions que je gère</div><div class="help-mock-event is-focus"><div><strong>Daytona 8H · Manu</strong><small>Dimanche · GT3 · 5 h disponibles</small></div><span>›</span></div>`, 'Les inscriptions créées pour d’autres pilotes sont regroupées ici.'),
    rights: visual('Droits organisateur', `<div class="help-visual-rights"><div><strong>✓ Organiser</strong><span>Créer les courses</span><span>Former les équipages</span><span>Affecter les pilotes</span></div><div><strong>Admin uniquement</strong><span>Gérer les rôles</span><span>Administration globale</span></div></div>`, 'L’organisateur gère la course ; l’administrateur garde les droits sensibles.'),
    admin: visual('Gestion des membres', `<div class="help-mock-nav">${fakeButton('Gestion des membres', true)}</div><div class="help-mock-member"><strong>Josselin</strong><span class="help-mock-select is-focus">Organisateur⌄</span>${fakeButton('Enregistrer')}</div>`, 'L’administrateur peut attribuer ou retirer le rôle Organisateur.')
  };
  return visuals[kind] || '';
}

function pilotHelp(role) {
  const connected = !!nav?.querySelector('.account-name');
  const connectionBody = connected
    ? `<p>Tu es connecté avec Discord. Tes inscriptions personnelles sont rattachées à ton compte et peuvent être retrouvées depuis <strong>Mes inscriptions</strong>.</p>${pilotVisual('connection', true)}`
    : `<p>Tu peux utiliser Endurance Manager sans compte. Après une inscription, conserve ton <strong>lien personnel</strong> : il permet de retrouver et modifier tes inscriptions sur un autre appareil. Garde ce lien privé.</p>${pilotVisual('connection', false)}`;

  const items = [
    helpItem(1, 'Consulter les événements', `<p>La page <strong>Événements</strong> affiche les courses à venir et les événements archivés. Ouvre une course pour voir son circuit, sa durée, ses catégories, ses différents départs, les pilotes inscrits et les équipages déjà constitués.</p>${pilotVisual('events', connected)}`),
    helpItem(2, 'Connexion et récupération de mes inscriptions', connectionBody),
    helpItem(3, 'S’inscrire à un départ', `<p>Ouvre le départ qui t’intéresse puis utilise la zone <strong>Mon inscription</strong>. Renseigne ton pseudo, tes disponibilités, ta catégorie et tes préférences avant de valider.</p><div class="help-tip"><strong>Conseil :</strong> ne coche que les heures pendant lesquelles tu es réellement disponible pour rouler.</div>${pilotVisual('registration', connected)}`),
    helpItem(4, 'Choisir ses disponibilités', `<p>La course est découpée heure par heure. Sélectionne chaque heure pendant laquelle tu peux participer. Si tu es disponible du départ jusqu’à l’arrivée, utilise <strong>Toute la course</strong> pour sélectionner l’ensemble de la course d’un coup.</p>${pilotVisual('availability', connected)}`),
    helpItem(5, 'Choisir sa catégorie', `<p>Sélectionne la catégorie dans laquelle tu souhaites participer parmi celles ouvertes par les organisateurs : Hypercar, LMP2, LMP3, GT3, GTE, etc.</p><p>Lorsque plusieurs catégories sont possibles, tu peux proposer ta participation dans plusieurs catégories. Dès qu’un organisateur t’affecte à un équipage, la catégorie de cet équipage devient celle retenue pour ce départ.</p>${pilotVisual('category', connected)}`),
    helpItem(6, 'Indiquer ses voitures préférées', `<p>Après avoir choisi une catégorie, sélectionne une ou plusieurs voitures que tu souhaites piloter, ou choisis <strong>Peu importe la voiture</strong>. Ce sont des préférences : les organisateurs les utilisent pour composer les équipages et choisir la voiture définitive.</p>${pilotVisual('cars', connected)}`),
    helpItem(7, 'Choisir un coéquipier souhaité', `<p>Le champ <strong>Pilote souhaité dans le même équipage</strong> est facultatif. Tu peux y indiquer le pseudo d’un pilote avec lequel tu aimerais rouler. Les organisateurs verront cette préférence au moment de constituer les équipages.</p>${pilotVisual('teammate', connected)}`),
    helpItem(8, 'Modifier ou supprimer son inscription', `<p>Avant le départ, utilise le bouton <strong>Modifier</strong> sur ton inscription pour mettre à jour tes heures ou tes préférences. Tu peux également te désinscrire tant que l’inscription n’est pas verrouillée.</p><p>Si tu es déjà affecté à un équipage, ta catégorie est fixée par cet équipage, mais tes disponibilités et préférences peuvent encore être mises à jour lorsque le départ est ouvert.</p>${pilotVisual('edit', connected)}`),
    helpItem(9, 'Comprendre les équipages', `<p>Dans <strong>Pilotes inscrits</strong>, chaque équipage est résumé sur une ligne avec son nom, sa catégorie, ses pilotes et sa voiture. Clique sur l’équipage pour ouvrir son détail et voir les disponibilités.</p><div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en préparation.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme finalisée.</small></div></div>${pilotVisual('crew', connected)}`),
    helpItem(10, 'Retrouver mes inscriptions', `<p>Le bouton <strong>Mes inscriptions</strong> regroupe les courses et les départs auxquels tu es inscrit. Clique sur une inscription pour revenir directement sur la course concernée.</p>${pilotVisual('entries', connected)}`),
    helpItem(11, 'Mes droits en tant que pilote', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>consulter les événements, pilotes et équipages ;</li><li>t’inscrire à un départ ;</li><li>indiquer tes heures, catégories et préférences ;</li><li>modifier ou supprimer tes propres inscriptions avant verrouillage ;</li><li>retrouver tes inscriptions personnelles.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>créer ou modifier une course ;</li><li>composer ou modifier les équipages ;</li><li>affecter les autres pilotes ;</li><li>gérer les rôles des membres ;</li><li>supprimer un événement.</li></ul></div></div>${pilotVisual('rights', connected)}`),
    helpItem(12, 'À quoi sert un organisateur ?', `<p>Les organisateurs préparent les courses et composent les équipages. Ils peuvent créer et modifier les événements, inscrire un pilote si nécessaire, choisir les voitures d’équipage, affecter les pilotes et vérifier que la course est correctement couverte.</p><div class="help-callout"><strong>Besoin d’aide ?</strong><p>Contacte un organisateur si tes disponibilités ont changé après verrouillage, si tu rencontres un problème avec ton inscription ou ton équipage, si une affectation semble incorrecte, ou si tu as une situation particulière à expliquer.</p></div>${pilotVisual('organizer', connected)}`, true)
  ];

  return `<section class="${HELP_PAGE_CLASS}">
    <button type="button" class="secondary-button back-button" id="help-back-button">← Retour aux événements</button>
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>AIDE PILOTE</h1>
      <p>Tout ce qu’il faut pour s’inscrire à une course, indiquer ses disponibilités et suivre son équipage.</p>
      <span class="help-account-badge">${accountLabel(role)}</span>
    </header>
    <div class="help-list">${items.join('')}</div>
  </section>`;
}

function organizerHelp(role) {
  const items = [
    helpItem(1, 'Comprendre le rôle organisateur', `<p>Un organisateur possède les droits d’un pilote et les outils nécessaires pour préparer les événements, suivre les inscriptions et constituer les équipages.</p><p>L’objectif est de transformer les disponibilités et préférences des pilotes en équipages cohérents et capables de couvrir toute la course.</p>${organizerVisual('role')}`),
    helpItem(2, 'Créer un événement', `<p>Depuis la navigation, utilise <strong>+ Événement</strong>. Renseigne le nom, la durée, le type d’événement et le circuit, puis choisis les catégories ouvertes et ajoute les différents départs possibles.</p><p>La durée choisie détermine le nombre d’heures affichées dans les disponibilités des pilotes.</p>${organizerVisual('createEvent')}`),
    helpItem(3, 'Modifier un événement', `<p>Dans une course, utilise <strong>Modifier l’événement</strong> pour mettre à jour les informations, les catégories ou les départs. Certaines suppressions sont bloquées lorsqu’elles toucheraient des inscriptions déjà existantes.</p><div class="help-tip"><strong>Important :</strong> si tu modifies un horaire, pense à prévenir les pilotes concernés.</div>${organizerVisual('editEvent')}`),
    helpItem(4, 'Gérer les différents départs', `<p>Chaque départ possède ses propres inscriptions et ses propres équipages. Ouvre toujours le bon départ avant de travailler sur les pilotes ou la composition des équipes.</p>${organizerVisual('departures')}`),
    helpItem(5, 'Comprendre les inscriptions', `<p>Chaque inscription contient le pseudo du pilote, ses heures de présence, sa catégorie, ses voitures souhaitées et éventuellement un coéquipier préféré. Ces informations servent de base à la composition des équipages.</p>${organizerVisual('registrationInfo')}`),
    helpItem(6, 'Inscrire un pilote', `<p>Dans la zone d’inscription du départ, utilise <strong>Inscrire un pilote</strong> lorsqu’un membre t’a donné directement ses informations. Si sa fiche existe déjà, sélectionne-la afin de conserver correctement ses différentes inscriptions.</p>${organizerVisual('registerPilot')}`),
    helpItem(7, 'Inscriptions dans plusieurs catégories', `<p>Un pilote peut proposer plusieurs catégories sur un même départ. Lorsqu’il est affecté à un équipage, la catégorie de cet équipage devient la catégorie retenue et ses autres propositions pour ce départ sont retirées.</p>${organizerVisual('multiCategory')}`),
    helpItem(8, 'Créer un équipage', `<p>Dans l’onglet <strong>Équipages</strong>, ouvre le départ concerné puis crée un équipage. Définis son nom, sa catégorie et la voiture retenue. Les préférences des pilotes sont affichées pour aider à faire le choix.</p>${organizerVisual('createCrew')}`),
    helpItem(9, 'Affecter les pilotes', `<p>Ajoute les pilotes inscrits compatibles avec la catégorie de l’équipage. Avant l’affectation, vérifie leurs voitures souhaitées, leur éventuel coéquipier préféré et leurs heures de présence.</p><p>Une affectation ne doit pas seulement réunir les bons pilotes : elle doit aussi permettre de couvrir correctement toute la durée de la course.</p>${organizerVisual('assign')}`),
    helpItem(10, 'Gérer les pilotes non affectés', `<p>Les pilotes encore disponibles restent visibles hors des équipages. Utilise cette liste pour vérifier qu’aucun inscrit n’a été oublié et pour repérer les pilotes qui proposent plusieurs catégories.</p>${organizerVisual('unassigned')}`),
    helpItem(11, 'Vérifier la couverture horaire', `<p>Chaque équipage affiche une ligne correspondant aux heures de la course. Vérifie qu’il existe une présence suffisante sur toutes les périodes avant de considérer l’équipage comme terminé.</p>${organizerVisual('coverage')}`),
    helpItem(12, 'Équipage ouvert ou complet', `<div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en construction et peut continuer à évoluer.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme terminée.</small></div></div><p>Utilise ce statut pour permettre à toute l’équipe de voir immédiatement quels équipages demandent encore du travail.</p>${organizerVisual('status')}`),
    helpItem(13, 'Modifier ou supprimer un équipage', `<p>Tu peux modifier le nom, la voiture, la composition et les paramètres disponibles de l’équipage avant le départ. Retirer un pilote d’un équipage conserve son inscription : il redevient simplement disponible pour une autre affectation.</p><p>Supprimer un équipage conserve également les inscriptions de ses pilotes.</p>${organizerVisual('crewActions')}`),
    helpItem(14, 'Modifier une inscription que je gère', `<p>Une inscription créée par toi pour un autre pilote apparaît parmi les inscriptions que tu gères. Tu peux la retrouver depuis <strong>Mes inscriptions</strong> et la mettre à jour tant que le départ n’est pas verrouillé.</p>${organizerVisual('managedEntry')}`),
    helpItem(15, 'Mes droits en tant qu’organisateur', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>faire tout ce qu’un pilote peut faire ;</li><li>créer et modifier les événements ;</li><li>inscrire un pilote ;</li><li>créer et modifier les équipages ;</li><li>affecter ou retirer des pilotes ;</li><li>choisir la voiture de l’équipage ;</li><li>contrôler la couverture de la course.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>attribuer ou retirer les rôles des membres ;</li><li>accéder aux fonctions réservées à l’administrateur principal ;</li><li>supprimer définitivement un événement lorsque cette action est réservée à l’administrateur.</li></ul></div></div>${organizerVisual('rights')}`)
  ];

  if (role === 'admin') {
    items.push(helpItem(16, 'Administration du site', `<p>En tant qu’<strong>Administrateur</strong>, tu disposes également des fonctions de gestion des membres et des actions réservées au rôle administrateur.</p><ul><li>Accéder à <strong>Gestion des membres</strong>.</li><li>Attribuer ou retirer le rôle <strong>Organisateur</strong>.</li><li>Conserver le contrôle des droits du site.</li><li>Effectuer les suppressions d’événements réservées à l’administrateur.</li></ul>${organizerVisual('admin')}`));
  }

  const title = role === 'admin' ? 'AIDE ORGANISATEUR & ADMINISTRATION' : 'AIDE ORGANISATEUR';
  const subtitle = role === 'admin'
    ? 'Gérer les courses, les équipages et les droits d’Endurance Manager.'
    : 'Créer les courses, suivre les inscriptions et préparer les équipages.';

  return `<section class="${HELP_PAGE_CLASS}">
    <button type="button" class="secondary-button back-button" id="help-back-button">← Retour aux événements</button>
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <span class="help-account-badge">${accountLabel(role)}</span>
    </header>
    <div class="help-list">${items.join('')}</div>
  </section>`;
}

function renderHelp() {
  if (!app) return;
  const role = normalizedRole();
  app.innerHTML = role === 'organizer' || role === 'admin' ? organizerHelp(role) : pilotHelp(role);
  document.getElementById(HELP_BUTTON_ID)?.setAttribute('aria-current', 'page');
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function injectHelpButton() {
  if (!nav || document.getElementById(HELP_BUTTON_ID)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = HELP_BUTTON_ID;
  button.className = 'secondary-button help-nav-button';
  button.textContent = 'Aide';
  button.addEventListener('click', renderHelp);

  const logout = nav.querySelector('[data-action="logout"]');
  const discord = nav.querySelector('.discord-button');
  if (logout) nav.insertBefore(button, logout);
  else if (discord) nav.insertBefore(button, discord);
  else nav.append(button);
}

document.addEventListener('click', event => {
  if (event.target.closest(`#${HELP_BUTTON_ID}`)) return;
  if (event.target.closest('[data-action]')) {
    document.getElementById(HELP_BUTTON_ID)?.removeAttribute('aria-current');
  }
});

document.addEventListener('click', event => {
  if (!event.target.closest('#help-back-button')) return;
  const home = nav?.querySelector('[data-action="home"]') || document.querySelector('[data-action="home"]');
  home?.click();
});

if (nav) {
  new MutationObserver(injectHelpButton).observe(nav, {childList: true});
  injectHelpButton();
}
