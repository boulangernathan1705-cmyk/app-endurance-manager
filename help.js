// Help page content. Written directly in French and English (L(fr, en)) instead of going through the
// text dictionary, so it stays readable and complete in both languages.
// Screenshots come from scripts/help-screenshots.mjs (images/help/*.jpg) and must be regenerated
// whenever the screens they show change.
import {getLocale} from './front/i18n.mjs';

const HELP_PAGE_CLASS = 'help-page';
const app = document.getElementById('app');
// Session given by the page (/api/session: user, permissions, modules) or null: the help follows the pilot's
// rights and the community's modules.
let session = null;

const L = (fr, en) => getLocale() === 'en' ? en : fr;
const can = permission => (session?.permissions || []).includes(permission);
const events = () => session?.soloRaces === true;
const eventsLabel = () => session?.soloLabel || 'EVENT TDZ';

function accountLabel() {
  const user = session?.user;
  if (!user) return L('Utilisation sans connexion', 'Using the site without signing in');
  return `${user.name} · ${user.role === 'admin' ? L('Administrateur', 'Administrator') : L('Pilote', 'Driver')}`;
}

function helpScreenshot(name, alt, caption = '') {
  return `<figure class="help-screenshot">
    <img src="/images/help/${name}.jpg?v=3" alt="${alt}" loading="lazy" decoding="async">
    ${caption ? `<figcaption>${caption}</figcaption>` : ''}
  </figure>`;
}

function helpItem(index, title, body, open = false) {
  return `<details class="help-item"${open ? ' open' : ''}>
    <summary><span class="help-index">${String(index).padStart(2, '0')}</span><span>${title}</span><span class="help-chevron" aria-hidden="true">⌄</span></summary>
    <div class="help-item-body">${body}</div>
  </details>`;
}

// The five permissions a Discord role can give (server/access.mjs), as set in Administration.
const PERMISSIONS = () => [
  ['endurance', L('Endurances', 'Endurance races'), L('s’inscrire aux endurances et rejoindre un équipage existant.', 'enter endurance races and join an existing crew.')],
  ['solo_open', L('Événements OPEN', 'OPEN events'), L('s’inscrire aux événements OPEN.', 'enter OPEN events.')],
  ['solo_safe', L('Événements SAFE', 'SAFE events'), L('s’inscrire aux événements SAFE (et OPEN).', 'enter SAFE (and OPEN) events.')],
  ['crews', L('Équipages', 'Crews'), L('créer et gérer les équipages.', 'create and manage crews.')],
  ['admin', L('Administrer', 'Administer'), L('le site de la communauté, créer et gérer les courses et les événements, inscrire n’importe quel pilote.', 'the community site, create and manage races and events, enter any driver.')],
];

// ---------- Every pilot ----------

const navigationSection = () => [L('Se repérer', 'Finding your way around'), `
  <ul>
    ${events() ? `<li>${L(`<strong>${eventsLabel()}</strong> : le calendrier des événements, toutes simus ;`, `<strong>${eventsLabel()}</strong>: the events calendar, every sim;`)}</li>` : ''}
    <li>${L('<strong>ENDURANCE</strong> : les endurances, avec le choix <strong>LMU</strong> / <strong>iRacing</strong> ;', '<strong>ENDURANCE</strong>: endurance races, with the <strong>LMU</strong> / <strong>iRacing</strong> switch;')}</li>
    <li>${L('<strong>Mes inscriptions</strong> : tout ce où tu es inscrit ;', '<strong>My entries</strong>: everything you entered;')}</li>
    <li>${L('la <strong>cloche</strong> : ce qui te concerne (inscriptions, équipage, rappels) ;', 'the <strong>bell</strong>: what concerns you (entries, crew, reminders);')}</li>
    <li>${L('ton <strong>compte</strong> : Aide, tes communautés et, pour les admins, Administration. Le drapeau change la langue.', 'your <strong>account</strong>: Help, your communities and, for admins, Administration. The flag switches the language.')}</li>
  </ul>
  ${helpScreenshot('nav', L('Barre de navigation', 'Navigation bar'))}`];

const enduranceListSection = () => [L('Les endurances', 'Endurance races'), `
  <p>${L('Une carte par course, semaine par semaine : la date, les heures de départ, les catégories et leurs inscrits. Un badge montre ta situation. « Horaires à confirmer » : tu t’inscris sur un départ « à définir ».', 'One card per race, week by week: the date, start times, categories and how many entered. A badge shows where you stand. “Schedule to be confirmed”: you enter a start “to be set”.')}</p>
  <p>${L('Au-dessus : <strong>À venir</strong>, <strong>Mes courses</strong>, <strong>Archivés</strong> et <strong>Filtres</strong>.', 'Above: <strong>Upcoming</strong>, <strong>My races</strong>, <strong>Archived</strong> and <strong>Filters</strong>.')}</p>
  ${helpScreenshot('endurance-list', L('Liste des endurances', 'Endurance list'))}`];

const enduranceEntrySection = () => [L('S’inscrire à une endurance', 'Entering an endurance race'), `
  <p>${L('Sur la page de la course, chaque départ a ses boutons :', 'On the race page, each start has its buttons:')}</p>
  <ul>
    <li>${L('<strong>M’inscrire</strong> : une fenêtre en 4 étapes (catégorie, voitures, heures de présence, récapitulatif) ;', '<strong>Enter</strong>: a 4-step window (category, cars, hours present, summary);')}</li>
    <li>${L('<strong>Absent</strong> : tu préviens que tu ne seras pas là. Ton nom va dans la liste <strong>Absents</strong>, en bas de la page ; un clic de plus l’enlève ;', '<strong>Absent</strong>: you say you won’t be there. Your name goes in the <strong>Absent</strong> list at the bottom of the page; one more click removes it;')}</li>
    <li>${L('une fois inscrit, <strong>Me désinscrire</strong> (en rouge) ; <strong>…</strong> pour modifier ton inscription ou t’inscrire dans une autre catégorie.', 'once entered, <strong>Withdraw</strong> (in red); <strong>…</strong> to edit your entry or enter another category.')}</li>
  </ul>
  <div class="help-tip">${L('<strong>Conseil :</strong> ne coche que les heures où tu es vraiment là, c’est ce qui sert à organiser les relais.', '<strong>Tip:</strong> only tick the hours you are really there; that is what relay planning relies on.')}</div>
  ${helpScreenshot('endurance-starts', L('Les départs d’une endurance', 'Starts of an endurance race'))}
  ${helpScreenshot('register-hours', L('Les heures de présence', 'Hours present'))}`];

const crewsSection = () => [L('Les équipages', 'Crews'), `
  <p>${L('Dans un départ, chaque équipage a sa carte : sa couleur, sa catégorie, ses pilotes et sa voiture. Ouvre-le pour voir qui roule quand ; un message rouge signale une période sans pilote.', 'In a start, each crew has its card: colour, category, drivers and car. Open it to see who drives when; a red message flags a period with no driver.')}</p>
  <ul>
    <li>${L('<strong>Rejoindre</strong> : un équipage de ta catégorie avec des <strong>places libres</strong> ;', '<strong>Join</strong>: a crew of your category with <strong>open seats</strong>;')}</li>
    <li>${L('<strong>Quitter</strong> : tu restes inscrit, sans équipage ;', '<strong>Leave</strong>: you stay entered, without a crew;')}</li>
    <li>${L('le carré <strong>Créer un équipage</strong> et <strong>Gérer</strong> : avec l’autorisation Équipages.', 'the <strong>Create a crew</strong> square and <strong>Manage</strong>: with the Crews permission.')}</li>
  </ul>
  <p>${L('Les inscrits encore libres sont dans <strong>Pilotes sans équipage</strong>, pratique pour trouver un coéquipier.', 'Drivers still free are under <strong>Drivers without a crew</strong>, handy to find a teammate.')}</p>
  ${helpScreenshot('crews', L('Les équipages d’un départ', 'Crews of a start'))}`];

const eventsSection = () => [eventsLabel(), `
  <p>${L('Le calendrier des événements, toutes simus (LMU, iRacing, AMS2, ACE). Chaque carte montre la simu, le type et l’accès : <strong>OPEN</strong> (tous) ou <strong>SAFE</strong> (pilotes SAFE). Les <strong>Filtres</strong> trient par simu, type, dates et ta situation.', 'The events calendar, every sim (LMU, iRacing, AMS2, ACE). Each card shows the sim, the type and the access: <strong>OPEN</strong> (everyone) or <strong>SAFE</strong> (SAFE drivers). <strong>Filters</strong> sort by sim, type, dates and where you stand.')}</p>
  <ul>
    <li>${L('chaque manche a son <strong>M’inscrire</strong> et son <strong>Absent</strong> ; sans catégorie à choisir, un clic suffit ;', 'each round has its own <strong>Enter</strong> and <strong>Absent</strong>; with no category to pick, one click is enough;')}</li>
    <li>${L('places limitées : une fois complet, tu passes en <strong>liste d’attente</strong> et tu montes dès qu’une place se libère ;', 'limited places: once full, you go on the <strong>waiting list</strong> and move up as soon as a place frees up;')}</li>
    <li>${L('le mot de passe du serveur n’est visible que des inscrits ;', 'the server password is shown to entered drivers only;')}</li>
    <li>${L('un événement SAFE sans l’accès SAFE : le bouton <strong>Comment devenir SAFE</strong> mène au salon Discord qui l’explique.', 'a SAFE event without SAFE access: the <strong>How to become SAFE</strong> button leads to the Discord channel that explains it.')}</li>
  </ul>
  ${helpScreenshot('event-page', L('Un événement en deux manches', 'An event in two rounds'))}`];

const myEntriesSection = () => [L('Mes inscriptions', 'My entries'), `
  <p>${L('Une carte par course à venir, avec ta catégorie, ton départ et ton équipage. <strong>Voir la course</strong> ouvre sa page ; le <strong>+</strong> déplie ton équipage et les autres inscrits.', 'One card per upcoming race, with your category, start and crew. <strong>View race</strong> opens its page; the <strong>+</strong> unfolds your crew and the other drivers.')}</p>
  ${helpScreenshot('my-entries', L('Mes inscriptions', 'My entries'))}`];

const bellSection = () => [L('La cloche', 'The bell'), `
  <p>${L('Elle prévient quand quelqu’un s’inscrit sur ton départ, rejoint ou quitte ton équipage, change sa voiture, ou quand la course change. Si ta communauté a activé les rappels, elle te rappelle ta course 24 h avant.', 'It tells you when someone enters your start, joins or leaves your crew, changes its car, or when the race changes. If your community turned reminders on, it reminds you of your race 24 h before.')}</p>`];

function rightsSection() {
  const mine = PERMISSIONS().filter(([key]) => can(key) && (events() || !key.startsWith('solo_')));
  const list = PERMISSIONS().filter(([key]) => events() || !key.startsWith('solo_'));
  const yours = !session?.user ? ''
    : `<p>${mine.length ? `${L('Tes autorisations ici :', 'Your permissions here:')} ${mine.map(([, name]) => `<strong>${name}</strong>`).join(', ')}.` : L('Tu n’as aucune autorisation ici : tu vois les courses sans pouvoir t’inscrire.', 'You have no permission here: you can see the races but not enter them.')}</p>`;
  return [L('Ce que tu peux faire', 'What you can do'), `
    <p>${L('Tes droits viennent de tes <strong>rôles sur le Discord</strong> de la communauté. Ses admins choisissent ce que chaque rôle permet :', 'Your rights come from your <strong>roles on the community’s Discord</strong>. Its admins choose what each role allows:')}</p>
    <ul>${list.map(([, name, text]) => `<li><strong>${name}</strong> : ${text}</li>`).join('')}</ul>
    <p>${L('Sans autorisation, tu vois les courses seulement. Un rôle donné sur Discord compte ici en quelques minutes.', 'With no permission, you only see the races. A role given on Discord counts here within minutes.')}</p>
    ${yours}`];
}

// ---------- Admins ----------

const createEnduranceSection = () => [L('Créer une endurance', 'Creating an endurance race'), `
  <p>${L('<strong>Ajouter une endurance</strong> ouvre une fenêtre en 4 étapes : informations (nom, durée, type, circuit), catégories, départs, récapitulatif. Les heures sont celles de Paris. Coche <strong>Horaires à confirmer</strong> si tu ne connais que le jour.', '<strong>Add an endurance race</strong> opens a 4-step window: information (name, length, type, circuit), categories, starts, summary. Times are Paris time. Tick <strong>Schedule to be confirmed</strong> if you only know the day.')}</p>
  <p>${L('Sur la page de la course : <strong>Copier le lien</strong>, <strong>Modifier l’événement</strong> et <strong>Supprimer l’événement</strong>. Si tu changes un horaire, préviens les pilotes.', 'On the race page: <strong>Copy link</strong>, <strong>Edit event</strong> and <strong>Delete event</strong>. If you change a start time, tell the drivers.')}</p>
  ${helpScreenshot('admin-create-endurance', L('Créer une endurance', 'Creating an endurance race'))}`];

const createEventSection = () => [L(`Créer un événement ${eventsLabel()}`, `Creating a ${eventsLabel()} event`), `
  <p>${L('<strong>Ajouter un événement</strong> : 5 étapes. <strong>Événement</strong> (nom, simu, type), <strong>Horaire</strong> (jour, heure, mot de passe du serveur), <strong>Manches</strong> (jusqu’à 4 : circuit, catégories, durées essais/qualifs/course, météo, carburant, pneus), <strong>Inscriptions</strong> (places, note), <strong>Récapitulatif</strong>.', '<strong>Add an event</strong>: 5 steps. <strong>Event</strong> (name, sim, type), <strong>Schedule</strong> (day, time, server password), <strong>Rounds</strong> (up to 4: circuit, categories, practice/qualifying/race lengths, weather, fuel, tyres), <strong>Entries</strong> (places, note), <strong>Summary</strong>.')}</p>
  <p>${L('Le type SAFE ou OPEN décide qui peut s’inscrire : c’est vérifié par le site.', 'The SAFE or OPEN type decides who can enter: the site checks it.')}</p>
  ${helpScreenshot('admin-create-event', L('Créer un événement', 'Creating an event'))}`];

const otherPilotsSection = () => [L('Inscrire un pilote, gérer les équipages', 'Entering a driver, managing crews'), `
  <p>${L('Dans un départ, le menu <strong>…</strong> → <strong>Inscrire un autre pilote</strong> : choisis son compte Discord parmi les membres. Tu peux aussi modifier son inscription tant que le départ n’a pas commencé.', 'In a start, the <strong>…</strong> menu → <strong>Enter another driver</strong>: pick their Discord account among the members. You can also edit their entry until the start begins.')}</p>
  <p>${L('Sur chaque équipage, <strong>Gérer</strong> change le nom, la voiture et les pilotes ; <strong>Ouvert / Complet</strong> décide si on peut encore le rejoindre ; <strong>Supprimer</strong> garde les inscriptions de ses pilotes. Une fois le départ commencé, tout est figé.', 'On each crew, <strong>Manage</strong> changes the name, car and drivers; <strong>Open / Complete</strong> decides whether it can still be joined; <strong>Delete</strong> keeps its drivers’ entries. Once the start has begun, everything is frozen.')}</p>`];

const administrationSection = () => [L('Administration', 'Administration'), `
  <p>${L('Menu du compte → <strong>Administration</strong>, en 4 parties :', 'Account menu → <strong>Administration</strong>, in 4 parts:')}</p>
  <ul>
    <li>${L('<strong>Vue d’ensemble</strong> : l’état du serveur Discord, les étapes de démarrage et ce qui demande ton attention ;', '<strong>Overview</strong>: the Discord server’s state, the getting-started steps and what needs your attention;')}</li>
    <li>${L('<strong>Membres et rôles</strong> : les membres venus sur le site et, dans <strong>Rôles</strong>, les 5 autorisations à cocher pour chaque rôle Discord ;', '<strong>Members and roles</strong>: the members who came to the site and, under <strong>Roles</strong>, the 5 permissions to tick for each Discord role;')}</li>
    <li>${L('<strong>Modules</strong> : récap de la semaine sur Discord, salons d’équipage, rappels de course, endurances iRacing officielles, EVENT TDZ ;', '<strong>Modules</strong>: weekly recap on Discord, crew channels, race reminders, official iRacing endurance races, EVENT TDZ;')}</li>
    <li>${L('<strong>Apparence</strong> : nom, couleur et bannière, avec un aperçu.', '<strong>Appearance</strong>: name, colour and banner, with a preview.')}</li>
  </ul>
  <p>${L('Les rôles se donnent sur Discord, jamais ici.', 'Roles are given on Discord, never here.')}</p>
  ${helpScreenshot('admin-modules', L('Les modules', 'Modules'))}`];

const modulesSection = () => [L('Les modules en bref', 'Modules in short'), `
  <ul>
    <li>${L('<strong>Salons d’équipage</strong> : un salon texte et son vocal par équipage, ouverts quelques jours avant la course, fermés tout seuls après (le texte est gardé 30 jours dans « Archives équipages ») ;', '<strong>Crew channels</strong>: a text channel and its voice channel per crew, opened a few days before the race, closed by themselves afterwards (the text one is kept 30 days in “Crew archives”);')}</li>
    <li>${L('<strong>Rappels de course</strong> : 24 h avant dans la cloche, 24 h et 1 h avant dans le salon de l’équipage ;', '<strong>Race reminders</strong>: 24 h before in the bell, 24 h and 1 h before in the crew channel;')}</li>
    <li>${L('<strong>Endurances iRacing officielles</strong> : les séries en équipe et les événements spéciaux ajoutés tout seuls, horaires compris ;', '<strong>Official iRacing endurance races</strong>: team series and special events added by themselves, times included;')}</li>
    <li>${L('<strong>Récap de la semaine</strong> : les courses de la semaine dans un salon Discord, mis à jour à chaque inscription.', '<strong>Weekly recap</strong>: the week’s races in a Discord channel, updated on every entry.')}</li>
  </ul>`];

const diagnosticsSection = () => [L('Diagnostics', 'Diagnostics'), `
  <p>${L('L’onglet <strong>Diagnostics</strong> liste les erreurs remontées par les navigateurs pendant 14 jours : de quoi repérer un problème avant qu’on te le signale.', 'The <strong>Diagnostics</strong> tab lists errors reported by browsers over 14 days: enough to spot a problem before anyone reports it.')}</p>`];

export function renderHelp(current = null) {
  if (!app) return;
  session = current;
  const admin = session?.user?.role === 'admin';
  const sections = [
    navigationSection(),
    ...(events() ? [eventsSection()] : []),
    enduranceListSection(),
    enduranceEntrySection(),
    crewsSection(),
    myEntriesSection(),
    bellSection(),
    rightsSection(),
    ...(admin ? [createEnduranceSection(), ...(events() ? [createEventSection()] : []), otherPilotsSection(), administrationSection(), modulesSection(), diagnosticsSection()] : []),
  ];
  app.innerHTML = `<section class="${HELP_PAGE_CLASS}">
    <header class="help-hero">
      <span class="help-kicker">ENDURANCE MANAGER</span>
      <h1>${admin ? L('AIDE PILOTE & ADMIN', 'DRIVER & ADMIN HELP') : L('AIDE', 'HELP')}</h1>
      <p>${L('S’inscrire, s’organiser en équipage', 'Enter, organize your crew')}${admin ? L(' et gérer ta communauté.', ' and run your community.') : '.'}</p>
      <span class="help-account-badge">${accountLabel()}</span>
    </header>
    <div class="help-list">${sections.map((item, index) => helpItem(index + 1, item[0], item[1], index === 0)).join('')}</div>
  </section>`;
  window.scrollTo({top:0, behavior:'smooth'});
}
