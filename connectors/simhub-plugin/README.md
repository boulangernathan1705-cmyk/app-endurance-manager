# Plugin SimHub : ce qui reste ici

Le code du plugin vit dans son propre dépôt :
[endurance-manager-plugin](https://github.com/boulangernathan1705-cmyk/endurance-manager-plugin) (privé).

Ici, seulement ce que le site sert aux plugins installés pour leur mise à jour (`scripts/build.mjs` → `/downloads/simhub/`) :

- `release/EnduranceManager.SimHub.dll` et `release/plugin.json` : la 2.2.0, proposée aux anciens plugins 2.x ;
- `v0/` : la DLL, le manifeste et l'installeur de la Release proposée aux plugins 0.x,
  servis par `scripts/build.mjs` dans `/downloads/simhub/v0/` ; le build vérifie la taille et l'empreinte de la DLL ;
- `Installer le plugin.cmd` : l'installeur que le plugin et la page Télémétrie Mémo téléchargent.

Publier une version : suivre `docs/publier.md` du dépôt du plugin, étape 3. Les plugins 0.x (numérotation repartie
de 0.1.0 le 22/11/2026) lisent `v0/` (`/downloads/simhub/v0/`) : y mettre la DLL de la Release, son `plugin.json` tel
quel et l'installeur. Le manifeste est servi sans transformation, avec ses notes de version. Ne pas toucher `release/` (2.2.0 des anciens plugins 2.x), sauf pour le passage unique des 2.x à
la 0.x décrit dans `docs/lien-avec-le-site.md` du plugin. Jamais `plugin.json` sans la DLL correspondante.

Le code du plugin ne revient jamais ici. Une copie de ce dépôt sur le PC de Nathan
(`Documents\Projets\dev\app-endurance-manager`) peut contenir un vieux code du plugin : ne pas s'en servir.
