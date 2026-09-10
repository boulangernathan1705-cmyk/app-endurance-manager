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

function helpScreenshot(name, alt, caption = '') {
  return `<figure class="help-screenshot">
    <img src="/images/help/${name}.jpg" alt="${alt}" loading="lazy" decoding="async">
    ${caption ? `<figcaption>${caption}</figcaption>` : ''}
  </figure>`;
}

function helpScreenshots(items) {
  return `<div class="help-screenshot-grid">${items.map(item => helpScreenshot(item.name, item.alt, item.caption || '')).join('')}</div>`;
}

function helpItem(index, title, body, open = false) {
  return `<details class="help-item"${open ? ' open' : ''}>
    <summary><span class="help-index">${String(index).padStart(2, '0')}</span><span>${title}</span><span class="help-chevron" aria-hidden="true">⌄</span></summary>
    <div class="help-item-body">${body}</div>
  </details>`;
}

function pilotHelp(role) {
  const connected = !!nav?.querySelector('.account-name');
  const connectionBody = connected
    ? `<p>Tu es connecté avec Discord. Tes inscriptions personnelles sont rattachées à ton compte et peuvent être retrouvées depuis <strong>Mes inscriptions</strong>.</p>${helpScreenshot('pilot-my-entries','Vue réelle de Mes inscriptions dans Endurance Manager','Une fois connecté, tes inscriptions sont regroupées dans « Mes inscriptions ».')}`
    : `<p>Tu peux utiliser Endurance Manager sans compte. Après une inscription, conserve ton <strong>lien personnel</strong> : il permet de retrouver et modifier tes inscriptions sur un autre appareil. Garde ce lien privé.</p>${helpScreenshot('pilot-connection','Vue réelle du bouton de connexion Discord dans Endurance Manager','Tu peux aussi te connecter avec Discord pour rattacher plus facilement tes inscriptions à ton compte.')}`;

  const items = [
    helpItem(1, 'Consulter les événements', `<p>La page <strong>Événements</strong> affiche les courses à venir et les événements archivés. Ouvre une course pour voir son circuit, sa durée, ses catégories, ses différents départs, les pilotes inscrits et les équipages déjà constitués.</p>${helpScreenshot('pilot-events','Vue réelle de la liste des événements','La flèche verte montre la carte de course à ouvrir.')}`),
    helpItem(2, 'Connexion et récupération de mes inscriptions', connectionBody),
    helpItem(3, 'S’inscrire à un départ', `<p>Ouvre le départ qui t’intéresse puis utilise la zone <strong>Mon inscription</strong>. Renseigne ton pseudo, tes disponibilités, ta catégorie et tes préférences avant de valider.</p><div class="help-tip"><strong>Conseil :</strong> ne coche que les heures pendant lesquelles tu es réellement disponible pour rouler.</div>${helpScreenshots([{name:'pilot-register',alt:'Vue réelle du bouton qui ouvre l’inscription',caption:'Dans le départ, ouvre d’abord ton inscription.'},{name:'pilot-form',alt:'Vue réelle du formulaire d’inscription',caption:'Le formulaire affiché est exactement celui du site.'},{name:'pilot-submit',alt:'Vue réelle du bouton de validation de l’inscription',caption:'Une fois les informations vérifiées, valide ici.'}])}`),
    helpItem(4, 'Choisir ses disponibilités', `<p>La course est découpée heure par heure. Sélectionne chaque heure pendant laquelle tu peux participer. Si tu es disponible du départ jusqu’à l’arrivée, utilise <strong>Toute la course</strong> pour sélectionner l’ensemble de la course d’un coup.</p>${helpScreenshot('pilot-availability','Vue réelle du sélecteur de disponibilités','La flèche indique le bouton « Toute la course ». Tu peux aussi sélectionner les heures une par une.')}`),
    helpItem(5, 'Choisir sa catégorie', `<p>Sélectionne la catégorie dans laquelle tu souhaites participer parmi celles ouvertes par les organisateurs : Hypercar, LMP2, LMP3, GT3, GTE, etc.</p><p>Lorsque plusieurs catégories sont possibles, tu peux proposer ta participation dans plusieurs catégories. Dès qu’un organisateur t’affecte à un équipage, la catégorie de cet équipage devient celle retenue pour ce départ.</p>${helpScreenshot('pilot-category','Vue réelle du choix de catégorie','Choisis directement la catégorie dans cette zone du formulaire.')}`),
    helpItem(6, 'Indiquer ses voitures préférées', `<p>Après avoir choisi une catégorie, sélectionne une ou plusieurs voitures que tu souhaites piloter, ou choisis <strong>Peu importe la voiture</strong>. Ce sont des préférences : les organisateurs les utilisent pour composer les équipages et choisir la voiture définitive.</p>${helpScreenshot('pilot-cars','Vue réelle des préférences de voiture','Tu peux sélectionner plusieurs voitures ou utiliser « Peu importe la voiture ».')}`),
    helpItem(7, 'Choisir un coéquipier souhaité', `<p>Le champ <strong>Pilote souhaité dans le même équipage</strong> est facultatif. Tu peux y indiquer le pseudo d’un pilote avec lequel tu aimerais rouler. Les organisateurs verront cette préférence au moment de constituer les équipages.</p>${helpScreenshot('pilot-teammate','Vue réelle du champ de coéquipier souhaité','La flèche indique le champ facultatif à remplir.')}`),
    helpItem(8, 'Modifier ou supprimer son inscription', `<p>Avant le départ, ouvre ton inscription pour mettre à jour tes heures ou tes préférences. Tu peux également te désinscrire tant que l’inscription n’est pas verrouillée.</p><p>Si tu es déjà affecté à un équipage, ta catégorie est fixée par cet équipage, mais tes disponibilités et préférences peuvent encore être mises à jour lorsque le départ est ouvert.</p>${helpScreenshot('pilot-my-entries','Vue réelle d’une inscription depuis Mes inscriptions','Retrouve d’abord la course concernée dans « Mes inscriptions », puis ouvre-la pour modifier ta participation.')}`),
    helpItem(9, 'Comprendre les équipages', `<p>Dans <strong>Pilotes inscrits</strong>, chaque équipage est résumé sur une ligne avec son nom, sa catégorie, ses pilotes et sa voiture. Clique sur l’équipage pour ouvrir son détail et voir les disponibilités.</p><div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en préparation.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme finalisée.</small></div></div>${helpScreenshots([{name:'pilot-crew',alt:'Vue réelle des équipages dans la page Course',caption:'La ligne d’équipage est celle que tu retrouveras dans la course.'},{name:'pilot-crew-details',alt:'Vue réelle du détail d’un équipage',caption:'Ouvre la ligne pour voir le détail et les disponibilités.'}])}`),
    helpItem(10, 'Retrouver mes inscriptions', `<p>Le bouton <strong>Mes inscriptions</strong> regroupe les courses et les départs auxquels tu es inscrit. Clique sur une inscription pour revenir directement sur la course concernée.</p>${helpScreenshot('pilot-my-entries','Vue réelle de Mes inscriptions','Chaque carte correspond à une inscription réelle du pilote.')}`),
    helpItem(11, 'Mes droits en tant que pilote', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>consulter les événements, pilotes et équipages ;</li><li>t’inscrire à un départ ;</li><li>indiquer tes heures, catégories et préférences ;</li><li>modifier ou supprimer tes propres inscriptions avant verrouillage ;</li><li>retrouver tes inscriptions personnelles.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>créer ou modifier une course ;</li><li>composer ou modifier les équipages ;</li><li>affecter les autres pilotes ;</li><li>gérer les rôles des membres ;</li><li>supprimer un événement.</li></ul></div></div>${helpScreenshot('pilot-form','Vue réelle des commandes disponibles au pilote','Le pilote gère sa propre participation depuis ce formulaire.')}`),
    helpItem(12, 'À quoi sert un organisateur ?', `<p>Les organisateurs préparent les courses et composent les équipages. Ils peuvent créer et modifier les événements, inscrire un pilote si nécessaire, choisir les voitures d’équipage, affecter les pilotes et vérifier que la course est correctement couverte.</p><div class="help-callout"><strong>Besoin d’aide ?</strong><p>Contacte un organisateur si tes disponibilités ont changé après verrouillage, si tu rencontres un problème avec ton inscription ou ton équipage, si une affectation semble incorrecte, ou si tu as une situation particulière à expliquer.</p></div>${helpScreenshot('org-home-create','Vue réelle de l’interface supplémentaire d’un organisateur','Un organisateur dispose d’actions supplémentaires pour préparer la course et les équipages.')}`, true)
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
    helpItem(1, 'Comprendre le rôle organisateur', `<p>Un organisateur possède les droits d’un pilote et les outils nécessaires pour préparer les événements, suivre les inscriptions et constituer les équipages.</p><p>L’objectif est de transformer les disponibilités et préférences des pilotes en équipages cohérents et capables de couvrir toute la course.</p>${helpScreenshot('org-home-create','Vue réelle de la page événements pour un organisateur','Les outils d’organisation apparaissent directement dans l’interface de l’organisateur.')}`),
    helpItem(2, 'Créer un événement', `<p>Depuis la page Événements, utilise <strong>Ajouter un évènement</strong>. Renseigne le nom, la durée, le type d’événement et le circuit, puis choisis les catégories ouvertes et ajoute les différents départs possibles.</p><p>La durée choisie détermine le nombre d’heures affichées dans les disponibilités des pilotes.</p>${helpScreenshots([{name:'org-home-create',alt:'Vue réelle du bouton Ajouter un évènement',caption:'Commence par « Ajouter un évènement ».'},{name:'org-create-event',alt:'Vue réelle du formulaire de création d’événement',caption:'Tu retrouves ensuite le vrai formulaire de création du site.'}])}`),
    helpItem(3, 'Modifier un événement', `<p>Dans une course, utilise <strong>Modifier l’événement</strong> pour mettre à jour les informations, les catégories ou les départs. Certaines suppressions sont bloquées lorsqu’elles toucheraient des inscriptions déjà existantes.</p><div class="help-tip"><strong>Important :</strong> si tu modifies un horaire, pense à prévenir les pilotes concernés.</div>${helpScreenshot('org-edit-event','Vue réelle du bouton Modifier l’événement','La flèche montre le bouton exact dans la course.')}`),
    helpItem(4, 'Gérer les différents départs', `<p>Chaque départ possède ses propres inscriptions et ses propres équipages. Ouvre toujours le bon départ avant de travailler sur les pilotes ou la composition des équipes.</p>${helpScreenshot('org-departure','Vue réelle d’un départ de course','Clique sur le départ que tu veux gérer avant de modifier les inscriptions ou équipages.')}`),
    helpItem(5, 'Comprendre les inscriptions', `<p>Chaque inscription contient le pseudo du pilote, ses heures de présence, sa catégorie, ses voitures souhaitées et éventuellement un coéquipier préféré. Ces informations servent de base à la composition des équipages.</p>${helpScreenshot('org-managed-entry','Vue réelle d’une inscription gérée par un organisateur','Les inscriptions que tu gères restent identifiables depuis ton espace.')}`),
    helpItem(6, 'Inscrire un pilote', `<p>Dans la zone d’inscription du départ, utilise <strong>Inscrire un pilote</strong> lorsqu’un membre t’a donné directement ses informations. Si sa fiche existe déjà, sélectionne-la afin de conserver correctement ses différentes inscriptions.</p>${helpScreenshot('org-add-pilot','Vue réelle du bouton Inscrire un pilote','La flèche indique le bouton exact pour passer en inscription d’un autre pilote.')}`),
    helpItem(7, 'Inscriptions dans plusieurs catégories', `<p>Un pilote peut proposer plusieurs catégories sur un même départ. Lorsqu’il est affecté à un équipage, la catégorie de cet équipage devient la catégorie retenue et ses autres propositions pour ce départ sont retirées.</p>${helpScreenshot('pilot-category','Vue réelle du choix de catégorie dans une inscription','Les catégories proposées viennent directement du formulaire réel d’inscription.')}`),
    helpItem(8, 'Créer un équipage', `<p>Utilise <strong>Créer un équipage</strong> depuis la course. Choisis le départ et la catégorie, puis définis son nom, sa voiture et éventuellement les pilotes à y intégrer immédiatement.</p>${helpScreenshot('org-create-crew','Vue réelle du créateur d’équipage','Le créateur d’équipage affiché ici est exactement celui du site.')}`),
    helpItem(9, 'Affecter les pilotes', `<p>Ajoute les pilotes inscrits compatibles avec la catégorie de l’équipage. Avant l’affectation, vérifie leurs voitures souhaitées, leur éventuel coéquipier préféré et leurs heures de présence.</p><p>Une affectation ne doit pas seulement réunir les bons pilotes : elle doit aussi permettre de couvrir correctement toute la durée de la course.</p>${helpScreenshot('org-assign-pilot','Vue réelle de l’affectation d’un pilote à un équipage','La flèche montre l’action permettant d’ajouter un pilote disponible.')}`),
    helpItem(10, 'Gérer les pilotes non affectés', `<p>Les pilotes encore disponibles restent visibles hors des équipages. Utilise cette liste pour vérifier qu’aucun inscrit n’a été oublié et pour repérer les pilotes qui proposent plusieurs catégories.</p>${helpScreenshot('org-unassigned','Vue réelle des pilotes non affectés','Cette zone te permet de repérer immédiatement les pilotes restant à placer.')}`),
    helpItem(11, 'Vérifier la couverture horaire', `<p>Chaque équipage affiche une ligne correspondant aux heures de la course. Vérifie qu’il existe une présence suffisante sur toutes les périodes avant de considérer l’équipage comme terminé.</p>${helpScreenshot('org-coverage','Vue réelle de la couverture horaire d’un équipage','La timeline réelle du site permet de vérifier les heures couvertes par les pilotes.')}`),
    helpItem(12, 'Équipage ouvert ou complet', `<div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en construction et peut continuer à évoluer.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme terminée.</small></div></div><p>Utilise ce statut pour permettre à toute l’équipe de voir immédiatement quels équipages demandent encore du travail.</p>${helpScreenshot('org-crew-status','Vue réelle du menu de statut de l’équipage','La flèche montre le menu « Ouvert / Équipage complet ».')}`),
    helpItem(13, 'Modifier ou supprimer un équipage', `<p>Tu peux modifier le nom, la voiture, la composition et les paramètres disponibles de l’équipage avant le départ. Retirer un pilote d’un équipage conserve son inscription : il redevient simplement disponible pour une autre affectation.</p><p>Supprimer un équipage conserve également les inscriptions de ses pilotes.</p>${helpScreenshot('org-crew-actions','Vue réelle des actions d’un équipage','Les actions affichées sont celles de la vraie carte d’équipage.')}`),
    helpItem(14, 'Modifier une inscription que je gère', `<p>Une inscription créée par toi pour un autre pilote apparaît parmi les inscriptions que tu gères. Tu peux la retrouver depuis <strong>Mes inscriptions</strong> et la mettre à jour tant que le départ n’est pas verrouillé.</p>${helpScreenshot('org-managed-entry','Vue réelle des inscriptions gérées','Retrouve les inscriptions que tu as créées pour d’autres pilotes depuis cette page.')}`),
    helpItem(15, 'Mes droits en tant qu’organisateur', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>faire tout ce qu’un pilote peut faire ;</li><li>créer et modifier les événements ;</li><li>inscrire un pilote ;</li><li>créer et modifier les équipages ;</li><li>affecter ou retirer des pilotes ;</li><li>choisir la voiture de l’équipage ;</li><li>contrôler la couverture de la course.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>attribuer ou retirer les rôles des membres ;</li><li>accéder aux fonctions réservées à l’administrateur principal ;</li><li>supprimer définitivement un événement lorsque cette action est réservée à l’administrateur.</li></ul></div></div>${helpScreenshot('org-crew-overview','Vue réelle de l’espace de gestion des équipages','L’organisateur dispose de l’espace Équipages pour préparer la composition de la course.')}`)
  ];

  if (role === 'admin') {
    items.push(helpItem(16, 'Administration du site', `<p>En tant qu’<strong>Administrateur</strong>, tu disposes également des fonctions de gestion des membres et des actions réservées au rôle administrateur.</p><ul><li>Accéder à <strong>Gestion des membres</strong>.</li><li>Attribuer ou retirer le rôle <strong>Organisateur</strong>.</li><li>Conserver le contrôle des droits du site.</li><li>Effectuer les suppressions d’événements réservées à l’administrateur.</li></ul>${helpScreenshot('admin-members','Vue réelle de la gestion des membres','La flèche montre le sélecteur de rôle réel utilisé par l’administrateur.')}`));
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

function backToHome() {
  const home = nav?.querySelector('[data-action="home"]') || document.querySelector('[data-action="home"]');
  home?.click();
}

export function renderHelp() {
  if (!app) return;
  const role = normalizedRole();
  app.innerHTML = role === 'organizer' || role === 'admin' ? organizerHelp(role) : pilotHelp(role);
  document.getElementById(HELP_BUTTON_ID)?.setAttribute('aria-current', 'page');
  document.getElementById('help-back-button')?.addEventListener('click', backToHome, {once:true});
  window.scrollTo({top:0, behavior:'smooth'});
}
