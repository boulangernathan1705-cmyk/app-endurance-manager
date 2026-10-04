# Connecteur de préparation — prototype à valider sur Windows

Ce dossier contient le code source, pas une DLL distribuable. Aucun test de collecte en jeu n’a encore été réalisé.
Le SDK est installé avec SimHub : https://github.com/SHWotever/SimHub/wiki/Plugin-and-extensions-SDKs.

## Validation avant diffusion

1. Compiler sous Windows avec Visual Studio 2022, .NET Framework 4.8 et le SDK du SimHub installé : `dotnet build -c Release -p:SimHubDirectory="C:\Program Files (x86)\SimHub"`.
2. Vérifier les interfaces du plugin contre le projet officiel `PluginSdk/User.PluginSdkDemo` de cette version.
3. Copier la DLL dans SimHub et l’activer pour le compte de test seulement.
4. Depuis la préparation d’un équipage du site DEV, télécharger `EnduranceManager.connection.json`. Placer ce fichier dans `%LOCALAPPDATA%\EnduranceManager\SimHub`. Ne jamais le partager : il contient une clé limitée à la collecte de ce compte et cette communauté. Relancer SimHub.
5. Inspecter les propriétés normalisées exposées par `GameData` / `NewData`. Les mappings par défaut sont des candidats à vérifier, pas une garantie de compatibilité. Corriger `mapping.json` dans ce même dossier. `trackName`, `carName`, `gameName` permettent une correspondance exacte avec les noms réellement exposés (pas de correspondance approximative entre layouts).
6. Mapper uniquement les booléens confirmés : `previousLapValid` doit concerner le tour terminé, `inPit` l’entrée/passage aux stands, `paused` la pause du jeu, `wet` l’état mouillé de la piste, `night` la nuit simulée. Une propriété indiquant la pluie seule ne confirme pas une piste mouillée. L’heure Windows ne mesure jamais la nuit du jeu. Adapter la couche de lecture si ces données ne sont pas normalisées en booléens. Les valeurs manquantes restent nulles.
7. Valider : connexion en milieu de tour, pause, retour garage, reset de séance, changement de piste/voiture, carburant ajouté, sec/pluie/nuit, perte de réseau, redémarrage et révocation de liaison. Comparer avec les valeurs en jeu.
8. Ne rendre disponible l’installation aux pilotes qu’après ces vérifications. Documenter séparément LMU et iRacing.

Le plugin lit au maximum une fois par seconde. Il transmet des résumés de tours hors du callback de SimHub, conserve les lots non envoyés localement et réessaie sans doubler les tours. Le serveur vérifie identité, communauté, module, équipage, voiture et circuit. Une liaison peut être retirée depuis le site. Elle expire après 180 jours.

Limites connues : un crash dans les 15 secondes précédant l’écriture peut perdre le dernier tour ; les drapeaux non mappés ne valident aucun exercice ; les changements de pilote, compétences en trafic et fichier setup utilisé ne sont pas certifiés. Une erreur de collecte ne doit jamais empêcher de conduire.
