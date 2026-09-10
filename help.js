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

function pilotHelp(role) {
  const connected = !!nav?.querySelector('.account-name');
  const connectionBody = connected
    ? `<p>Tu es connecté avec Discord. Tes inscriptions personnelles sont rattachées à ton compte et peuvent être retrouvées depuis <strong>Mes inscriptions</strong>.</p>`
    : `<p>Tu peux utiliser Endurance Manager sans compte. Après une inscription, conserve ton <strong>lien personnel</strong> : il permet de retrouver et modifier tes inscriptions sur un autre appareil. Garde ce lien privé.</p>`;

  const items = [
    helpItem(1, 'Consulter les événements', `<p>La page <strong>Événements</strong> affiche les courses à venir et les événements archivés. Ouvre une course pour voir son circuit, sa durée, ses catégories, ses différents départs, les pilotes inscrits et les équipages déjà constitués.</p>`),
    helpItem(2, 'Connexion et récupération de mes inscriptions', connectionBody),
    helpItem(3, 'S’inscrire à un départ', `<p>Ouvre le départ qui t’intéresse puis utilise la zone <strong>Mon inscription</strong>. Renseigne ton pseudo, tes disponibilités, ta catégorie et tes préférences avant de valider.</p><div class="help-tip"><strong>Conseil :</strong> ne coche que les heures pendant lesquelles tu es réellement disponible pour rouler.</div>`),
    helpItem(4, 'Choisir ses disponibilités', `<p>La course est découpée heure par heure. Sélectionne chaque heure pendant laquelle tu peux participer. Si tu es disponible du départ jusqu’à l’arrivée, utilise <strong>Toute la course</strong> pour sélectionner l’ensemble de la course d’un coup.</p><div class="help-demo-hours" aria-label="Exemple de disponibilités"><span class="is-on">1</span><span class="is-on">2</span><span class="is-on">3</span><span>4</span><span>5</span><span class="is-on">6</span><span class="is-on">7</span><span class="is-on">8</span></div>`),
    helpItem(5, 'Choisir sa catégorie', `<p>Sélectionne la catégorie dans laquelle tu souhaites participer parmi celles ouvertes par les organisateurs : Hypercar, LMP2, LMP3, GT3, GTE, etc.</p><p>Lorsque plusieurs catégories sont possibles, tu peux proposer ta participation dans plusieurs catégories. Dès qu’un organisateur t’affecte à un équipage, la catégorie de cet équipage devient celle retenue pour ce départ.</p>`),
    helpItem(6, 'Indiquer ses voitures préférées', `<p>Après avoir choisi une catégorie, sélectionne une ou plusieurs voitures que tu souhaites piloter, ou choisis <strong>Peu importe la voiture</strong>. Ce sont des préférences : les organisateurs les utilisent pour composer les équipages et choisir la voiture définitive.</p>`),
    helpItem(7, 'Choisir un coéquipier souhaité', `<p>Le champ <strong>Pilote souhaité dans le même équipage</strong> est facultatif. Tu peux y indiquer le pseudo d’un pilote avec lequel tu aimerais rouler. Les organisateurs verront cette préférence au moment de constituer les équipages.</p>`),
    helpItem(8, 'Modifier ou supprimer son inscription', `<p>Avant le départ, utilise le bouton <strong>Modifier</strong> sur ton inscription pour mettre à jour tes heures ou tes préférences. Tu peux également te désinscrire tant que l’inscription n’est pas verrouillée.</p><p>Si tu es déjà affecté à un équipage, ta catégorie est fixée par cet équipage, mais tes disponibilités et préférences peuvent encore être mises à jour lorsque le départ est ouvert.</p>`),
    helpItem(9, 'Comprendre les équipages', `<p>Dans <strong>Pilotes inscrits</strong>, chaque équipage est résumé sur une ligne avec son nom, sa catégorie, ses pilotes et sa voiture. Clique sur l’équipage pour ouvrir son détail et voir les disponibilités.</p><div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en préparation.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme finalisée.</small></div></div>`),
    helpItem(10, 'Retrouver mes inscriptions', `<p>Le bouton <strong>Mes inscriptions</strong> regroupe les courses et les départs auxquels tu es inscrit. Clique sur une inscription pour revenir directement sur la course concernée.</p>`),
    helpItem(11, 'Mes droits en tant que pilote', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>consulter les événements, pilotes et équipages ;</li><li>t’inscrire à un départ ;</li><li>indiquer tes heures, catégories et préférences ;</li><li>modifier ou supprimer tes propres inscriptions avant verrouillage ;</li><li>retrouver tes inscriptions personnelles.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>créer ou modifier une course ;</li><li>composer ou modifier les équipages ;</li><li>affecter les autres pilotes ;</li><li>gérer les rôles des membres ;</li><li>supprimer un événement.</li></ul></div></div>`),
    helpItem(12, 'À quoi sert un organisateur ?', `<p>Les organisateurs préparent les courses et composent les équipages. Ils peuvent créer et modifier les événements, inscrire un pilote si nécessaire, choisir les voitures d’équipage, affecter les pilotes et vérifier que la course est correctement couverte.</p><div class="help-callout"><strong>Besoin d’aide ?</strong><p>Contacte un organisateur si tes disponibilités ont changé après verrouillage, si tu rencontres un problème avec ton inscription ou ton équipage, si une affectation semble incorrecte, ou si tu as une situation particulière à expliquer.</p></div>`, true)
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
    helpItem(1, 'Comprendre le rôle organisateur', `<p>Un organisateur possède les droits d’un pilote et les outils nécessaires pour préparer les événements, suivre les inscriptions et constituer les équipages.</p><p>L’objectif est de transformer les disponibilités et préférences des pilotes en équipages cohérents et capables de couvrir toute la course.</p>`),
    helpItem(2, 'Créer un événement', `<p>Depuis la navigation, utilise <strong>+ Événement</strong>. Renseigne le nom, la durée, le type d’événement et le circuit, puis choisis les catégories ouvertes et ajoute les différents départs possibles.</p><p>La durée choisie détermine le nombre d’heures affichées dans les disponibilités des pilotes.</p>`),
    helpItem(3, 'Modifier un événement', `<p>Dans une course, utilise <strong>Modifier l’événement</strong> pour mettre à jour les informations, les catégories ou les départs. Certaines suppressions sont bloquées lorsqu’elles toucheraient des inscriptions déjà existantes.</p><div class="help-tip"><strong>Important :</strong> si tu modifies un horaire, pense à prévenir les pilotes concernés.</div>`),
    helpItem(4, 'Gérer les différents départs', `<p>Chaque départ possède ses propres inscriptions et ses propres équipages. Ouvre toujours le bon départ avant de travailler sur les pilotes ou la composition des équipes.</p>`),
    helpItem(5, 'Comprendre les inscriptions', `<p>Chaque inscription contient le pseudo du pilote, ses heures de présence, sa catégorie, ses voitures souhaitées et éventuellement un coéquipier préféré. Ces informations servent de base à la composition des équipages.</p>`),
    helpItem(6, 'Inscrire un pilote', `<p>Dans la zone d’inscription du départ, utilise <strong>Inscrire un pilote</strong> lorsqu’un membre t’a donné directement ses informations. Si sa fiche existe déjà, sélectionne-la afin de conserver correctement ses différentes inscriptions.</p>`),
    helpItem(7, 'Inscriptions dans plusieurs catégories', `<p>Un pilote peut proposer plusieurs catégories sur un même départ. Lorsqu’il est affecté à un équipage, la catégorie de cet équipage devient la catégorie retenue et ses autres propositions pour ce départ sont retirées.</p>`),
    helpItem(8, 'Créer un équipage', `<p>Dans l’onglet <strong>Équipages</strong>, ouvre le départ concerné puis crée un équipage. Définis son nom, sa catégorie et la voiture retenue. Les préférences des pilotes sont affichées pour aider à faire le choix.</p>`),
    helpItem(9, 'Affecter les pilotes', `<p>Ajoute les pilotes inscrits compatibles avec la catégorie de l’équipage. Avant l’affectation, vérifie leurs voitures souhaitées, leur éventuel coéquipier préféré et leurs heures de présence.</p><p>Une affectation ne doit pas seulement réunir les bons pilotes : elle doit aussi permettre de couvrir correctement toute la durée de la course.</p>`),
    helpItem(10, 'Gérer les pilotes non affectés', `<p>Les pilotes encore disponibles restent visibles hors des équipages. Utilise cette liste pour vérifier qu’aucun inscrit n’a été oublié et pour repérer les pilotes qui proposent plusieurs catégories.</p>`),
    helpItem(11, 'Vérifier la couverture horaire', `<p>Chaque équipage affiche une ligne correspondant aux heures de la course. Vérifie qu’il existe une présence suffisante sur toutes les périodes avant de considérer l’équipage comme terminé.</p><div class="help-demo-hours" aria-label="Exemple de couverture complète"><span class="is-on">1</span><span class="is-on">2</span><span class="is-on">3</span><span class="is-on">4</span><span class="is-on">5</span><span class="is-on">6</span><span class="is-on">7</span><span class="is-on">8</span></div>`),
    helpItem(12, 'Équipage ouvert ou complet', `<div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>L’équipage est encore en construction et peut continuer à évoluer.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est considérée comme terminée.</small></div></div><p>Utilise ce statut pour permettre à toute l’équipe de voir immédiatement quels équipages demandent encore du travail.</p>`),
    helpItem(13, 'Modifier ou supprimer un équipage', `<p>Tu peux modifier le nom, la voiture, la composition et les paramètres disponibles de l’équipage avant le départ. Retirer un pilote d’un équipage conserve son inscription : il redevient simplement disponible pour une autre affectation.</p><p>Supprimer un équipage conserve également les inscriptions de ses pilotes.</p>`),
    helpItem(14, 'Modifier une inscription que je gère', `<p>Une inscription créée par toi pour un autre pilote apparaît parmi les inscriptions que tu gères. Tu peux la retrouver depuis <strong>Mes inscriptions</strong> et la mettre à jour tant que le départ n’est pas verrouillé.</p>`),
    helpItem(15, 'Mes droits en tant qu’organisateur', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>faire tout ce qu’un pilote peut faire ;</li><li>créer et modifier les événements ;</li><li>inscrire un pilote ;</li><li>créer et modifier les équipages ;</li><li>affecter ou retirer des pilotes ;</li><li>choisir la voiture de l’équipage ;</li><li>contrôler la couverture de la course.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>attribuer ou retirer les rôles des membres ;</li><li>accéder aux fonctions réservées à l’administrateur principal ;</li><li>supprimer définitivement un événement lorsque cette action est réservée à l’administrateur.</li></ul></div></div>`)
  ];

  if (role === 'admin') {
    items.push(helpItem(16, 'Administration du site', `<p>En tant qu’<strong>Administrateur</strong>, tu disposes également des fonctions de gestion des membres et des actions réservées au rôle administrateur.</p><ul><li>Accéder à <strong>Gestion des membres</strong>.</li><li>Attribuer ou retirer le rôle <strong>Organisateur</strong>.</li><li>Conserver le contrôle des droits du site.</li><li>Effectuer les suppressions d’événements réservées à l’administrateur.</li></ul>`));
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
