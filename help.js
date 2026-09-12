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
    : `<p>Tu peux utiliser Endurance Manager sans compte. Après une inscription, conserve ton <strong>lien personnel</strong> : il permet de retrouver et modifier tes inscriptions sur un autre appareil. Garde ce lien privé.</p><p>La création, la gestion et l’adhésion à un équipage nécessitent une connexion Discord afin de savoir qui en est responsable.</p>${helpScreenshot('pilot-connection','Vue réelle du bouton de connexion Discord dans Endurance Manager','Connecte-toi avec Discord pour gérer directement tes équipages.')}`;

  const items = [
    helpItem(1, 'Consulter les événements', `<p>La page <strong>Événements</strong> affiche les courses à venir et les événements archivés. Ouvre une course pour voir son circuit, sa durée, ses catégories, ses différents départs, les pilotes inscrits et les équipages déjà constitués.</p>${helpScreenshot('pilot-events','Vue réelle de la liste des événements','La flèche verte montre la carte de course à ouvrir.')}`),
    helpItem(2, 'Connexion et récupération de mes inscriptions', connectionBody),
    helpItem(3, 'S’inscrire à un départ', `<p>Ouvre le départ qui t’intéresse puis utilise <strong>S’inscrire</strong> ou <strong>Modifier mon inscription</strong>. Renseigne ton pseudo, tes disponibilités, ta catégorie et tes préférences avant de valider.</p><div class="help-tip"><strong>Conseil :</strong> ne coche que les heures pendant lesquelles tu es réellement disponible pour rouler.</div>${helpScreenshots([{name:'pilot-register',alt:'Vue réelle du bouton qui ouvre l’inscription',caption:'Dans le départ, ouvre d’abord ton inscription.'},{name:'pilot-form',alt:'Vue réelle du formulaire d’inscription',caption:'Le formulaire affiché est exactement celui du site.'},{name:'pilot-submit',alt:'Vue réelle du bouton de validation de l’inscription',caption:'Une fois les informations vérifiées, valide ici.'}])}`),
    helpItem(4, 'Choisir ses disponibilités', `<p>La course est découpée heure par heure. Sélectionne chaque heure pendant laquelle tu peux participer. Si tu es disponible du départ jusqu’à l’arrivée, utilise <strong>Toute la course</strong> pour sélectionner l’ensemble de la course d’un coup.</p>${helpScreenshot('pilot-availability','Vue réelle du sélecteur de disponibilités','La flèche indique le bouton « Toute la course ». Tu peux aussi sélectionner les heures une par une.')}`),
    helpItem(5, 'Choisir sa catégorie', `<p>Sélectionne la catégorie dans laquelle tu souhaites participer parmi celles ouvertes par les organisateurs : Hypercar, LMP2, LMP3, GT3, GTE, etc.</p><p>Lorsque plusieurs catégories sont possibles, tu peux proposer ta participation dans plusieurs catégories. Dès que tu rejoins un équipage, que tu crées le tien ou qu’un organisateur t’y affecte, la catégorie de cet équipage devient celle retenue pour ce départ.</p>${helpScreenshot('pilot-category','Vue réelle du choix de catégorie','Choisis directement la catégorie dans cette zone du formulaire.')}`),
    helpItem(6, 'Indiquer ses voitures préférées', `<p>Après avoir choisi une catégorie, sélectionne une ou plusieurs voitures que tu souhaites piloter, ou choisis <strong>Peu importe la voiture</strong>. Ces préférences sont visibles lors de la constitution des équipages et aident le responsable d’équipage ou les organisateurs à choisir la voiture.</p>${helpScreenshot('pilot-cars','Vue réelle des préférences de voiture','Tu peux sélectionner plusieurs voitures ou utiliser « Peu importe la voiture ».')}`),
    helpItem(7, 'Choisir un coéquipier souhaité', `<p>Le champ <strong>Pilote souhaité dans le même équipage</strong> est facultatif. Tu peux y indiquer le pseudo d’un pilote avec lequel tu aimerais rouler. Cette préférence reste visible pour faciliter la formation des équipages.</p>${helpScreenshot('pilot-teammate','Vue réelle du champ de coéquipier souhaité','La flèche indique le champ facultatif à remplir.')}`),
    helpItem(8, 'Modifier ou supprimer son inscription', `<p>Avant le départ, ouvre ton inscription pour mettre à jour tes heures ou tes préférences. Tu peux également te désinscrire tant que l’inscription n’est pas verrouillée.</p><p>Si tu es déjà affecté à un équipage, ta catégorie est fixée par cet équipage, mais tes disponibilités et préférences peuvent encore être mises à jour lorsque le départ est ouvert.</p>${helpScreenshot('pilot-my-entries','Vue réelle d’une inscription depuis Mes inscriptions','Retrouve d’abord la course concernée dans « Mes inscriptions », puis ouvre-la pour modifier ta participation.')}`),
    helpItem(9, 'Créer, rejoindre et gérer un équipage', `<p>Les équipages sont affichés directement dans chaque départ de la course. Un équipage <strong>Ouvert</strong> peut encore accueillir des pilotes ; un équipage <strong>Complet</strong> est verrouillé.</p><p>Après t’être inscrit dans une catégorie, tu peux rejoindre un équipage ouvert compatible ou utiliser <strong>Créer mon équipage</strong>. Si tu crées l’équipage, tu en deviens le responsable et tu peux gérer son nom, sa voiture, son état et sa composition. Tu peux également quitter un équipage sans supprimer ton inscription à la course.</p><div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>Les pilotes compatibles peuvent encore le rejoindre.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est verrouillée.</small></div></div>${helpScreenshots([{name:'pilot-crew',alt:'Vue d’un équipage dans la page Course',caption:'Les équipages sont rattachés directement au départ concerné.'},{name:'pilot-crew-details',alt:'Vue du détail d’un équipage',caption:'Ouvre l’équipage pour voir ses pilotes et la couverture horaire.'}])}`),
    helpItem(10, 'Retrouver mes inscriptions', `<p>Le bouton <strong>Mes inscriptions</strong> regroupe les courses et les départs auxquels tu es inscrit. Clique sur une inscription pour revenir directement sur la course concernée.</p>${helpScreenshot('pilot-my-entries','Vue réelle de Mes inscriptions','Chaque carte correspond à une inscription réelle du pilote.')}`),
    helpItem(11, 'Mes droits en tant que pilote', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>consulter les événements, pilotes et équipages ;</li><li>t’inscrire à un départ et, si tu es connecté, inscrire un autre pilote ;</li><li>indiquer et modifier tes disponibilités et préférences ;</li><li>créer ton propre équipage après ton inscription ;</li><li>rejoindre ou quitter un équipage ouvert compatible ;</li><li>gérer l’équipage dont tu es responsable.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>créer ou modifier une course ;</li><li>modifier un équipage dont tu n’es pas responsable ;</li><li>gérer les rôles des membres ;</li><li>supprimer un événement.</li></ul></div></div>${helpScreenshot('pilot-form','Vue réelle des commandes disponibles au pilote','Le pilote gère sa participation puis son équipage directement depuis la course.')}`),
    helpItem(12, 'À quoi sert un organisateur ?', `<p>Les organisateurs gardent la maîtrise des événements : ils créent et modifient les courses, suivent toutes les inscriptions et supervisent tous les équipages. Ils peuvent intervenir sur n’importe quel équipage, déplacer ou retirer des pilotes et corriger une composition si nécessaire.</p><p>Les pilotes restent libres de former et gérer eux-mêmes leurs équipages ; l’organisateur sert surtout de superviseur et de recours.</p><div class="help-callout"><strong>Besoin d’aide ?</strong><p>Contacte un organisateur si tes disponibilités ont changé après verrouillage, si tu rencontres un problème avec ton inscription ou ton équipage, ou si une affectation semble incorrecte.</p></div>${helpScreenshot('org-home-create','Vue réelle de l’interface supplémentaire d’un organisateur','Un organisateur dispose d’actions supplémentaires pour préparer et superviser la course.')}`, true)
  ];

  return `<section class="${HELP_PAGE_CLASS}">
    <button type="button" class="secondary-button back-button" id="help-back-button">← Retour aux événements</button>
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>AIDE PILOTE</h1>
      <p>Tout ce qu’il faut pour s’inscrire à une course, indiquer ses disponibilités et gérer son équipage.</p>
      <span class="help-account-badge">${accountLabel(role)}</span>
    </header>
    <div class="help-list">${items.join('')}</div>
  </section>`;
}

function organizerHelp(role) {
  const items = [
    helpItem(1, 'Comprendre le rôle organisateur', `<p>Un organisateur possède les droits d’un pilote et les outils nécessaires pour créer les événements, suivre toutes les inscriptions et superviser les équipages.</p><p>Les pilotes peuvent désormais créer, rejoindre et gérer leurs propres équipages. L’organisateur garde cependant un droit de gestion global afin de corriger une composition, aider un pilote ou finaliser l’organisation de la course.</p>${helpScreenshot('org-home-create','Vue réelle de la page événements pour un organisateur','Les outils d’organisation apparaissent directement dans l’interface de l’organisateur.')}`),
    helpItem(2, 'Créer un événement', `<p>Depuis la page Événements, utilise <strong>Ajouter un évènement</strong>. Renseigne le nom, la durée, le type d’événement et le circuit, puis choisis les catégories ouvertes et ajoute les différents départs possibles.</p><p>La durée choisie détermine le nombre d’heures affichées dans les disponibilités des pilotes.</p>${helpScreenshots([{name:'org-home-create',alt:'Vue réelle du bouton Ajouter un évènement',caption:'Commence par « Ajouter un évènement ».'},{name:'org-create-event',alt:'Vue réelle du formulaire de création d’événement',caption:'Tu retrouves ensuite le vrai formulaire de création du site.'}])}`),
    helpItem(3, 'Modifier un événement', `<p>Dans une course, utilise <strong>Modifier l’événement</strong> pour mettre à jour les informations, les catégories ou les départs. Certaines suppressions sont bloquées lorsqu’elles toucheraient des inscriptions déjà existantes.</p><div class="help-tip"><strong>Important :</strong> si tu modifies un horaire, pense à prévenir les pilotes concernés.</div>${helpScreenshot('org-edit-event','Vue réelle du bouton Modifier l’événement','La flèche montre le bouton exact dans la course.')}`),
    helpItem(4, 'Gérer les différents départs', `<p>Chaque départ possède ses propres inscriptions et ses propres équipages. Ouvre toujours le bon départ avant de travailler sur les pilotes ou la composition des équipes.</p>${helpScreenshot('org-departure','Vue réelle d’un départ de course','Clique sur le départ que tu veux gérer avant de modifier les inscriptions ou équipages.')}`),
    helpItem(5, 'Comprendre les inscriptions', `<p>Chaque inscription contient le pseudo du pilote, ses heures de présence, sa catégorie, ses voitures souhaitées et éventuellement un coéquipier préféré. Ces informations servent de base aux pilotes responsables d’équipage comme aux organisateurs.</p>${helpScreenshot('org-managed-entry','Vue réelle d’une inscription gérée par un organisateur','Les inscriptions que tu gères restent identifiables depuis ton espace.')}`),
    helpItem(6, 'Inscrire un autre pilote', `<p>Dans le départ, utilise <strong>Inscrire un autre pilote</strong> lorsqu’un membre t’a donné directement ses informations. Si son compte Discord existe déjà, sélectionne-le afin que l’inscription soit correctement rattachée à son identité.</p><p>Cette fonction est aussi disponible aux pilotes connectés ; l’organisateur garde en plus le droit de modifier toutes les inscriptions si une correction est nécessaire.</p>${helpScreenshot('org-add-pilot','Vue réelle du bouton Inscrire un pilote','La flèche indique l’action permettant d’inscrire un autre pilote.')}`),
    helpItem(7, 'Inscriptions dans plusieurs catégories', `<p>Un pilote peut proposer plusieurs catégories sur un même départ. Lorsqu’il rejoint, crée ou est affecté à un équipage, la catégorie de cet équipage devient la catégorie retenue et ses autres propositions pour ce départ sont retirées.</p>${helpScreenshot('pilot-category','Vue réelle du choix de catégorie dans une inscription','Les catégories proposées viennent directement du formulaire réel d’inscription.')}`),
    helpItem(8, 'Créer ou superviser un équipage', `<p>Dans chaque départ, <strong>Créer un équipage</strong> permet à l’organisateur de préparer un équipage même sans y être inscrit. Un pilote inscrit peut de son côté utiliser <strong>Créer mon équipage</strong> et en devient automatiquement responsable.</p><p>L’organisateur peut toujours reprendre la main sur n’importe quel équipage si nécessaire.</p>${helpScreenshot('org-create-crew','Vue réelle du créateur d’équipage','La création d’équipage reste contextualisée au départ concerné.')}`),
    helpItem(9, 'Affecter et déplacer les pilotes', `<p>Tu peux ajouter ou retirer les pilotes inscrits compatibles avec la catégorie de l’équipage, même si tu n’en es pas le responsable. Avant une intervention, vérifie leurs voitures souhaitées, leur éventuel coéquipier préféré et leurs heures de présence.</p><p>Les pilotes peuvent aussi rejoindre eux-mêmes un équipage ouvert avec leur propre inscription.</p>${helpScreenshot('org-assign-pilot','Vue réelle de l’affectation d’un pilote à un équipage','L’organisateur peut intervenir lorsque la composition nécessite une correction.')}`),
    helpItem(10, 'Gérer les pilotes non affectés', `<p>Les pilotes encore disponibles restent visibles dans <strong>Pilotes sans équipage</strong>. Utilise cette liste pour vérifier qu’aucun inscrit n’a été oublié et pour repérer les pilotes qui peuvent encore rejoindre ou créer un équipage.</p>${helpScreenshot('org-unassigned','Vue réelle des pilotes non affectés','Cette zone permet de repérer immédiatement les pilotes restant sans équipage.')}`),
    helpItem(11, 'Vérifier la couverture horaire', `<p>Chaque équipage affiche la disponibilité de ses pilotes et une ligne de couverture de la course. Vérifie qu’il existe une présence suffisante sur toutes les périodes avant de considérer l’équipage comme terminé.</p>${helpScreenshot('org-coverage','Vue réelle de la couverture horaire d’un équipage','La timeline permet de vérifier les heures couvertes par les pilotes.')}`),
    helpItem(12, 'Équipage ouvert ou complet', `<div class="help-status-grid"><div><span class="help-lock">🔓</span><strong>Ouvert</strong><small>Les pilotes compatibles peuvent encore le rejoindre.</small></div><div><span class="help-lock">🔒</span><strong>Équipage complet</strong><small>La composition est verrouillée.</small></div></div><p>Le responsable de l’équipage peut changer cet état. L’organisateur peut également intervenir sur le statut de n’importe quel équipage.</p>${helpScreenshot('org-crew-status','Vue réelle du menu de statut de l’équipage','Le menu permet de passer entre « Ouvert » et « Complet ».')}`),
    helpItem(13, 'Modifier ou supprimer un équipage', `<p>Tu peux modifier ou supprimer n’importe quel équipage avant le départ. Retirer un pilote d’un équipage conserve son inscription : il redevient simplement disponible dans <strong>Pilotes sans équipage</strong>.</p><p>Supprimer un équipage conserve également les inscriptions de ses pilotes. Le responsable d’un équipage dispose des mêmes actions de gestion sur son propre équipage.</p>${helpScreenshot('org-crew-actions','Vue réelle des actions d’un équipage','Les actions restent directement attachées à la carte de l’équipage.')}`),
    helpItem(14, 'Modifier une inscription que je gère', `<p>Une inscription créée par toi pour un autre pilote apparaît parmi les inscriptions que tu gères. Tu peux aussi modifier les inscriptions des autres pilotes en tant qu’organisateur, tant que le départ n’est pas verrouillé.</p>${helpScreenshot('org-managed-entry','Vue réelle des inscriptions gérées','Retrouve les inscriptions concernées depuis la course ou Mes inscriptions.')}`),
    helpItem(15, 'Mes droits en tant qu’organisateur', `<div class="help-rights"><div><strong>Tu peux</strong><ul><li>faire tout ce qu’un pilote peut faire ;</li><li>créer et modifier les événements ;</li><li>inscrire un autre pilote et modifier les inscriptions ;</li><li>créer et gérer tous les équipages ;</li><li>affecter ou retirer des pilotes ;</li><li>choisir la voiture et le statut des équipages ;</li><li>contrôler la couverture de la course.</li></ul></div><div><strong>Tu ne peux pas</strong><ul><li>attribuer ou retirer les rôles des membres ;</li><li>accéder aux fonctions réservées à l’administrateur principal ;</li><li>supprimer définitivement un événement.</li></ul></div></div>${helpScreenshot('org-crew-overview','Vue réelle de la gestion des équipages','L’organisateur supervise les équipages directement dans chaque départ de la course.')}`)
  ];

  if (role === 'admin') {
    items.push(helpItem(16, 'Administration du site', `<p>En tant qu’<strong>Administrateur</strong>, tu disposes également des fonctions de gestion des membres et des actions réservées au rôle administrateur.</p><ul><li>Accéder à <strong>Gestion des membres</strong>.</li><li>Attribuer ou retirer le rôle <strong>Organisateur</strong>.</li><li>Conserver le contrôle des droits du site.</li><li>Supprimer définitivement un événement.</li></ul>${helpScreenshot('admin-members','Vue réelle de la gestion des membres','La flèche montre le sélecteur de rôle réel utilisé par l’administrateur.')}`));
  }

  const title = role === 'admin' ? 'AIDE ORGANISATEUR & ADMINISTRATION' : 'AIDE ORGANISATEUR';
  const subtitle = role === 'admin'
    ? 'Gérer les courses, les équipages et les droits d’Endurance Manager.'
    : 'Créer les courses, suivre les inscriptions et superviser les équipages.';

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
