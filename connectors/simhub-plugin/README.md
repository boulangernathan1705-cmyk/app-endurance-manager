# Plugin SimHub : ce qui reste ici

Le code du plugin vit dans son propre dépôt :
[endurance-manager-plugin](https://github.com/boulangernathan1705-cmyk/endurance-manager-plugin) (privé).

Ici, seulement ce que le site sert aux plugins installés pour leur mise à jour (`scripts/build.mjs` → `/downloads/simhub/`) :

- `release/EnduranceManager.SimHub.dll` et `release/plugin.json` : la version proposée en mise à jour ;
- `Installer le plugin.cmd` : l'installeur que le plugin et la page Télémétrie Mémo téléchargent.

Publier une version : prendre la DLL de la Release GitHub du plugin, la mettre dans `release/` avec sa version dans
`plugin.json` (jamais l'un sans l'autre), et l'installeur s'il a changé. Voir `docs/publier.md` du dépôt du plugin.
