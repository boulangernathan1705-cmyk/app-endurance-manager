# Plugin SimHub · Fiches combo

Envoie les séances Le Mans Ultimate d'un pilote aux fiches combo de son équipe (module privé « combos »,
`server/combos.mjs`). La collecte reprend l'ancien plugin retiré en v1.51 :

- lit la mémoire partagée de LMU (`LMU_Data`) pendant que le pilote roule : usure, températures et pressions des
  pneus, gomme, freins, vitesse max, carburant en litres, énergie virtuelle, température de piste, pluie et humidité
  de la trajectoire, temps des trois secteurs, arrêts aux stands décomposés (`Live.cs`) ;
- lit l'API locale du jeu (`http://localhost:6397`, en lecture seule, voiture arrêtée aux stands) : temps de service de
  la voiture (`RepairAndRefuel` › `pitStopTimes`), prévision de conso et température idéale de la gomme
  (`TireManagement`), envoyés avec la séance (`service`, `game`, `LmuApi.cs`) ; et le nom du réglage chargé au garage
  (`summary` › `activeSetup`), noté sur chaque tour (`setup`) ; et la lumière du jour (`lightLevel`, 0 la nuit, 1 en
  plein jour), notée sur chaque tour (`light`) pour séparer les tours de nuit ;
- garde chaque séance en fichier jusqu'à ce que le site l'ait reçue (`Sync.cs`) ;
- partage la voiture en direct avec l'équipe pendant qu'elle roule (`LiveShare.cs`, depuis la 1.3.0) : une fois par
  seconde, par WebSocket (`/api/combos/plugin/live`), la voiture et tout le classement lus dans la même copie de la
  mémoire du jeu, pour la page « Mur des stands » du site (`server/live.mjs`, `shared/live.mjs`). Activé par défaut,
  case « Partager ma voiture en direct » pour le couper. Lit aussi `watch/standings` toutes les 20 s (numéros des
  voitures) et `watch/trackmap` une fois par circuit (tracé, gardé seulement s'il passe à moins de 25 m de la voiture).
  Depuis la 1.6.0, tout à l'ouverture de la connexion puis seulement ce qui a changé ; le site dit si quelqu'un
  regarde : personne, seulement ce que l'historique demande (tours, arrêts, pilotes), et les positions des voitures
  seulement quand une page montre la carte. Le site doit être à jour avant de donner la 1.6.0 aux pilotes.

- publie les chiffres des overlays d'essais et de course (`Practice.cs`, depuis la 1.4.0, en propriétés depuis la
  1.5.0) : le dernier tour (temps, énergie ou carburant, usure moyenne des 4 pneus) face à la valeur visée, et sous
  chacun « Moi · Équipe · Meilleur » (moyennes de tous les tours comptés, le meilleur en violet), lus sur la fiche combo
  (`/api/combos/plugin/sheet`, au début de chaque séance puis toutes les 3 minutes) et complétés par les tours de la
  séance en cours, comptés avec les règles de la fiche. Énergie visée : 100 % / tours par relais (carburant : réservoir
  / tours par relais). Temps et usure visés : w × ma moyenne + (1 − w) × moyenne de l'équipe, avec w = mes tours comptés
  / (2 × tours par relais), plafonné à 1. Propriétés `EnduranceManagerPlugin.Essais.*` (`EnEssais`, `EnCourse`,
  `NonCompte`, `Couleur`, `ToursParRelais`, puis pour `Tour`, `Energie` et `Usure` : `Titre`, `Valeur`, `Ecart`,
  `EcartCouleur`, `Vise`, `Moi`, `MoiCouleur`, `Equipe`, `Meilleur`, `MeilleurCouleur`, `Nombre`, `ViseNombre`). Les
  tours par relais se changent sur l'écran du plugin ou en roulant : boutons A (+1) et B (−1) des dashs SimHub
  (`GraphicalDashPlugin.ActionA` et `ActionB`, souvent déjà reliés au volant ; pris seulement en essais et en course,
  voiture en piste), ou actions `ToursParRelaisPlus` et `ToursParRelaisMoins` du plugin. Les flèches restent à la
  navigation entre écrans des dashs.
- écrit deux overlays dans les modèles de Dash Studio à son lancement (`Dashes.cs`) : « Endurance Manager · Bandeau »
  et « Endurance Manager · Colonne », affichés en essais et en course voiture en piste (formule du calque à changer
  dans Dash Studio pour d'autres séances). L'affichage conserve le dernier tour (temps, énergie ou carburant,
  usure) et la cible « vs » sur une ligne dédiée, dans trois cartes sur toute la largeur : grands chiffres,
  écart signé coloré dans une pastille à droite. Les moyennes personnelles, d'équipe et du meilleur pilote
  sont masquées. Les calculs des cibles et les
  propriétés publiées ne changent pas : les données de l'équipe continuent d'alimenter le rythme et l'usure visés.
  Un overlay modifié dans Dash Studio n'est plus réécrit.

- publie, depuis la 2.0.0, les chiffres de course qu'un dash LMU prend d'habitude au plugin NeoRed (`Course.cs`), sous
  les mêmes noms que lui avec notre préfixe (`EnduranceManagerPlugin.Energy.VE.Current_%`…) : énergie et carburant
  (dernier tour, moyenne des 5 derniers, tours restants, besoin jusqu'à l'arrivée, à remettre, avec un tour de marge),
  tours et temps restants, moyenne des 10 derniers tours, position générale et dans la classe, écarts dans la classe,
  arrêts, pénalités, points de track limits, réglages en voiture (TC, ABS, répartition, migration, map moteur, barres),
  batterie, écarts avec les voitures autour, menu des stands tel que réglé (lu toutes les 2 s, `garage/PitMenu/receivePitMenu`), durée de
  l'arrêt qu'il demande (temps de service du jeu : les travaux faits pendant le ravitaillement se chevauchent, les
  autres s'ajoutent), pneus, freins, état de la voiture et météo. `Convertir un dash NeoRed.ps1` passe un dash de
  NeoRed à ces propriétés et liste celles qu'il lit encore sur NeoRed. Les réponses de l'API du jeu pas encore lues
  (estimation d'arrêt, état de la voiture, prévision météo…) sont gardées une fois par lancement de SimHub dans
  `%LOCALAPPDATA%\EnduranceManager\Combos\api`, pour en connaître le format exact.

- complète, depuis la 2.1.0, les noms de NeoRed avec l'API du jeu lue en roulant (`GameApi.cs`, une lecture à la
  fois, hors du fil de SimHub) : état du jeu et estimation de l'arrêt par le jeu (toutes les 2 s, `PitStopEstimate.*`,
  notre calcul reste en secours), état de la voiture et infos de la séance (toutes les 5 s), et une fois par séance la
  météo prévue (`Weather.*`, nœuds et nœud en cours), les réglages de la séance (`Session.*`), voiture, circuit et
  pneus (`VehicleInfos.*`, `TrackInfos.*`, `Tyre.OptimalCompoundTemp_*`). Le menu des stands a tous ses noms NeoRed
  (chiffres, textes, type de pneu, pressions en kPa, bar et psi). `GameInfos.PitState` est le texte du jeu (`EXITING`…).
- reprend, depuis la 2.2.0, tous les noms de NeoRed qu'un dash lit : pénalités par type et statut d'arrivée
  (`Race.Player.*`, `GameInfos.isDNF`/`isDQ`), lus sur le classement en direct du jeu (`Standings.cs`, WebSocket
  `localhost:6398`, son propre fil, une réponse toutes les 2 s) ; virage en cours, nombre de virages, temps de
  drive-through, de stop-and-go et d'arrêt (`Track.*`) et régime de passage du rapport engagé (`Redline.PerGear`), pris
  dans les fiches circuit et voiture de Lovely sur GitHub (`Lovely.cs`, téléchargées une fois, gardées dans
  `Combos\lovely`) ; pression de frein, mélange et régénération du réglage (`Extended.VM_*`, écran de setup lu une
  fois par séance voiture arrêtée) ; ligne stop-and-go du menu (`Pit.StopAndGo`) et les anciens noms (`FuelRatio`,
  `Energy.Fuel.LiterPerLap`, `PitMenu.ReplaceBrakes`). `Pit.StopLength` est désormais, comme chez NeoRed, la durée
  de l'arrêt réglé selon le jeu.

- envoie au mur des stands, depuis la 2.3.0, pour chaque voiture du classement : la gomme montée et les dégâts de
  carrosserie (mémoire du jeu, emplacement de télémétrie de la voiture) et l'énergie ou le carburant utilisé au dernier
  tour (`strategy/usage`, lu toutes les 20 s), en fin de rangée (`cmp`, `dmg`, `veLap` dans `shared/live.mjs`). À
  vérifier en ligne : que le jeu remplit la gomme et les dégâts des autres pilotes. `watch/standings` est gardé avec les
  autres réponses du jeu dans `api`.

Il ne fait que lire : il ne modifie rien dans le jeu ni dans SimHub. Il n'envoie plus les fichiers de résultats XML.

## Ressources et stabilité

- Rien dans la boucle de SimHub (`DataUpdate` est vide) : la lecture tourne sur son propre fil, en priorité basse,
  dix fois par seconde, et dort le reste du temps. Chaque lecture est une seule copie de la mémoire du jeu (325 Ko).
- L'API locale du jeu est appelée voiture arrêtée aux stands, au garage et dans les menus (le nom du réglage, toutes
  les 5 s) et, en roulant, une fois par minute pour la seule lumière du jour (`RepairAndRefuel`, environ 15 Ko), une lecture
  à la fois.
- Les séances partent quand le pilote n'est pas en piste (menus, jeu fermé), sur un fil en priorité minimale.
- Aucune erreur de lecture ne peut fermer SimHub : la lecture reprend quelques secondes plus tard.
- Jeu planté ou fermé en piste : l'horloge du jeu ne bouge plus, la séance est écrite sur le disque au bout d'une minute.
  SimHub fermé en roulant : la séance en cours est écrite avant la fermeture.

À vérifier en jeu : l'humidité de la trajectoire (`Wet` dans `Live.cs`) est lue juste après le vent dans la mémoire
partagée. Elle doit valoir 0 sur piste sèche et monter vers 1 sous la pluie. La condition d'un tour (sec, humide,
pluie) en dépend : seuils `DAMP_FROM` et `RAIN_FROM` dans `shared/combos.mjs`.

À vérifier aussi : le nom du réglage affiché sur l'écran du plugin (« Réglage chargé ») doit changer quand on charge un
autre réglage au garage. Un réglage modifié sans être enregistré garde le nom de celui dont il part. Les secteurs
d'un tour ne sont envoyés que si le jeu a donné les trois.

À vérifier pour le mur des stands : les champs du classement lus dans la mémoire (écarts au leader et à la voiture
devant, temps dans le tour, garage, position x/z de chaque voiture) sont aux offsets rF2 ; le contrôle de la voiture
(`mControl`) doit valoir 0 pour le pilote au volant (un coéquipier qui regarde ne partage pas) ; le tracé du jeu doit
se superposer aux voitures sur la carte.

À vérifier pour les chiffres de course : les noms des lignes du menu des stands (« VIRTUAL ENERGY », « FL TIRE »,
« DRIVER », « REPLACE BRAKES », « DAMAGE »…) et le premier choix d'une roue, qui doit être « pas de changement » ; la
durée d'arrêt calculée face à celle du jeu.

À vérifier enfin : la lumière du jour. Un tour compte de nuit sous `NIGHT_BELOW` (0,5, dans `shared/combos.mjs`).

## Compiler (sur un PC Windows avec SimHub)

Il faut le SDK .NET (8 ou plus récent, il sait cibler .NET Framework 4.8) et SimHub installé.

```
cd connectors\simhub-plugin
dotnet build -c Release
```

Si SimHub n'est pas dans `C:\Program Files (x86)\SimHub`, ajouter `-p:SimHubDir="D:\chemin\SimHub"`.
La DLL est dans `bin\Release\EnduranceManager.SimHub.dll`.

## Installer et tester

1. Double-cliquer sur `Installer le plugin.cmd`, posé à côté de la DLL dans `bin\Release` : il ferme SimHub, copie
   la DLL dans le dossier de SimHub (lu dans le registre), la débloque et relance SimHub. Il demande les droits
   administrateur seulement si le dossier de SimHub l'exige. Dans SimHub, accepter le nouveau plugin.
2. Sur le site de l'équipe, page « Fiches combo » (`fiches-combo.html`), bloc « Relier SimHub » : « Créer mon code »
   le crée et le copie (`POST /api/combos/link`). Le code ressemble à `EMCOMBO1 https://… <clé> EMCOMBO1` et
   contient l'adresse du site : un code créé sur le site de test envoie les séances au site de test.
3. Copier le code, puis ouvrir le menu « Fiches combo » de SimHub : tant qu'il n'est pas relié, il trouve tout seul
   le code dans le presse-papiers. Le bouton « Coller mon code » reste là pour changer de code.
4. Rouler quelques tours dans LMU avec un arrêt aux stands, revenir au menu : la séance part dans la minute.

La case « Plugin activé », en haut de l'écran du plugin, le met en pause : il ne lit plus rien du jeu et n'envoie
plus rien, les séances en attente restent sur le PC. Décochée en roulant, les tours déjà faits sont gardés. Propriété
`EnduranceManagerPlugin.Enabled` pour l'afficher dans un tableau de bord.

Les séances en attente sont dans `%LOCALAPPDATA%\EnduranceManager\Combos\sessions` ; celles que le site refuse sont
gardées dans `sessions\refused`, avec la raison dans un fichier .txt à côté, et l'écran du plugin l'affiche. Si la
clé est retirée ou si le pilote n'a plus l'autorisation « Fiches combo », plus rien ne part et les séances attendent
un nouveau code.

Propriétés exposées aux tableaux de bord SimHub : `EnduranceManagerPlugin.Status` et
`EnduranceManagerPlugin.LapsRecorded`.

## Donner le plugin aux pilotes et le mettre à jour

Le site sert la version rangée dans `release/` (`scripts/build.mjs` la copie dans `public/downloads/simhub/` avec
`plugin.json` : version, taille et empreinte SHA-256). Sur la page « Fiches combo », « Télécharger l'installeur » donne
`Installer le plugin.cmd` avec l'adresse du site écrite dedans : au double-clic, il télécharge la DLL de ce site, la
vérifie, ferme SimHub, l'installe et relance SimHub. Le plugin regarde `plugin.json` une fois par heure sur le site de
son code ; quand une version plus récente y est, son écran propose « Mettre à jour », qui lance le même installeur
(jamais en roulant). La liaison est gardée.

Publier une nouvelle version :

1. Monter `<Version>` dans `EnduranceManager.SimHub.csproj` et `version` dans `release/plugin.json` (même numéro).
2. `dotnet build -c Release`, puis copier `bin\Release\EnduranceManager.SimHub.dll` dans `release/`.
3. Committer les deux fichiers et la DLL : une fois fusionnée dans `dev`, le site de test la propose ; dans `main`, le
   site principal.

## Ce que le site reçoit

`POST /api/combos/plugin/session` avec `Authorization: Bearer <clé>` et la séance en JSON :

```json
{"at": 1790000000000, "track": "Circuit de la Sarthe", "car": "Ferrari 499P", "class": "Hypercar",
 "driver": "N. Boulanger", "session": 2, "capacity": 90,
 "laps": [{"n": 3, "t": 209.4, "s1": 62.8, "s2": 83.9, "s3": 62.7, "top": 331.2, "fuel": 6.9, "ve": 8.42, "wear": [1.7, 2.0, 1.3, 1.4],
           "temp": [92, 95, 89, 90], "brake": [480, 495, 410, 405], "kpa": [171, 172, 166, 167],
           "compound": "Medium", "track": 31.2, "air": 22.4, "rain": 0, "wet": 0, "invalid": false, "pit": false,
           "setup": "Course v2"}],
 "stops": [{"lap": 4, "lane": 62.5, "stopped": 27.3, "fuel": 40, "ve": 60, "tyres": 4, "repair": false}],
 "service": {"fuelRate": 2.4, "energyRate": 3.1, "connect": 2, "tyres4": 22, "tyres2": 12, "wing": 6, "brakes": 95, "driver": 18},
 "game": {"fuel": 6.9, "ve": 8.4, "ideal": 90}}
```

Le plugin peut aussi lire `GET /api/combos/plugin/status` (pilote et communauté reliés) et
`GET /api/combos/plugin/sheet?track=…&car=…` (la fiche de l'épreuve et de la version en cours, pour l'overlay).
