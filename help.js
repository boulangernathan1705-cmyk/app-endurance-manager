// Help page content. Written directly in French and English (L(fr, en)) instead of going through the
// text dictionary, so it stays readable and complete in both languages.
// Screenshots come from scripts/help-screenshots.mjs (images/help/*.jpg) and must be regenerated
// whenever the screens they show change.
import {getLocale} from './front/i18n.mjs';

const HELP_PAGE_CLASS = 'help-page';
const app = document.getElementById('app');
// Session user given by the page ({id,name,role} or null): the help adapts to the pilot's role.
let currentUser = null;

const L = (fr, en) => getLocale() === 'en' ? en : fr;

function normalizedRole() {
  const role = currentUser?.role;
  return role === 'admin' || role === 'organizer' ? role : 'pilot';
}

function roleName(role) {
  return role === 'admin' ? L('Administrateur', 'Administrator') : role === 'organizer' ? L('Organisateur', 'Organizer') : L('Pilote', 'Driver');
}

function accountLabel(role) {
  if (!currentUser) return L('Utilisation sans connexion', 'Using the site without signing in');
  return `${currentUser.name} · ${roleName(role)}`;
}

function helpScreenshot(name, alt, caption = '') {
  return `<figure class="help-screenshot">
    <img src="/images/help/${name}.jpg?v=2" alt="${alt}" loading="lazy" decoding="async">
    ${caption ? `<figcaption>${caption}</figcaption>` : ''}
  </figure>`;
}

function helpItem(index, title, body, open = false) {
  return `<details class="help-item"${open ? ' open' : ''}>
    <summary><span class="help-index">${String(index).padStart(2, '0')}</span><span>${title}</span><span class="help-chevron" aria-hidden="true">⌄</span></summary>
    <div class="help-item-body">${body}</div>
  </details>`;
}

const numbered = items => items.map((body, index) => helpItem(index + 1, body[0], body[1], body[2]));

// ---------- Shared sections (pilots and organizers) ----------

const navigationSection = () => [L('Se repérer sur le site', 'Finding your way around'), `
  <p>${L('La même barre est en haut de toutes les pages :', 'The same bar sits at the top of every page:')}</p>
  <ul>
    <li>${L('le <strong>drapeau</strong> change la langue (français / anglais) ;', 'the <strong>flag</strong> switches the language (French / English);')}</li>
    <li>${L('<strong>Le Mans Ultimate</strong> / <strong>iRacing</strong> choisit le simulateur ;', '<strong>Le Mans Ultimate</strong> / <strong>iRacing</strong> picks the simulator;')}</li>
    <li>${L('<strong>Événements</strong> liste les courses, <strong>Mes inscriptions</strong> regroupe les tiennes ;', '<strong>Events</strong> lists the races, <strong>My entries</strong> gathers yours;')}</li>
    <li>${L('à droite, ton <strong>compte</strong> : connexion Discord, Aide, et selon ton rôle Gestion des membres.', 'on the right, your <strong>account</strong>: Discord sign-in, Help and, depending on your role, Member management.')}</li>
  </ul>
  <p>${L('Le logo de la bannière ramène à l’accueil. Le bouton Retour du navigateur fonctionne normalement, et chaque course a sa propre adresse : <strong>Copier le lien de la course</strong> permet de la partager.', 'The banner logo takes you back home. Your browser’s Back button works as usual, and every race has its own address: <strong>Copy race link</strong> lets you share it.')}</p>
  ${helpScreenshot('pilot-navigation', L('Barre de navigation', 'Navigation bar'))}`];

const raceListSection = () => [L('Lire la liste des courses', 'Reading the race list'), `
  <p>${L('Chaque carte résume une course :', 'Each card sums up a race:')}</p>
  <ul>
    <li>${L('le <strong>carré de date</strong> indique le jour du prochain départ ;', 'the <strong>date block</strong> shows the day of the next start;')}</li>
    <li>${L('en dessous, les <strong>heures de départ</strong>, regroupées par jour ;', 'below it, the <strong>start times</strong>, grouped by day;')}</li>
    <li>${L('un badge montre <strong>ta situation</strong> : inscrit sans équipage, ou le nom de ton équipage ;', 'a badge shows <strong>where you stand</strong>: registered without a crew, or your crew’s name;')}</li>
    <li>${L('« <strong>Horaires à confirmer</strong> » signale des dates ou heures qui peuvent encore changer ;', '“<strong>Schedule to be confirmed</strong>” flags dates or times that may still change;')}</li>
    <li>${L('les catégories affichent le nombre d’inscrits.', 'categories show how many drivers are registered.')}</li>
  </ul>
  <p>${L('Les filtres <strong>À venir</strong>, <strong>Mes courses</strong> (celles où tu es inscrit) et <strong>Archivés</strong> (courses terminées) sont au-dessus de la liste.', 'The <strong>Upcoming</strong>, <strong>My races</strong> (the ones you entered) and <strong>Archived</strong> (finished races) filters are above the list.')}</p>
  ${helpScreenshot('pilot-events', L('Liste des courses', 'Race list'))}`];

const racePageSection = () => [L('La page d’une course', 'A race page'), `
  <p>${L('L’en-tête reprend la carte de la course avec le compte à rebours du prochain départ. Plus bas, chaque <strong>départ</strong> a sa ligne : sa date, son heure, le nombre de pilotes et d’équipages, et les actions possibles.', 'The header repeats the race card with a countdown to the next start. Below, each <strong>start</strong> has its own row: its date and time, how many drivers and crews it has, and what you can do.')}</p>
  <p>${L('Les départs où tu es inscrit sont encadrés et portent un badge « ✓ Inscrit ». Ouvre un départ pour voir ses équipages et les pilotes sans équipage. Les départs déjà commencés passent dans <strong>Départs passés</strong> : ils restent consultables mais ne sont plus modifiables.', 'Starts you entered are outlined and carry a “✓ Registered” badge. Open a start to see its crews and drivers without a crew. Starts that have begun move to <strong>Past starts</strong>: you can still view them but not change them.')}</p>
  ${helpScreenshot('pilot-race', L('En-tête d’une course', 'Race header'))}
  ${helpScreenshot('pilot-departure', L('Un départ', 'A start'), L('Un seul bouton principal par départ ; les autres actions sont des liens.', 'One main button per start; other actions are links.'))}`];

const autoRefreshSection = () => [L('Mise à jour automatique', 'Automatic updates'), `
  <p>${L('Les inscriptions et les équipages se mettent à jour tout seuls environ toutes les minutes, et quand tu reviens sur l’onglet. Ce qui est ouvert reste ouvert. La mise à jour attend que tu aies fini si tu es en train de remplir une fenêtre.', 'Entries and crews update by themselves about every minute, and when you come back to the tab. Whatever is open stays open. Updates wait while you are filling in a window.')}</p>`];

// ---------- Pilot help ----------

function pilotHelp(role) {
  const connectionBody = currentUser
    ? `<p>${L('Tu es connecté avec Discord. Tes inscriptions sont rattachées à ton compte et tu les retrouves sur tous tes appareils dans <strong>Mes inscriptions</strong>.', 'You are signed in with Discord. Your entries are linked to your account and you can find them on any device in <strong>My entries</strong>.')}</p>`
    : `<p>${L('Tu peux t’inscrire sans compte. Après ton inscription, garde ton <strong>lien personnel</strong> : il permet de retrouver et modifier tes inscriptions sur un autre appareil. Garde-le privé.', 'You can register without an account. After registering, keep your <strong>personal link</strong>: it lets you find and edit your entries on another device. Keep it private.')}</p>
       <p>${L('Créer, rejoindre ou gérer un équipage demande une connexion Discord, pour savoir qui en est responsable. Après la connexion, tu reviens sur la page que tu consultais.', 'Creating, joining or managing a crew requires a Discord sign-in, so everyone knows who is in charge. After signing in, you come back to the page you were on.')}</p>`;

  const items = numbered([
    navigationSection(),
    raceListSection(),
    racePageSection(),
    [L('Connexion et lien personnel', 'Sign-in and personal link'), connectionBody],
    [L('S’inscrire à un départ', 'Registering for a start'), `
      <p>${L('Dans le départ choisi, clique sur <strong>S’inscrire</strong>. Une fenêtre te guide en 4 étapes : <strong>Catégorie</strong>, <strong>Voiture(s)</strong>, <strong>Heures de présence</strong>, puis <strong>Récapitulatif</strong>. <strong>Continuer</strong> passe à l’étape suivante, <strong>Retour</strong> revient en arrière.', 'In the chosen start, click <strong>Register</strong>. A window guides you through 4 steps: <strong>Category</strong>, <strong>Car(s)</strong>, <strong>Hours present</strong>, then <strong>Summary</strong>. <strong>Continue</strong> goes to the next step, <strong>Back</strong> goes back.')}</p>
      <p>${L('<strong>Fermer</strong>, la touche Échap ou un clic à côté de la fenêtre la ferment sans rien enregistrer.', '<strong>Close</strong>, the Escape key or a click outside the window close it without saving anything.')}</p>
      ${helpScreenshot('pilot-register-category', L('Étape 1 : la catégorie', 'Step 1: category'))}`],
    [L('Catégorie et voitures', 'Category and cars'), `
      <p>${L('Choisis la catégorie dans laquelle tu veux rouler, parmi celles ouvertes par les organisateurs. Tu pourras en proposer une autre ensuite : la catégorie retenue sera celle de l’équipage que tu rejoins.', 'Pick the category you want to race in, among the ones opened by the organizers. You can offer another one later: the category kept is the one of the crew you join.')}</p>
      <p>${L('Coche ensuite une ou plusieurs voitures, ou <strong>Peu importe la voiture</strong>. Ces préférences aident à choisir la voiture de l’équipage.', 'Then tick one or more cars, or <strong>Any car</strong>. These preferences help choose the crew’s car.')}</p>
      ${helpScreenshot('pilot-register-cars', L('Étape 2 : les voitures', 'Step 2: cars'))}`],
    [L('Heures de présence', 'Hours present'), `
      <p>${L('La course est découpée heure par heure, avec l’heure réelle au-dessus. Touche chaque heure où tu peux rouler, ou <strong>Toute la course</strong> si tu es là du départ à l’arrivée. Le résumé sous la frise indique les plages choisies, par exemple « 5h–8h (3 h) ».', 'The race is split hour by hour, with the real time above. Tap each hour you can drive, or <strong>Whole race</strong> if you are there from start to finish. The summary under the timeline shows the chosen ranges, for example “5h–8h (3 h)”.')}</p>
      <div class="help-tip">${L('<strong>Conseil :</strong> ne coche que les heures où tu es vraiment disponible, c’est ce qui sert à organiser les relais.', '<strong>Tip:</strong> only tick the hours when you are really available; that is what relay planning relies on.')}</div>
      ${helpScreenshot('pilot-register-hours', L('Étape 3 : les heures de présence', 'Step 3: hours present'))}`],
    [L('Récapitulatif et coéquipier souhaité', 'Summary and preferred teammate'), `
      <p>${L('Le récapitulatif reprend tes choix ; chaque ligne a un lien <strong>Modifier</strong> qui ramène à son étape. Le champ <strong>Pilote souhaité</strong> est facultatif : indique le pseudo d’un pilote avec qui tu aimerais rouler. Valide pour enregistrer.', 'The summary lists your choices; each row has an <strong>Edit</strong> link back to its step. The <strong>Preferred driver</strong> field is optional: enter the name of a driver you would like to race with. Confirm to save.')}</p>
      ${helpScreenshot('pilot-register-summary', L('Étape 4 : le récapitulatif', 'Step 4: summary'))}`],
    [L('Modifier ou retirer son inscription', 'Editing or withdrawing your entry'), `
      <p>${L('Tant que le départ n’a pas commencé, <strong>Modifier mon inscription</strong> rouvre la même fenêtre. Le bouton <strong>Se désinscrire</strong> est dans le récapitulatif.', 'Until the start begins, <strong>Edit my entry</strong> reopens the same window. The <strong>Withdraw</strong> button is in the summary.')}</p>
      <p>${L('Si tu es dans un équipage, ta catégorie est celle de l’équipage ; tes heures et tes préférences restent modifiables.', 'If you are in a crew, your category is the crew’s; your hours and preferences can still be changed.')}</p>`],
    [L('Les équipages d’un départ', 'Crews of a start'), `
      <p>${L('Chaque équipage est une carte avec sa couleur (la même partout sur le site), sa catégorie, ses pilotes et sa voiture. Le badge <strong>Places libres</strong> signifie qu’on peut encore le rejoindre ; <strong>Complet</strong> qu’il est fermé. Ton équipage porte le badge « Ton équipage ».', 'Each crew is a card with its own color (the same everywhere on the site), its category, drivers and car. <strong>Open seats</strong> means you can still join it; <strong>Complete</strong> means it is closed. Your crew carries the “Your crew” badge.')}</p>
      <ul>
        <li>${L('<strong>Rejoindre</strong> : entre dans un équipage de ta catégorie qui a des places libres ;', '<strong>Join</strong>: enter a crew of your category that has open seats;')}</li>
        <li>${L('<strong>Quitter</strong> : sort de l’équipage, ton inscription est conservée ;', '<strong>Leave</strong>: exits the crew, your entry is kept;')}</li>
        <li>${L('<strong>Créer un équipage</strong> (dans le départ) : tu en deviens le responsable.', '<strong>Create a crew</strong> (in the start): you become its owner.')}</li>
      </ul>
      ${helpScreenshot('pilot-crews', L('Les équipages d’un départ', 'Crews of a start'))}`],
    [L('Ouvrir un équipage : qui roule quand ?', 'Opening a crew: who drives when?'), `
      <p>${L('Clique sur un équipage pour voir la frise horaire de chaque pilote. Si personne n’est prévu sur une période, un message rouge l’indique, par exemple « Aucun pilote de 2h à 4h ».', 'Click a crew to see each driver’s timeline. If nobody is planned during a period, a red message says so, for example “No driver from 2h to 4h”.')}</p>
      ${helpScreenshot('pilot-crew-open', L('Un équipage ouvert', 'An opened crew'))}`],
    [L('Pilotes sans équipage', 'Drivers without a crew'), `
      <p>${L('Sous les équipages, <strong>Pilotes sans équipage</strong> liste les inscrits encore libres, avec leurs heures. Pratique pour trouver un coéquipier.', 'Below the crews, <strong>Drivers without a crew</strong> lists the drivers still free, with their hours. Handy to find a teammate.')}</p>
      ${helpScreenshot('pilot-unassigned', L('Pilotes sans équipage', 'Drivers without a crew'))}`],
    [L('Mes inscriptions', 'My entries'), `
      <p>${L('<strong>Mes inscriptions</strong> montre une carte par départ à venir. Ouvre-la pour voir en trois colonnes : <strong>Mon équipage</strong> (avec les heures de chacun), les <strong>autres équipages</strong> et les <strong>pilotes sans équipage</strong>. <strong>Voir la course</strong> ouvre la page de la course. Les courses terminées sont dans le filtre <strong>Archivés</strong>.', '<strong>My entries</strong> shows one card per upcoming start. Open it to see three columns: <strong>My crew</strong> (with everyone’s hours), the <strong>other crews</strong> and the <strong>drivers without a crew</strong>. <strong>View race</strong> opens the race page. Finished races are under the <strong>Archived</strong> filter.')}</p>
      ${helpScreenshot('pilot-my-entries', L('Une carte de Mes inscriptions', 'A card in My entries'))}`],
    autoRefreshSection(),
    [L('Mes droits en tant que pilote', 'My rights as a driver'), `<div class="help-rights"><div><strong>${L('Tu peux', 'You can')}</strong><ul>
        <li>${L('consulter les courses, les pilotes et les équipages ;', 'view races, drivers and crews;')}</li>
        <li>${L('t’inscrire à un départ et, si tu es connecté, inscrire un autre pilote ;', 'register for a start and, when signed in, register another driver;')}</li>
        <li>${L('modifier tes heures et tes préférences avant le départ ;', 'change your hours and preferences before the start;')}</li>
        <li>${L('créer ton équipage, rejoindre ou quitter un équipage de ta catégorie ;', 'create your crew, join or leave a crew of your category;')}</li>
        <li>${L('gérer l’équipage dont tu es responsable.', 'manage the crew you own.')}</li></ul></div>
      <div><strong>${L('Tu ne peux pas', 'You cannot')}</strong><ul>
        <li>${L('créer ou modifier une course ;', 'create or edit a race;')}</li>
        <li>${L('gérer un équipage dont tu n’es pas responsable ;', 'manage a crew you do not own;')}</li>
        <li>${L('modifier une inscription après le début du départ.', 'change an entry once the start has begun.')}</li></ul></div></div>`],
    [L('À quoi sert un organisateur ?', 'What is an organizer for?'), `
      <p>${L('Les organisateurs créent et modifient les courses, suivent toutes les inscriptions et peuvent intervenir sur n’importe quel équipage. Les pilotes restent libres de former leurs équipages ; l’organisateur sert de superviseur et de recours.', 'Organizers create and edit races, follow every entry and can step in on any crew. Drivers stay free to form their crews; the organizer supervises and helps when needed.')}</p>
      <div class="help-callout"><strong>${L('Besoin d’aide ?', 'Need help?')}</strong><p>${L('Contacte un organisateur si ton départ a commencé et que tu dois changer quelque chose, ou si une affectation semble incorrecte.', 'Contact an organizer if your start has begun and something must change, or if an assignment looks wrong.')}</p></div>`, true]
  ]);

  return `<section class="${HELP_PAGE_CLASS}">
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>${L('AIDE PILOTE', 'DRIVER HELP')}</h1>
      <p>${L('S’inscrire à une course, indiquer ses heures et s’organiser en équipage.', 'Register for a race, give your hours and organize your crew.')}</p>
      <span class="help-account-badge">${accountLabel(role)}</span>
    </header>
    <div class="help-list">${items.join('')}</div>
  </section>`;
}

// ---------- Organizer and administrator help ----------

function organizerHelp(role) {
  const sections = [
    [L('Le rôle d’organisateur', 'The organizer role'), `
      <p>${L('Un organisateur a tous les droits d’un pilote, plus les outils pour créer les courses, suivre toutes les inscriptions et superviser les équipages. Les pilotes forment eux-mêmes leurs équipages ; tu peux corriger une composition, aider un pilote ou finaliser l’organisation.', 'An organizer has every driver right, plus the tools to create races, follow every entry and supervise crews. Drivers form their own crews; you can fix a lineup, help a driver or finalize the organization.')}</p>`],
    navigationSection(),
    raceListSection(),
    [L('Créer un événement', 'Creating an event'), `
      <p>${L('Sur la page Événements, <strong>Ajouter un événement</strong> ouvre une fenêtre en 4 étapes : <strong>Informations générales</strong> (nom, durée, type, circuit), <strong>Catégories</strong>, <strong>Départs</strong> et <strong>Récapitulatif</strong>.', 'On the Events page, <strong>Add an event</strong> opens a 4-step window: <strong>General information</strong> (name, duration, type, circuit), <strong>Categories</strong>, <strong>Starts</strong> and <strong>Summary</strong>.')}</p>
      <ul>
        <li>${L('la date se choisit dans un calendrier, l’heure dans deux listes (minutes de 5 en 5), toujours à l’heure de Paris ;', 'the date is picked in a calendar, the time in two lists (5-minute steps), always in Paris time;')}</li>
        <li>${L('<strong>+ Ajouter un départ</strong> reprend la date et l’heure du départ précédent, à ajuster ;', '<strong>+ Add a start</strong> copies the previous start’s date and time, to adjust;')}</li>
        <li>${L('coche <strong>Horaires à confirmer</strong> tant que les dates peuvent changer : un badge l’affiche sur la course ;', 'tick <strong>Schedule to be confirmed</strong> while dates may change: a badge shows it on the race;')}</li>
        <li>${L('la durée fixe le nombre d’heures proposées aux pilotes.', 'the duration sets how many hours drivers can pick.')}</li>
      </ul>
      ${helpScreenshot('org-create-event', L('Étape 1 : informations générales', 'Step 1: general information'))}
      ${helpScreenshot('org-create-departures', L('Étape 3 : les départs', 'Step 3: starts'))}`],
    [L('Modifier, partager ou supprimer une course', 'Editing, sharing or deleting a race'), `
      <p>${L('Les actions de la course sont dans son en-tête : <strong>Copier le lien de la course</strong>, <strong>Modifier l’événement</strong> (la même fenêtre en étapes) et, pour l’administrateur, <strong>Supprimer l’événement</strong> (lien rouge, avec confirmation). Certaines suppressions sont bloquées si elles toucheraient des inscriptions existantes.', 'Race actions are in its header: <strong>Copy race link</strong>, <strong>Edit event</strong> (the same step window) and, for the administrator, <strong>Delete event</strong> (red link, with confirmation). Some removals are blocked when they would affect existing entries.')}</p>
      <div class="help-tip">${L('<strong>Important :</strong> si tu changes un horaire, préviens les pilotes concernés.', '<strong>Important:</strong> if you change a start time, tell the drivers concerned.')}</div>
      ${helpScreenshot('org-race-actions', L('Actions de la course dans l’en-tête', 'Race actions in the header'))}`],
    racePageSection(),
    [L('Inscrire un autre pilote', 'Registering another driver'), `
      <p>${L('Dans un départ, <strong>Inscrire un autre pilote</strong> ouvre la même fenêtre d’inscription, avec une première étape <strong>Pilote et catégorie</strong> : choisis son compte Discord dans la liste s’il en a un, sinon saisis son pseudo. Les pilotes connectés ont aussi accès à cette fonction.', 'In a start, <strong>Register another driver</strong> opens the same registration window, with a first <strong>Driver and category</strong> step: pick their Discord account from the list if they have one, otherwise type their name. Signed-in drivers can use it too.')}</p>
      ${helpScreenshot('org-add-pilot', L('Inscrire un autre pilote', 'Registering another driver'))}`],
    [L('Plusieurs catégories', 'Several categories'), `
      <p>${L('Un pilote peut proposer plusieurs catégories sur un même départ. Dès qu’il entre dans un équipage, la catégorie de l’équipage est retenue et ses autres propositions pour ce départ sont retirées.', 'A driver can offer several categories on the same start. As soon as they join a crew, the crew’s category is kept and their other offers for that start are removed.')}</p>`],
    [L('Créer un équipage', 'Creating a crew'), `
      <p>${L('<strong>Créer un équipage</strong> ouvre une fenêtre en 3 étapes : <strong>Équipage</strong> (nom, catégorie, voiture), <strong>Pilotes</strong> (les inscrits compatibles, avec la couverture horaire prévue) et <strong>Récapitulatif</strong>. Un organisateur peut créer un équipage sans y être inscrit ; un pilote qui crée son équipage en devient responsable.', '<strong>Create a crew</strong> opens a 3-step window: <strong>Crew</strong> (name, category, car), <strong>Drivers</strong> (compatible registered drivers, with the expected coverage) and <strong>Summary</strong>. An organizer can create a crew without being registered; a driver who creates their crew becomes its owner.')}</p>
      ${helpScreenshot('org-create-crew', L('Créer un équipage', 'Creating a crew'))}`],
    [L('Composer et suivre les équipages', 'Building and following crews'), `
      <p>${L('Sur la carte d’un équipage, <strong>Gérer</strong> rouvre la fenêtre pour changer le nom, la voiture ou les pilotes ; tu peux le faire sur n’importe quel équipage. Retirer un pilote conserve son inscription : il revient dans <strong>Pilotes sans équipage</strong>.', 'On a crew card, <strong>Manage</strong> reopens the window to change the name, car or drivers; you can do it on any crew. Removing a driver keeps their entry: they go back to <strong>Drivers without a crew</strong>.')}</p>
      <p>${L('Ouvre l’équipage pour vérifier les heures de chacun : un message rouge signale les périodes sans pilote. Le sélecteur <strong>Ouvert / Complet</strong> décide si d’autres pilotes peuvent encore le rejoindre.', 'Open the crew to check everyone’s hours: a red message flags periods with no driver. The <strong>Open / Complete</strong> selector decides whether other drivers can still join.')}</p>
      ${helpScreenshot('pilot-crew-open', L('Un équipage ouvert avec une période non couverte', 'An opened crew with an uncovered period'))}
      ${helpScreenshot('pilot-unassigned', L('Pilotes sans équipage', 'Drivers without a crew'))}`],
    [L('Supprimer un équipage', 'Deleting a crew'), `
      <p>${L('<strong>Supprimer</strong> (lien rouge sur la carte) supprime l’équipage après confirmation. Les inscriptions de ses pilotes sont conservées. Une fois le départ commencé, les équipages sont figés.', '<strong>Delete</strong> (red link on the card) removes the crew after confirmation. Its drivers’ entries are kept. Once the start has begun, crews are frozen.')}</p>`],
    [L('Inscriptions que je gère', 'Entries I manage'), `
      <p>${L('Les inscriptions que tu as faites pour d’autres pilotes apparaissent dans <strong>Mes inscriptions</strong>, sous « Inscriptions que je gère ». En tant qu’organisateur, tu peux aussi modifier les inscriptions des autres pilotes tant que le départ n’a pas commencé.', 'Entries you made for other drivers appear in <strong>My entries</strong>, under “Entries I manage”. As an organizer, you can also edit other drivers’ entries until the start begins.')}</p>
      ${helpScreenshot('pilot-my-entries', L('Mes inscriptions', 'My entries'))}`],
    autoRefreshSection(),
    [L('Mes droits en tant qu’organisateur', 'My rights as an organizer'), `<div class="help-rights"><div><strong>${L('Tu peux', 'You can')}</strong><ul>
        <li>${L('faire tout ce qu’un pilote peut faire ;', 'do everything a driver can;')}</li>
        <li>${L('créer et modifier les courses ;', 'create and edit races;')}</li>
        <li>${L('inscrire d’autres pilotes et modifier les inscriptions ;', 'register other drivers and edit entries;')}</li>
        <li>${L('créer, composer et fermer tous les équipages.', 'create, build and close every crew.')}</li></ul></div>
      <div><strong>${L('Tu ne peux pas', 'You cannot')}</strong><ul>
        <li>${L('attribuer ou retirer les rôles des membres ;', 'give or remove member roles;')}</li>
        <li>${L('supprimer définitivement une course.', 'permanently delete a race.')}</li></ul></div></div>`]
  ];

  if (role === 'admin') {
    sections.push([L('Gestion des membres', 'Member management'), `
      <p>${L('Menu du compte → <strong>Gestion des membres</strong>. Chaque pilote apparaît après sa première connexion Discord. Change son rôle (<strong>Pilote</strong> ou <strong>Organisateur</strong>) dans la liste : c’est enregistré aussitôt, « ✓ Enregistré » le confirme. Le champ de recherche retrouve un pilote par son pseudo ou son identifiant Discord.', 'Account menu → <strong>Member management</strong>. Each driver appears after their first Discord sign-in. Change their role (<strong>Driver</strong> or <strong>Organizer</strong>) in the list: it is saved at once, “✓ Saved” confirms it. The search field finds a driver by name or Discord identifier.')}</p>
      ${helpScreenshot('admin-members', L('Gestion des membres', 'Member management'))}`]);
    sections.push([L('Diagnostics', 'Diagnostics'), `
      <p>${L('L’onglet <strong>Diagnostics</strong>, à côté de la gestion des membres, liste les erreurs techniques remontées automatiquement par les navigateurs (page, message, navigateur). Elles sont conservées 14 jours et servent à repérer un problème avant qu’on te le signale.', 'The <strong>Diagnostics</strong> tab, next to member management, lists technical errors reported automatically by browsers (page, message, browser). They are kept for 14 days and help spot a problem before anyone reports it.')}</p>`]);
  }

  const title = role === 'admin' ? L('AIDE ORGANISATEUR & ADMINISTRATION', 'ORGANIZER & ADMINISTRATION HELP') : L('AIDE ORGANISATEUR', 'ORGANIZER HELP');
  const subtitle = role === 'admin'
    ? L('Gérer les courses, les équipages et les droits d’Endurance Manager.', 'Manage races, crews and Endurance Manager permissions.')
    : L('Créer les courses, suivre les inscriptions et superviser les équipages.', 'Create races, follow entries and supervise crews.');

  return `<section class="${HELP_PAGE_CLASS}">
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <span class="help-account-badge">${accountLabel(role)}</span>
    </header>
    <div class="help-list">${numbered(sections).join('')}</div>
  </section>`;
}

export function renderHelp(user = null) {
  if (!app) return;
  currentUser = user;
  const role = normalizedRole();
  app.innerHTML = role === 'organizer' || role === 'admin' ? organizerHelp(role) : pilotHelp(role);
  window.scrollTo({top:0, behavior:'smooth'});
}
