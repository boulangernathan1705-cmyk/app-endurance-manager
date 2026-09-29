# Nouveautés d'Endurance Manager

Les changements du site, version par version. La plus récente est en haut.

## v1.3.1 — 29 septembre 2026

### Corrections
- Sur endurance-manager.app, **Inscrire un autre pilote** propose de nouveau tous les pilotes Discord (la liste était vide).
- Le récap Discord d'une communauté ne peut être publié que dans les salons choisis par ses propres admins.

## v1.3 — 29 septembre 2026

### Pour les admins des communautés
- Nouvel onglet **Mise en place** dans « Gestion des membres » : les étapes pour installer ta communauté, expliquées pas à pas et cochées toutes seules une fois faites (bot Discord, rôles, récap, lien d'invitation, annonce du site).
- **Récap de la semaine sur Discord** réglé par chaque communauté : dans un seul salon (LMU, iRacing ou les deux) ou un salon par simu, avec un bouton pour tester le salon. Le lien du message mène au site de la communauté.
- Le **lien d'invitation** du serveur Discord est proposé aux joueurs qui n'en sont pas encore membres.
- Page Membres plus claire : nom de la communauté au centre de la barre, autorisations des rôles plus lisibles.

## v1.2.2 — 29 septembre 2026

### Accueil
- L'écran d'accueil avant connexion est plus épuré : sans barre de navigation, il met en avant la **création d'équipage** et le bouton Discord.

## v1.2.1 — 29 septembre 2026

### Accueil
- Nouvel **écran d'accueil** avant la connexion : ce que fait le site en un coup d'œil, et un bouton **Se connecter avec Discord** bien visible.

## v1.2 — 29 septembre 2026

### Communautés
- Endurance Manager accueille maintenant des **communautés** : chacune a son propre site (`nom.endurance-manager.app`), ses courses, ses équipages et ses inscriptions, bien séparés des autres.
- L'accès à une communauté passe par **son serveur Discord** : seuls ses membres y entrent, et ce que chacun peut faire (s'inscrire, créer des courses, gérer les inscriptions…) dépend de ses **rôles Discord**, réglés par les admins du serveur.
- Page **Membres** pour les admins : les membres du serveur, et les **réglages** de la communauté (nom, couleur, autorisations de chaque rôle, modules comme l'import des endurances iRacing ou le récap Discord). Le logo et la bannière sont ceux du serveur Discord.
- **Mes communautés** : un pilote membre de plusieurs communautés passe de l'une à l'autre depuis le nom de la communauté, en haut du site.
- Une seule connexion Discord pour tous les sites. À cette mise à jour, il faut **se reconnecter une fois**.
- endurance-manager.app garde ses courses et reste ouvert à tous les joueurs Discord : connecte-toi avec Discord pour voir les courses.

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
- Les courses LMU à venir en horaires à confirmer (Fuji, Portimão, Bahreïn, Silverstone) passent à ce fonctionnement.

### Corrections
- Une course en **Horaires à confirmer** (LMU comme iRacing) n'affiche plus d'heure provisoire : ses départs indiquent la date et « à définir ».
- Le récap Discord n'annonce plus « Course en cours » pour une course aux horaires à confirmer, et écrit « horaire à confirmer » au lieu d'une heure provisoire.

## v1.1.2 — 28 septembre 2026

### Corrections
- Import des endurances iRacing plus fiable : une série ne peut plus être confondue avec un événement spécial au nom proche, et un événement spécial n'est jamais créé en double.
- Les horaires d'un événement spécial sont complétés même si iRacing les publie tard, jusqu'à la fin du week-end de course.
- En cas de coupure réseau, le site ne renvoie plus tout seul une création ou une modification : fini les courses créées en double.
- Le créateur d'équipage affiche « à définir » pour un départ dont l'horaire n'est pas encore connu.

## v1.1.1 — 28 septembre 2026

### Endurances iRacing officielles
- Le **Bathurst 1000** est bien importé (sa fiche du calendrier indiquait une durée de 15 minutes).
- Les administrateurs ont un bouton **Mettre à jour le calendrier iRacing** pour lancer l'import tout de suite, sans attendre la mise à jour automatique.

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
