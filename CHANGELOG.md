# Nouveautés d'Endurance Manager

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

