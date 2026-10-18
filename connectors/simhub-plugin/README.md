# Plugin SimHub · Fiches combo

Envoie les séances Le Mans Ultimate d'un pilote aux fiches combo de son équipe (module privé « combos »,
`server/combos.mjs`). La collecte reprend l'ancien plugin retiré en v1.51 :

- lit la mémoire partagée de LMU (`LMU_Data`) pendant que le pilote roule : usure, températures et pressions des
  pneus, gomme, freins, vitesse max, carburant en litres, énergie virtuelle, température de piste, pluie et humidité
  de la trajectoire, arrêts aux stands décomposés (`Live.cs`) ;
- lit l'API locale du jeu (`http://localhost:6397`, en lecture seule, toutes les 30 s en piste) : temps de service de
  la voiture (`RepairAndRefuel` › `pitStopTimes`), prévision de conso et température idéale de la gomme
  (`TireManagement`), envoyés avec la séance (`service`, `game`, `LmuApi.cs`) ;
- garde chaque séance en fichier jusqu'à ce que le site l'ait reçue (`Sync.cs`).

Il ne fait que lire : il ne modifie rien dans le jeu ni dans SimHub. Il n'envoie plus les fichiers de résultats XML.

## Ressources et stabilité

- Rien dans la boucle de SimHub (`DataUpdate` est vide) : la lecture tourne sur son propre fil, en priorité basse,
  dix fois par seconde, et dort le reste du temps. Chaque lecture est une seule copie de la mémoire du jeu (325 Ko).
- L'API locale du jeu n'est appelée que voiture arrêtée aux stands ou au garage, jamais en roulant, une lecture à la fois.
- Les séances partent quand le pilote n'est pas en piste (menus, jeu fermé), sur un fil en priorité minimale.
- Aucune erreur de lecture ne peut fermer SimHub : la lecture reprend quelques secondes plus tard.
- Jeu planté ou fermé en piste : l'horloge du jeu ne bouge plus, la séance est écrite sur le disque au bout d'une minute.
  SimHub fermé en roulant : la séance en cours est écrite avant la fermeture.

À vérifier en jeu : l'humidité de la trajectoire (`Wet` dans `Live.cs`) est lue juste après le vent dans la mémoire
partagée. Elle doit valoir 0 sur piste sèche et monter vers 1 sous la pluie. La condition d'un tour (sec, humide,
pluie) en dépend : seuils `DAMP_FROM` et `RAIN_FROM` dans `shared/combos.mjs`.

## Compiler (sur un PC Windows avec SimHub)

Il faut le SDK .NET (8 ou plus récent, il sait cibler .NET Framework 4.8) et SimHub installé.

```
cd connectors\simhub-plugin
dotnet build -c Release
```

Si SimHub n'est pas dans `C:\Program Files (x86)\SimHub`, ajouter `-p:SimHubDir="D:\chemin\SimHub"`.
La DLL est dans `bin\Release\EnduranceManager.SimHub.dll`.

## Installer et tester

1. Fermer SimHub, copier `EnduranceManager.SimHub.dll` dans le dossier de SimHub, relancer SimHub et accepter le plugin.
   Si la DLL a été téléchargée, Windows peut la bloquer : clic droit › Propriétés › cocher « Débloquer » avant de la copier.
2. Sur le site de l'équipe, créer son code de liaison : `POST /api/combos/link` (la page « Fiches combo » avec son
   bouton « Relier SimHub » arrive avec l'interface). Le code ressemble à `EMCOMBO1 https://… <clé> EMCOMBO1` et
   contient l'adresse du site : un code créé sur le site de test envoie les séances au site de test.
3. Copier le code, puis dans SimHub, menu « Fiches combo », cliquer sur « Coller mon code ».
4. Rouler quelques tours dans LMU avec un arrêt aux stands, revenir au menu : la séance part dans la minute.

Les séances en attente sont dans `%LOCALAPPDATA%\EnduranceManager\Combos\sessions` ; celles que le site refuse sont
gardées dans `sessions\refused`, avec la raison dans un fichier .txt à côté, et l'écran du plugin l'affiche. Si la
clé est retirée ou si le pilote n'a plus l'autorisation « Fiches combo », plus rien ne part et les séances attendent
un nouveau code.

Propriétés exposées aux tableaux de bord SimHub : `EnduranceManagerPlugin.Status` et
`EnduranceManagerPlugin.LapsRecorded`.

## Ce que le site reçoit

`POST /api/combos/plugin/session` avec `Authorization: Bearer <clé>` et la séance en JSON :

```json
{"at": 1790000000000, "track": "Circuit de la Sarthe", "car": "Ferrari 499P", "class": "Hypercar",
 "driver": "N. Boulanger", "session": 2, "capacity": 90,
 "laps": [{"n": 3, "t": 209.4, "top": 331.2, "fuel": 6.9, "ve": 8.42, "wear": [1.7, 2.0, 1.3, 1.4],
           "temp": [92, 95, 89, 90], "brake": [480, 495, 410, 405], "kpa": [171, 172, 166, 167],
           "compound": "Medium", "track": 31.2, "air": 22.4, "rain": 0, "wet": 0, "invalid": false, "pit": false}],
 "stops": [{"lap": 4, "lane": 62.5, "stopped": 27.3, "fuel": 40, "ve": 60, "tyres": 4, "repair": false}],
 "service": {"fuelRate": 2.4, "energyRate": 3.1, "connect": 2, "tyres4": 22, "tyres2": 12, "wing": 6, "brakes": 95, "driver": 18},
 "game": {"fuel": 6.9, "ve": 8.4, "ideal": 90}}
```

Le plugin peut aussi lire `GET /api/combos/plugin/status` (pilote et communauté reliés) et
`GET /api/combos/plugin/sheet?track=…&car=…` (la fiche de l'épreuve et de la version en cours, pour l'overlay).
