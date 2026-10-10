# Nouveautés d'Endurance Manager

Les changements du site, version par version. La plus récente est en haut.

## v1.17 — 10 octobre 2026

- Nouvelle autorisation **Accès Endurance Manager** dans Administration → Membres et rôles → Rôles. Les membres ordinaires entrent seulement si au moins un de leurs rôles possède cette autorisation ; elle est décochée par défaut, y compris pour `@everyone`.
- Sans accès, un compte connecté voit « Accès réservé » et ne peut consulter ni modifier les données de la communauté, même depuis une course officielle partagée ou un lien direct à l’API. Les administrateurs conservent leur accès pour configurer les rôles.
- Les administrateurs doivent cocher l’accès sur les rôles choisis lors de la mise en service. Aucune migration D1 ; les inscriptions et équipages existants sont conservés.

## v1.16 — 7 octobre 2026

### Mes communautés
- À la connexion, le site retrouve toutes les communautés du pilote : plus besoin d'ouvrir chaque site une première fois.

## v1.15 — 6 octobre 2026

### Accès aux communautés
- Un pilote connecté avant l'arrivée du bot sur le serveur Discord n'est plus bloqué.
- Après avoir rejoint le serveur, l'accès s'ouvre en une minute.

## v1.14 — 6 octobre 2026

### EVENT TDZ (nouveau module)
- Un **calendrier des événements toutes simus** : LMU, iRacing, AMS2 et ACE, chacune avec sa couleur.
- **M'inscrire** en un clic, ou **Absent** ; par manche quand l'événement en a plusieurs, avec des places par manche.
- Événements **OPEN** ou **SAFE** : l'accès suit les autorisations de ton rôle.
- Quand le module est actif, il devient la page d'accueil ; **ENDURANCE** te demande une fois LMU ou iRacing.

### Endurances
- **Absent** à côté de **M'inscrire** sur chaque départ.
- **Me désinscrire** est en rouge quand tu es inscrit.

### Autorisations des rôles
- Cinq cases claires : **Endurances**, **Events OPEN**, **Events SAFE**, **Équipages** et **Administrer**.
- Créer et gérer les courses, et inscrire un autre pilote, font partie d'**Administrer**.

### Salons d'équipage sur Discord
- **Un seul salon vocal par équipage**, nommé avec la simu et l'équipage. Son chat reçoit le récap et les rappels 24 h et 1 h avant.
- Il est supprimé **2 h après la course**, une fois vide.
- À l'activation, l'admin choisit la **catégorie Discord** des vocaux. Le module dit ce qui bloque s'il ne peut pas s'activer.

### Navigation
- La **même barre** en haut de chaque page ; l'administration se lit mieux sur téléphone.
- L'**aide** est à jour.

### Rapidité
- Le site est **plus léger** : moins de requêtes, et une page laissée ouverte arrête de se rafraîchir après 15 min sans geste.

## v1.13 — 4 octobre 2026

### Administration
- L'administration est réorganisée en **quatre rubriques** : **Vue d'ensemble** (état du serveur Discord, des membres et des modules, étapes de démarrage, ce qui demande ton attention), **Membres et rôles**, **Modules** et **Apparence**.
- Les autorisations des rôles se règlent dans un **tableau** : on voit d'un coup d'œil ce que chaque rôle peut faire.
- Chaque module a sa **tuile** avec son état, et le récap de la semaine sur Discord y est rangé avec les autres.
- L'Apparence montre un **aperçu en direct** du site avant d'enregistrer.

### Salons d'équipage sur Discord (nouveau module)
- Quelques jours avant la course, chaque équipage reçoit sur le serveur Discord **un salon texte avec son récap, et son salon vocal juste en dessous**. Les pilotes y sont mentionnés, et le récap se met à jour tout seul.
- 24 h après la course, le vocal est supprimé et le salon texte est rangé dans « Archives équipages » pendant 30 jours.
- Il s'active avec un simple interrupteur dans **Administration → Modules**, après avoir donné les droits au bot.

### Rappels de course (nouveau module)
- **24 h avant le départ**, un rappel dans la cloche du site ; 24 h et 1 h avant, un message dans le salon de l'équipage.

### Notifications
- La cloche te prévient quand **la voiture de ton équipage change**.

### Communautés
- Les gérants de serveur Discord peuvent **demander un espace** pour leur communauté avec un formulaire.

## v1.12 — 4 octobre 2026

### Notifications
- Une **cloche** à côté de ton compte te dit ce qui se passe sur les courses où tu es inscrit : un pilote s'inscrit sur ton départ, quelqu'un rejoint ou quitte ton équipage, un équipage choisit son départ, la course change d'horaires, de circuit, de durée ou de nom, ou elle est supprimée.
- Le nombre de notifications non lues s'affiche sur la cloche ; l'ouvrir les marque comme lues, et chacune ouvre sa course. Elles sont gardées 30 jours.

## v1.11.1 — 4 octobre 2026

### Inscriptions
- Ton inscription affiche toujours **ton nom Discord** : personne ne peut s'inscrire ou modifier son inscription sous le pseudo d'un autre membre.

### Équipages
- La voiture d'un équipage se choisit **parmi les voitures de sa catégorie**.

### Navigation
- Une adresse qui n'existe pas affiche **« Page introuvable »** avec un lien vers l'accueil, au lieu d'une page blanche.

### Diagnostics
- Chaque communauté garde ses propres signalements d'erreurs : une communauté très active n'efface plus ceux des autres.

## v1.11 — 30 septembre 2026

### Courses officielles
- **Choisis les communautés affichées** sur le planning d'une course officielle : « Toutes », ou seulement la tienne (ou quelques-unes), avec le nombre de pilotes de chacune. Ton choix est gardé pour les autres courses.

### Communautés
- L'explication des communautés ne s'affiche plus qu'**une seule fois pour ton compte**, quel que soit l'appareil.

### Récap de la semaine sur Discord
- En haut de chaque course, **ses jours et ses horaires de départ** ; la ligne « autres départs sans inscrit · voir la course » disparaît.

## v1.10 — 30 septembre 2026

### Liste des courses
- **Filtres** : un bouton « Filtres » ouvre le choix des communautés, du type de course (officielles, événement spécial, championnat LMU ou privé), des catégories, des dates (du … au …) et de ta situation (inscrit, avec ou sans équipage, pas inscrit). Tes filtres sont gardés d'une visite à l'autre.

### Équipages
- Le cadenas d'un équipage dans le planning est **vert et ouvert** s'il a encore des places, **rouge et fermé** s'il est complet.
- Sur une course officielle, la création d'un équipage demande toujours **pour quelle communauté**, quel que soit le site où tu es.

### Communautés
- Si tu es dans plusieurs communautés, une courte explication s'affiche à ta première inscription : chaque communauté est privée, les courses officielles sont communes, un équipage réunit une seule communauté. Tu la retrouves dans ton menu, « Les communautés ».

## v1.9 — 30 septembre 2026

### Courses officielles
- Les **courses officielles** (endurances iRacing, courses LMU officielles) sont communes à toutes les communautés : si tu es dans plusieurs communautés, tu vois sur leur planning les inscrits et les équipages **de toutes tes communautés**.
- Devant chaque pilote et chaque équipage, le **logo Discord** (ou le nom court) de sa communauté.
- À l'inscription et à la création d'un équipage, tu choisis d'abord **avec quelle communauté** : un équipage réunit les pilotes d'une seule communauté.
- Un badge **Officielle** sur ces courses.

### Navigation
- Le logo et le nom court de ta communauté à côté du drapeau de langue.
- **Mes communautés** passe dans le menu de ton compte, sous « Aide » : un clic pour aller sur le site d'une autre de tes communautés.

## v1.8.1 — 30 septembre 2026

### Rôles Discord
- Un rôle donné (ou retiré) à un pilote sur Discord compte sur le site **en 10 minutes**, au lieu du lendemain.

## v1.8 — 30 septembre 2026

### Page d'une course
- **Plus compacte** : la bannière se réduit à une bande, l'en-tête de la course tient sur deux lignes et ses boutons passent à côté des jours du planning, pour que les départs arrivent tout de suite.
- Au survol d'une pastille de catégorie (« 2 GT3 »), le nom des pilotes qui cherchent un équipage.
- Le nombre d'inscrits par catégorie compte chaque pilote une seule fois, même s'il est inscrit sur plusieurs départs.
- **Inscription en un clic** depuis le planning : sur chaque départ, un carré **Inscription** (m'inscrire, m'inscrire dans une autre catégorie, inscrire un autre pilote) et un carré **Créer un équipage**.
- Un petit cadenas ouvert orange à côté d'un équipage qui a encore des places : tu vois tout de suite ceux que tu peux rejoindre.

## v1.7.1 — 29 septembre 2026

### Récap de la semaine sur Discord
- **Plus court** : seuls les départs où il y a des inscrits sont détaillés (équipages et pilotes sans équipage) ; les départs vides tiennent en une ligne avec le lien de la course.

## v1.7 — 29 septembre 2026

### Courses sur plusieurs jours
- **Planning des départs** : quand une course se court sur plusieurs jours (vendredi, samedi, dimanche…), ses départs s'affichent en planning, un jour par colonne (un onglet par jour sur téléphone). Au-delà de 3 jours, choisis d'en voir 3, 5 ou 7 à la fois et passe d'un jour à l'autre avec les flèches.
- Chaque départ montre en un coup d'œil ses équipages et **les pilotes sans équipage par catégorie** (« 2 GT3 ») ; un départ vide est grisé. Clique dessus pour l'ouvrir, t'inscrire ou rejoindre un équipage, ou sur la ligne des pilotes sans équipage pour les voir directement.
- La date de la course montre tous ses jours (« ven. → dim. 16–18 oct. »), et un bouton **Ton départ** t'emmène directement au tien.

### Aide au survol
- **Infobulles** : passe la souris sur un badge, une pastille ou un ⓘ (ou touche-le sur téléphone) pour savoir ce qu'il veut dire : type de course, horaires à confirmer, places libres, responsable d'équipage, heures sans pilote…

## v1.6.1 — 29 septembre 2026

### Créer une course
- **Plusieurs départs d'un coup** : coche les jours de course (vendredi, samedi, dimanche…) puis les heures de départ ; chaque jour coché reçoit toutes les heures cochées, et le nombre de départs s'affiche avant de valider. Idéal pour les événements spéciaux sur un week-end.

### Application
- L'application installée porte **le logo de ta communauté**, sur téléphone comme sur ordinateur.

## v1.6 — 29 septembre 2026

### Application
- **Endurance Manager s'installe sur ton téléphone** (et ton ordinateur) comme une application : ouverture en plein écran depuis l'écran d'accueil, avec le nom et le logo de ta communauté.

### Sur téléphone
- Barre de navigation plus compacte, sans débordement.
- Cartes de course plus serrées : le tracé du circuit en petit à côté du titre, et les **catégories sur une seule ligne**.
- Page d'une course : en-tête compact, équipages à leur juste hauteur, cartes pilote en pleine largeur.

## v1.5 — 29 septembre 2026

### Courses
- Dans un départ sans équipage, les **pilotes inscrits** s'affichent directement, sur des cartes dans le style des équipages.
- La **frise de présence** marque chaque heure d'un trait dans la barre.

### Récap de la semaine sur Discord
- **Un bloc par course** : son nom mène directement à la course sur le site, avec la couleur du simulateur, le circuit, la durée, les équipages et les pilotes sans équipage.
- Les **horaires s'affichent dans ton fuseau horaire**.

## v1.3 — 29 septembre 2026

### Accès
- Pas encore membre du serveur Discord de ta communauté ? Le site te propose directement son **lien d'invitation**.

## v1.2.2 — 29 septembre 2026

### Accueil
- L'écran d'accueil avant connexion est plus épuré : sans barre de navigation, il met en avant la **création d'équipage** et le bouton Discord.

## v1.2.1 — 29 septembre 2026

### Accueil
- Nouvel **écran d'accueil** avant la connexion : ce que fait le site en un coup d'œil, et un bouton **Se connecter avec Discord** bien visible.

## v1.2 — 29 septembre 2026

### Connexion
- Tu entres sur le site avec ton compte Discord, en tant que membre du serveur de ta communauté.
- **Mes communautés** : si tu fais partie de plusieurs communautés, passe de l'une à l'autre depuis le nom en haut du site. Une seule connexion suffit pour toutes.
- À cette mise à jour, il faut **se reconnecter une fois**.

## v1.1.5 — 28 septembre 2026

### Corrections
- Un équipage peut bien **choisir son départ** quand les horaires d'une course « à définir » sont connus : le déplacement échouait dès que l'équipage avait des pilotes.

## v1.1.4 — 28 septembre 2026

### Corrections
- En modifiant une course, cocher ou décocher **Horaires à confirmer** ajoute ou retire bien le départ **à définir** (auparavant, seule la création réagissait). Les inscrits restent sur leur départ.

## v1.1.3 — 28 septembre 2026

### Horaires à confirmer (LMU et iRacing)
- En cochant **Horaires à confirmer** à la création d'une course, tu indiques seulement le **jour** : la course a un départ **à définir** où tout le monde s'inscrit et forme ses équipages.
- Quand les horaires sont connus, **modifie la course** et ajoute les vrais départs. Si personne n'était inscrit, le départ à définir disparaît ; sinon **chaque équipage choisit son départ**.

### Corrections
- Une course en **Horaires à confirmer** (LMU comme iRacing) n'affiche plus d'heure provisoire : ses départs indiquent la date et « à définir ».
- Le récap Discord n'annonce plus « Course en cours » pour une course aux horaires à confirmer, et écrit « horaire à confirmer » au lieu d'une heure provisoire.

## v1.1.2 — 28 septembre 2026

### Corrections
- Endurances iRacing plus fiables : une série ne peut plus être confondue avec un événement spécial au nom proche, et un événement spécial n'apparaît jamais en double.
- Les horaires d'un événement spécial sont complétés même si iRacing les publie tard, jusqu'à la fin du week-end de course.
- En cas de coupure réseau, le site ne renvoie plus tout seul une création ou une modification : fini les courses créées en double.
- Le créateur d'équipage affiche « à définir » pour un départ dont l'horaire n'est pas encore connu.

## v1.1.1 — 28 septembre 2026

### Endurances iRacing officielles
- Le **Bathurst 1000** apparaît bien (sa fiche du calendrier indiquait une durée de 15 minutes).

## v1.1 — 28 septembre 2026

### Accueil
- Nouvelle page d'accueil pour les nouveaux : ce qu'est le site, la connexion Discord et comment ça marche en 4 étapes.
- À ta première connexion, une petite fenêtre te demande ta simu. Le site s'en souvient : ensuite, tu arrives directement sur LMU ou iRacing.
- Le logo **Endurance Manager** te ramène aux endurances de ta simu. Pour changer de simu, utilise la barre de navigation.

### Endurances
- La durée d'une endurance peut avoir des minutes, par exemple **2 h 30**. La frise de présence s'arrête à l'heure de fin réelle.
- À l'inscription, **Je la fais tout seul** : tu peux courir une endurance sans équipier, sur LMU comme sur iRacing. Un badge **SOLO** l'indique aux organisateurs.
- Si la course impose un changement de pilote (toujours sur LMU, sur iRacing au-delà de 4 h ou selon l'organisateur), un message te prévient que ta course ne comptera pas au classement en solo.

### Endurances iRacing officielles
- Les endurances officielles iRacing **en équipe avec changement de pilotes** arrivent **toutes seules** sur le site, mises à jour chaque nuit : IMSA Endurance Series, Global Endurance Tour, GT Endurance Series, Nürburgring Endurance Championship, Creventic et Production Endurance Challenge, plus les événements spéciaux (8 Hours of Indianapolis, Bathurst 1000, 992 Endurance Cup…).
- Une course par série et par semaine, avec **tous les horaires de départ officiels**, à l'heure de Paris.
- Les événements spéciaux (Bathurst 1000, 8 Hours of Indianapolis…) arrivent d'abord avec un départ **à définir** : tout le monde s'y inscrit et forme ses équipages. Les créneaux officiels s'ajoutent tout seuls dès qu'iRacing les publie, en général le lundi de la semaine de course.
- Une fois les créneaux connus, **chaque équipage choisit son départ** et y part avec ses pilotes. Un pilote sans équipage choisit le sien.
- Circuits iRacing ajoutés : Long Beach, Motegi, Brands Hatch, Zolder, Summit Point, Circuit Gilles-Villeneuve, The Bend, Charlotte Roval, Navarra, Oschersleben, Oulton Park et Snetterton.

### Grands écrans
- Sur les grands écrans (27 à 34 pouces, ultralarges), le site s'agrandit et utilise mieux la largeur : jusqu'à trois courses par ligne.

### Corrections
- Les bloqueurs de pub n'empêchent plus l'affichage des courses.

## v1.0 — 26 septembre 2026

Première version de référence du site.

### Courses
- Endurances **Le Mans Ultimate** et **iRacing** : courses à venir, tes courses et archives.
- Chaque course affiche son circuit, ses départs regroupés par jour, ses catégories et le nombre d'inscrits.
- Circuits LMU à jour, dont **Long Beach** et **Road Atlanta**.
- Chaque course a son lien, à copier pour la partager.

### Inscriptions
- Inscription en 4 étapes : catégorie, voiture(s), heures de présence, récapitulatif.
- Tu peux inscrire un autre pilote et modifier ou retirer ton inscription jusqu'au départ.
- **Mes inscriptions** regroupe tes courses : ton équipage, les autres équipages et les pilotes encore libres.

### Équipages
- Crée ton équipage en 3 étapes, rejoins ou quitte un équipage de ta catégorie.
- Chaque équipage garde sa couleur partout sur le site.
- Ouvre un équipage pour voir qui roule quand : un message signale les heures sans pilote.

### Partout sur le site
- Connexion avec Discord, et retour sur la page que tu consultais.
- Les inscriptions se mettent à jour toutes seules, sans recharger la page.
- Site en français et en anglais, sur ordinateur et sur mobile.
- Récap hebdomadaire des courses sur Discord.
- Une aide complète pour les pilotes et les organisateurs.
