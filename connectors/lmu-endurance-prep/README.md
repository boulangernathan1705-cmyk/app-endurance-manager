# Plugin SimHub · LMU Endurance Prep

Plugin à part, indépendant du plugin Fiches combo (`connectors/simhub-plugin`) : on installe l'un, l'autre ou les deux.
Les deux sont servis ensemble dans un seul zip (`downloads/simhub/plugins-simhub.zip`, `scripts/build.mjs`).

Repris du dépôt `lmu-endurance` (branche `etape-0-reconnaissance`, dossier `plugin/`), où reste l'API d'équipe. Pour
l'instant il ne fait qu'une chose : à chaque début de séance et à chaque tour, il écrit tout ce que SimHub lit de LMU
dans un fichier `.jsonl` de `Documents\SimHub\LmuEndurancePrep\recon\`. Ces relevés disent quels champs existent
vraiment (énergie virtuelle, usure, météo...) avant de coder l'enregistreur. Menu « Endurance Prep » dans SimHub,
propriétés `LmuEndurancePrepPlugin.Recon.LapsLogged`, `.CurrentFile` et `.LastError`.

## Compiler (sur un PC Windows avec SimHub)

```
cd connectors\lmu-endurance-prep
dotnet build -c Release
```

Si SimHub n'est pas dans `C:\Program Files (x86)\SimHub\`, définir la variable d'environnement `SIMHUB_INSTALL_PATH`
vers son dossier (avec un `\` final). La DLL est copiée dans SimHub après la compilation si le dossier le permet.

## Publier une version dans le zip

1. Monter `<Version>` dans `LmuEndurancePrep.csproj` et `version` dans `release/plugin.json` (même numéro).
2. `dotnet build -c Release`, puis copier `bin\Release\net48\LmuEndurancePrep.dll` dans `release/`.
3. Committer les deux fichiers et la DLL : le zip du site la prend tant qu'elle est dans `release/`.
