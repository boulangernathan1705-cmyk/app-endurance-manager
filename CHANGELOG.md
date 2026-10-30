# Nouveautés d'Endurance Manager

## v1.98 — 30 octobre 2026

### ✨ Améliorations

- **Calendrier** : les actualisations automatiques évitent de recharger les courses inchangées. Le rythme de mise à jour, les informations affichées et les protections pendant la saisie sont conservés.

### 🛠️ Pour les admins

- **Performance** : ajout de mesures de consommation et de temps de traitement pour suivre les économies Cloudflare et repérer les requêtes coûteuses.

## v1.97 — 29 octobre 2026

### ✨ Améliorations

- **Annonces de stream** : le streamer peut importer son logo, indiquer librement son simulateur, jeu ou activité, et décrire sa soirée. Un aperçu de la carte se met à jour pendant la saisie.
- **Calendrier** : la carte du stream reprend la charte des autres événements, avec son identité violette, ses horaires et un lien direct vers la chaîne. Le logo et la description apparaissent aussi sur la page de l’annonce. Les annonces existantes restent compatibles.
- **Discord · Aperçus** : les couleurs, images, champs, liens et boutons sont représentés avant publication, avec une largeur ordinateur ou mobile et un export JSON sans notification.
- **Discord · Annonce du jour** : présentation au choix, embed classique ou carte avec sections (Components V2). Chaque course conserve ses actions et les données continuent de se mettre à jour. Une démonstration peut être consultée sur le site avant un envoi explicite dans un salon de test.

## v1.96 — 28 octobre 2026

### ✨ Améliorations

- **Discord · Annonce du jour** : un seul encadré regroupe désormais l’introduction et les courses, avec les manches, équipages, inscrits, boutons et la bannière configurée. Les annonces existantes sont actualisées automatiquement. Les manches sont séparées, les séances sont écrites en toutes lettres et les textes sont aérés.
- **Discord · Calendrier** : des séparateurs en texte distinguent les événements.

## v1.95 — 28 octobre 2026

### 🛠️ Pour les admins

- **Discord · Annonce du jour** : si le message principal a disparu, le bot le recrée sans nouvelle mention avant de supprimer les anciennes annonces séparées. Un échec de publication conserve les anciens messages et sera retenté.
- **Discord · Calendrier** : la nouvelle présentation est appliquée automatiquement même si les événements n’ont pas changé ; un message disparu est rétabli lors de cette mise à jour.

## v1.94 — 28 octobre 2026

### ✨ Améliorations

- **Discord · Annonce du jour** : une seule publication regroupe les events, endurances et streams, avec leurs informations adaptées et les boutons de participation. Les anciens messages du jour sont regroupés sans nouvelle mention.
- **Discord · Calendrier** : horaires, simulations, circuits et places sont mieux séparés ; la bannière configurée de la communauté est conservée.
- **TDZ** · Le type d’événement s’affiche désormais « BOULOULES », y compris pour les anciens événements.

## v1.93 — 28 octobre 2026

### 🛠️ Pour les admins

- **Discord · Mise à jour automatique** : une synchronisation échouée, occupée ou incomplète reste en attente pour être reprise automatiquement, sans devoir enregistrer à nouveau les réglages.

## v1.92 — 28 octobre 2026

### 🛠️ Pour les admins

- **Discord · Courses officielles** : la création, la modification, la suppression et le passage en course officielle déclenchent la mise à jour de tous les Discord configurés, sans attendre le contrôle périodique.

## v1.91 — 28 octobre 2026

### 🛠️ Pour les admins

- **Discord · Vocaux d’équipage** : le bot ouvre automatiquement les salons à tous les membres du serveur (voir, rejoindre et parler), y compris les vocaux existants à la prochaine synchronisation.

## v1.90 — 28 octobre 2026

### 🛠️ Corrections

- **Discord** : quand Discord refuse une action du bot, le message dit la vraie cause (message pas écrit par le bot, fil verrouillé) et donne le code Discord, au lieu de toujours parler de permissions, même quand le bot est admin.

## v1.89 — 28 octobre 2026

### 🛠️ Corrections

- **Annoncer un stream** : la création d’un stream affichait « Le service est momentanément indisponible ». La base accepte maintenant les streams.

## v1.88 — 28 octobre 2026

### 🚀 Nouveautés

- **Events · Annoncer un stream** : un bouton « 🎙 Annoncer un stream » ajoute une case au calendrier, sur un seul écran : titre, jour, début du stream et/ou départ de la course (LMU ou iRacing), lien du stream facultatif. Pas d’inscription ni d’absence.
- Sur la page du stream : « Regarder sur Twitch » et « Inscriptions endurance » (menu ENDU de la simu). Si le streamer roule une endurance ce jour-là, son équipage et ses coéquipiers sont affichés.
- **Discord** : le stream apparaît dans le calendrier de la semaine et dans l’annonce de 7h30 (« Ce soir, c’est stream ! »).

## v1.87 — 28 octobre 2026

### 🚀 Nouveautés

- **Discord · Annonce du jour** : un lien du stream facultatif dans le réglage Discord. L’intro de l’annonce dit « 📺 Lancement du stream sur Twitch à 19h45 », avec le lien sur le mot Twitch.
- **Events** : un champ facultatif « Début du stream » sur la première page de création, quand le stream commence avant la course.
- **Gridfest** : dans l’annonce, le nom de chaque streamer mène à sa chaîne Twitch.

## v1.86 — 28 octobre 2026

### 🚀 Nouveautés

- **Discord · Annonce du jour** : une nouvelle question du réglage Discord choisit un salon où le bot annonce chaque matin à 7h30, avec @everyone, les events et endurances du jour (officielles LMU comprises). Chaque course a son accroche, ses manches ou ses équipages, le nombre de présents et les boutons ✅ Présent / ❌ Absent. Le jour où on l’active, l’annonce part tout de suite pour les courses qui restent.

## v1.85 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : l’en-tête de la semaine ne garde que son titre (lien vers les endurances) et la bannière.
- **Discord** : dans la liste de la semaine, plus le nombre d’équipages ou d’inscrits à côté de chaque course (il est dans son fil).

## v1.84 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : dans l’en-tête de la semaine, le lien est sur le titre « Semaine du … au … ».

## v1.83 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : dans `# endurances-de-la-semaine` et le calendrier, des liens plutôt que des boutons, pour prendre moins de place.

## v1.82 — 28 octobre 2026

### 🐛 Corrections

- **Discord** : l’adresse qui reçoit les clics sur « Absent » répond en prod.

## v1.81 — 28 octobre 2026

### ✨ Améliorations

- **Fin de course** : partout sur le site et sur Discord, l’heure de fin compte 30 min de plus pour les essais et la qualif avant le départ.
- **Discord** : tous les messages du bot sont des cartes avec des boutons vers le site (semaine, calendrier, rappels, fin de course, mot de passe Gridfest).
- **Discord** : dans le fil d’une course, un bouton « Présent » qui ouvre la course sur le site et un bouton « Absent » qui te marque absent sans quitter Discord.

## v1.80 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : dans le chat du vocal d’équipage, une carte de la course : circuit, équipage ouvert ou complet, départ et arrivée, voiture, pilotes, météo, pneus, limites de piste, et un bouton vers la course. Après l’arrivée, un petit mot à l’équipage avant la fermeture du vocal.

## v1.79 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : les vocaux d’équipage ont le logo de leur course devant (« 🏎️ LMU · 6h de Spa · Équipage A »). Ceux qui existent déjà sont renommés, comme un équipage renommé sur le site.

## v1.78 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : les catégories et le salon du bot ont un emoji devant (🏆 Endurance Manager, 🔴 LMU, 🔵 iRacing, 📅・endurances-de-la-semaine). Ceux qui existent déjà sont renommés.
- **Discord** : quand la communauté affiche les courses officielles iRacing, elles ont toutes leur fil, même sans inscrit.
- **Discord** : le salon EVENT TDZ s'appelle « 🗓️・calendrier ».
- **Discord** : un récap peut s'écrire dans un salon qui existe déjà, après ses messages (« Ou dans ce salon… »).

## v1.77 — 28 octobre 2026

### ✨ Améliorations

- **Discord** : dans # endurances-de-la-semaine, la bannière et la semaine ont leur propre message en haut. Dessous, les messages LMU et iRacing ont le même format.

## v1.76 — 28 octobre 2026

### 🔧 Corrections

- **Discord** : les vocaux et le salon de la semaine se créent même quand la catégorie a des droits que le bot ne peut pas recopier (par exemple « Gérer les permissions »).

## v1.75 — 28 octobre 2026

### 🔧 Corrections

- **Discord** : deux liens pour inviter le bot, un normal et un administrateur (qui gère aussi les catégories privées). Le message de droits nomme la catégorie où ajouter l'exception, plus le salon choisi.

## v1.74 — 28 octobre 2026

### ✨ Nouveautés

- **Mur des stands plus fluide** : avec le plugin SimHub 2.4.0, la vitesse, les pédales, le volant, les graphes et la carte se mettent à jour dix fois par seconde pendant qu'on regarde le mur.
- **Pneus** : les températures de la bande de roulement, comme dans le jeu (intérieur, milieu, extérieur), une jauge d'usure à côté de chaque pneu et la pression dans les cases. Les quatre roues sont en miroir, comme sur la voiture.
- **Énergie ou carburant selon la catégorie** : en Hypercar et GT3, en énergie virtuelle ; dans les autres catégories, en litres.
- **Ravitaillement** : la traversée des stands, le temps perdu par arrêt et le tour où il faut rentrer au plus tard.
- **Dégâts** : la voiture vue de dessus, avec chaque zone touchée en couleur et l'aileron arrière quand il est arraché (plugin 2.4.0).

## v1.73 — 27 octobre 2026

### 🔧 Corrections

- **Mur des stands** : le bouton « Mur des stands » du menu ouvre le nouveau mur.

## v1.72 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : « Tout retirer » et la mise en place se terminent en quelques minutes, vocaux compris (avant, les vocaux attendaient le quart d'heure suivant).

## v1.71 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : quand LMU et iRacing sont dans le même # endurances-de-la-semaine, le titre « semaine du … » n'apparaît qu'une fois.
- **Discord** : les vocaux d'équipage sont rangés LMU d'abord, puis iRacing, chacun par heure de départ.

## v1.70 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : plus de message « Endurance Manager a commencé un fil » dans # endurances-de-la-semaine ; le message de la semaine donne déjà le lien de chaque fil.
- **Discord** : la première mise en place et la nouvelle semaine du lundi se terminent en quelques minutes (un passage toutes les 2 minutes au lieu de tous les quarts d'heure).

## v1.69 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : les changements du site (inscriptions, équipages, courses) sont regroupés et Discord est mis à jour une fois toutes les 2 minutes, pour ne plus atteindre les limites de Discord.
- **Discord** : un passage où rien ne change fait moins de requêtes.

## v1.68 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : les pilotes sont remis dans les fils des courses déjà ouvertes, sans notification.

## v1.67 — 27 octobre 2026

### ✨ Nouveautés

- **Discord** : en « Récap de la semaine + pit talk » aussi, un message court pour la semaine et un fil par course dans # endurances-de-la-semaine.

### 🔧 Corrections

- **Discord** : en « Un fil par course » avec LMU et iRacing séparés, les vocaux iRacing vont dans « iRacing ».
- **Discord** : le bot ajoute les pilotes aux fils sans aucune notification (plus de point rouge), y compris dans un fil recréé.
- **Discord** : le bot attend quand Discord lui demande de ralentir, au lieu d'échouer (« Discord limite les requêtes »).

## v1.66 — 27 octobre 2026

### ✨ Nouveautés

- **Discord** : en « Un fil par course », les vocaux des équipages sont juste sous les fils, dans la catégorie du bot ; plus de catégorie par course.
- **Discord** : pas de vocal pour une course d'une simu que le serveur n'affiche pas (LMU seulement : pas de vocal iRacing).
- **Discord** : les pilotes ajoutés au fil d'une course ne reçoivent plus de notification.

## v1.65 — 27 octobre 2026

### 🔧 Corrections

- **Discord** : l'ajout des pilotes aux fils va plus doucement et s'arrête dès que Discord demande de ralentir, pour ne plus gêner le récap (« Discord limite les requêtes »).

## v1.64 — 27 octobre 2026

### ✨ Nouveautés

- **Discord** : le bot ajoute au fil de chaque course les pilotes qui ont accès au site, pour qu'il reste dans leur liste de salons. Chacun n'est ajouté qu'une fois, toutes les 2 minutes par petits lots.
- **Discord** : # endurances-de-la-semaine ne garde qu'un message court, une ligne par course avec le lien vers son fil ; les horaires sont dans le fil.

### 🔧 Corrections

- **Vocaux** : une catégorie de course ou un vocal supprimés à la main sur Discord ne bloquent plus les vocaux (« Vocaux en échec ») ; le bot les recrée.

## v1.63 — 27 octobre 2026

### ✨ Nouveautés

- **Discord** : en mode « Un fil par course », chaque course a son fil dans # endurances-de-la-semaine avec ses infos. Sa catégorie ne garde que les vocaux de ses équipages ; plus de salon infos-de-la-course.

### 🔧 Corrections

- **Discord** : l'activation du réglage ne demande plus de droits dans l'endroit de l'ancien réglage. Le bot crée sa propre catégorie avec ses droits.
- **Récap de la semaine** : les endurances LMU officielles y figurent toujours, comme leurs catégories, même sans inscrit.

## v1.62 — 27 octobre 2026

### ✨ Nouveautés

- **Calendrier des events** : il a sa propre adresse, `/events/`, la même quel que soit le simu. Un lien copié depuis le calendrier y ramène toujours, même depuis l'aperçu de Discord.
- **Nouveautés** : chacun ne voit que ce qui le concerne. Les lignes pour les admins ne s'affichent qu'aux admins, et celles d'une communauté qu'à ses pilotes.

## v1.61 — 27 octobre 2026

### 🔧 Corrections

- **Liens** : un lien écrit en majuscules (`/lmu/#SOLO`, `#INSCRIPTIONS`) ouvre bien la bonne page au lieu d'Endurance.

## v1.60 — 27 octobre 2026

### 🛠️ Pour les admins

- **Discord** : quand Discord demande au bot d'attendre un instant, le bot attend et réessaie au lieu d'afficher « Discord ne répond pas ».
- **Discord** : la liste de tes salons se relit toute seule si elle échoue après un enregistrement. Sinon, un message le dit et tes choix restent gardés.
- **Discord** : un message de la semaine (ou son salon) supprimé sur Discord est remis tout seul, sans passer en « Publication en erreur ».

## v1.59 — 27 octobre 2026

### 🛠️ Pour les admins

- **Discord** : en récap de la semaine avec LMU et iRacing séparés, le bot crée les catégories « LMU » et « iRacing », chacune avec son # endurances-de-la-semaine, là où tu les places.
- **Discord** : les catégories privées sont signalées. Sous une catégorie privée, tu choisis si celles du bot deviennent privées comme elle ou restent publiques, et le réglage explique l'exception à ajouter pour le bot.
- **Discord** : un salon ou un vocal du bot supprimé à la main sur le serveur ne bloque plus l'activation du réglage ; le bot le recrée si besoin.
- **Discord** : le lien « Inviter le bot avec ses droits » donne tout ce qu'il faut sans le mettre administrateur, et la catégorie sous laquelle le bot se place n'affiche plus « le bot n'a pas ses droits ».

## v1.58 — 27 octobre 2026

### 🛠️ Pour les admins

- **Discord** : le réglage se fait question par question (une par écran sur téléphone). Le bot crée sa propre catégorie « Endurance Manager » (ou « LMU » et « iRacing » si tu les sépares) et, en récap de la semaine, la catégorie « 🎙️ Pit talk » pour les vocaux, ou les met dans une catégorie existante. Si tu changes d'avis, le bot retire ce qu'il avait fait et range selon les nouveaux choix. Le bouton « Tout retirer » enlève tout ce que le bot a créé.
- **Vocaux d'équipage** : ils ne remontent plus en haut du serveur quand on passe au récap de la semaine.

## v1.57 — 27 octobre 2026

### 🛠️ Pour les admins

- **Discord** : pour le récap de la semaine et le calendrier, choisis un salon ou une catégorie : le bot crée son propre salon juste en dessous, avec ses droits. Si un endroit est fermé au bot, la ligne dit quoi cocher. Les vocaux d'équipage déjà créés rejoignent la catégorie choisie avec leur nouveau nom, et les catégories de course disparaissent dès qu'on passe au récap de la semaine.

## v1.56 — 26 octobre 2026

### 🛠️ Pour les admins

- **Discord** : un seul réglage pour ranger les courses sur ton serveur (une catégorie par course, ou un récap de la semaine avec tous les vocaux d'équipage dans une catégorie de ton choix). Chaque récap (Endurances LMU, Endurances iRacing, Calendrier de la semaine) se publie dans le salon que tu choisis.
- **Météo prévue** : se renseigne en 5 créneaux, comme dans LMU, avec le ciel de chaque créneau.

## v1.55 — 26 octobre 2026

### ✨ Nouveautés

- **Fiches combo** : la fiche de l’équipe pour chaque circuit et voiture (tours, relais, carburant et énergie, pneus) alimentée par le plugin SimHub, avec l’onglet « Mon analyse ».
- **Mur des stands** : nouvelle présentation en 5 onglets (classement, chrono, véhicule et énergie, télémétrie, carte), plein écran, avec pneus, dégâts et consommation des opposants.
- **Plugin SimHub 2.2** : installé et mis à jour depuis le site ; reprend les données des dashs NeoRed.
- **Météo prévue** : facultative à la création d’une endurance (sec, variable ou pluie, avec une précision), affichée sur la page de la course.

## v1.54 — 21 octobre 2026

### 🔧 Corrections et améliorations

- **Connexion Discord** : valable 30 jours et prolongée à chaque visite.
- **Bannière** : chaque communauté s’affiche directement avec sa bannière et son logo, sans passer par ceux du site.

## v1.53 — 17 octobre 2026

### 🔧 Corrections et améliorations

- **Vocaux d’équipage** : noms des pilotes affichés sans mention, avec des messages et rappels silencieux.

### 🛠️ Pour les admins

- **Discord** : catégories de course regroupées ; accès vérifié dans les catégories privées avant activation et protégé pour le bot dans les nouveaux salons. Les erreurs indiquent le salon et les droits à corriger.

## v1.52 — 16 octobre 2026

### 🔧 Corrections et améliorations

- **Vocaux Discord** : suppression fiabilisée lorsqu’un équipage est supprimé et nettoyage automatique des anciens salons restés après suppression.

## v1.51 — 16 octobre 2026

### Changements

- Retrait des modules **Entraînement** et **Mémo des circuits** pour préparer leur refonte.


Les nouveautés utiles aux pilotes, avec les corrections regroupées par sujet.

## v1.50 — 15 octobre 2026

### ✨ Nouvelles fonctionnalités

- **Endurances solo iRacing** : retrouve les séries officielles compatibles dans EVENT SOLO, à partir de 1 h 30 de course, hors événements TDZ.

### 🔧 Corrections et améliorations

- **Filtres** : communautés, catégories, dates et inscriptions sont filtrées de façon cohérente sur toutes les pages, avec des choix mémorisés séparément.
- **Calendrier iRacing** : import des courses et horaires fiabilisé.
- **Téléphone** : les tracés des circuits restent entièrement dans les cartes de course.

## v1.49 — 15 octobre 2026

### 🔧 Corrections et améliorations

- **iRacing** : seule la Porsche Cup 992.2 est proposée à l’inscription ; l’ancienne 992 a été retirée.

## v1.48 — 15 octobre 2026

### ✨ Nouvelles fonctionnalités

- **Aide sur chaque écran** : un petit « ? » près des notifications explique les choix de la page ; les inscriptions et créations sont guidées étape par étape.

## v1.47 — 15 octobre 2026

Changements du 12 au 15 octobre.

### ✨ Nouvelles fonctionnalités

- **Inscription par catégorie** : indique tes catégories, tes voitures et tes départs possibles pour faciliter la formation des équipages.
- **Inscription sur plusieurs départs** : reprends les mêmes choix sur d’autres horaires, sans tout ressaisir.
- **Coéquipiers souhaités** : sélectionne plusieurs pilotes avec qui tu aimerais rouler et ajoute un commentaire.
- **Événements solo** : inscris-toi aux événements de ta communauté, avec une liste d’attente quand les places sont prises.
- **Préparation LMU** : retrouve le mémo des circuits et prépare ta course avec ton équipage : checklist, notes, setup et relais.

### 🔧 Corrections et améliorations

- **Discord** : récaps plus lisibles et mise à jour corrigée après une inscription ou un changement d’équipage.
- **Vocaux d’équipage** : supprimer un équipage avant le départ supprime aussi son vocal.
- **Mes inscriptions** : tes catégories sont regroupées sur une seule carte pour chaque départ.
- **Affichage** : disponibilités plus lisibles et corrections sur téléphone, notamment pour les courses de 24 heures.
- **iRacing** : récupération corrigée des horaires de certains événements spéciaux.

## v1.22 — 10 octobre 2026

### ✨ Nouvelles fonctionnalités

- **Vocaux d’équipage** : retrouve ton équipage dans un vocal Discord créé dès sa création.
- **Récaps Discord** : consulte les équipages, les pilotes disponibles et les absents de chaque course.

### 🔧 Corrections et améliorations

- **Discord** : les récaps sont plus lisibles et s’actualisent quand un pilote rejoint un équipage.

## v1.16 — 7 octobre 2026

### 🔧 Corrections et améliorations

- **Mes communautés** : toutes tes communautés sont retrouvées à la connexion, sans devoir visiter chaque site.

## v1.15 — 6 octobre 2026

### 🔧 Corrections et améliorations

- **Accès** : rejoindre le serveur Discord de ta communauté débloque l’accès au site, même si tu t’étais connecté auparavant.

## v1.13 — 4 octobre 2026

### ✨ Nouvelles fonctionnalités

- **Notifications** : la cloche te prévient des inscriptions sur ton départ, des changements dans ton équipage et des modifications de ta course.
- **Rappels de course** : reçois un rappel avant le départ, sur le site et dans le salon Discord de ton équipage.

### 🔧 Corrections et améliorations

- **Inscriptions** : ton inscription utilise ton nom Discord et les voitures proposées correspondent à la catégorie de l’équipage.
- **Navigation** : une adresse incorrecte affiche un lien pour revenir à l’accueil.

## v1.11 — 30 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Courses officielles** : retrouve les inscrits et les équipages de tes différentes communautés sur un même planning.
- **Filtres** : affiche les courses selon tes communautés, tes catégories, tes dates ou tes inscriptions. Tes choix sont mémorisés.
- **Équipages** : repère les places disponibles grâce au cadenas ouvert ou fermé.

### 🔧 Corrections et améliorations

- **Communautés** : passe d’une communauté à l’autre depuis ton compte et choisis celle avec laquelle tu participes.
- **Accès** : les changements de rôles Discord sont pris en compte plus rapidement.

## v1.8 — 29 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Application** : installe Endurance Manager sur ton téléphone ou ton ordinateur, avec le logo de ta communauté.
- **Planning** : consulte les départs par jour, retrouve les pilotes sans équipage et accède directement à ton départ.
- **Inscriptions** : inscris-toi ou crée ton équipage directement depuis le planning.
- **Aide** : touche les pastilles ou les symboles d’information pour comprendre leur signification.

### 🔧 Corrections et améliorations

- **Affichage** : pages de course et navigation plus compactes, notamment sur téléphone.
- **Récaps Discord** : les informations sont regroupées par course et les horaires suivent ton fuseau horaire.

## v1.1.5 — 28 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Horaires à confirmer** : inscris-toi et forme ton équipage avant la publication des horaires, puis choisis ton départ lorsqu’ils sont connus.
- **iRacing** : les endurances officielles en équipe et leurs horaires sont ajoutés automatiquement.
- **Solo** : indique que tu souhaites courir seul et vérifie si le règlement l’autorise.

### 🔧 Corrections et améliorations

- **Équipages** : le choix d’un départ fonctionne aussi lorsque l’équipage compte déjà des pilotes.
- **iRacing** : corrections des courses en double et des horaires publiés tardivement.
- **Courses** : affichage corrigé des horaires à confirmer et des durées avec minutes.

## v1.0 — 26 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Endurances LMU et iRacing** : consulte les courses, leurs circuits et leurs départs.
- **Inscriptions et équipages** : indique tes disponibilités, crée ou rejoins un équipage et retrouve tes engagements dans Mes inscriptions.
- **Discord** : connecte-toi avec ton compte et consulte les récaps de course sur le serveur de ta communauté.
- **Sur tous tes appareils** : site en français et en anglais, avec des inscriptions actualisées automatiquement.

