# Plugin SimHub Endurance Manager

Fait la même chose que le synchroniseur Windows (`connectors/lmu-sync`), pour les pilotes qui ont déjà SimHub :

- envoie les fichiers de résultats LMU (`UserData\Log\Results\*.xml`) à la page « Mon entraînement » ;
- lit la mémoire partagée de LMU (`LMU_Data`) pendant que le pilote roule : usure, températures et pressions des
  pneus, gomme, freins, vitesse max, carburant en litres, énergie, température de piste, arrêts aux stands décomposés.

Il ne fait que lire. Si le synchroniseur tourne déjà sur le PC, le plugin ne fait rien pour ne pas envoyer deux fois.
La lecture de la mémoire (`Live.cs`) est la copie de `connectors/lmu-sync/live.go` : toute correction se fait dans les deux.

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
2. Sur le site, page « Mon entraînement » › « Tu utilises SimHub ? » › « Obtenir mon code SimHub ».
3. Dans SimHub, menu « Endurance Manager », coller le code et l'enregistrer.
4. Rouler quelques tours dans LMU avec un arrêt aux stands, revenir au menu : la séance arrive sur le site en
   une à deux minutes (pneus, carburant et arrêts dans « Mon entraînement »).

Les séances en attente sont dans `%LOCALAPPDATA%\EnduranceManager\SimHub\live`. Propriétés exposées aux tableaux de
bord SimHub : `EnduranceManagerPlugin.Status` et `EnduranceManagerPlugin.LapsRecorded`.
