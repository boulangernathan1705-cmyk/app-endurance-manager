# Plugin SimHub : ce qui reste ici

Le code du plugin vit dans son propre dépôt :
[endurance-manager-plugin](https://github.com/boulangernathan1705-cmyk/endurance-manager-plugin) (privé). Il ne revient
jamais ici, et aucune copie du PC de Nathan ne sert de source.

Ici, seulement ce que le site sert aux plugins installés, dans `v0/` :

- `EnduranceManager.SimHub.dll` : la DLL de la dernière Release du plugin ;
- `plugin.json` : celui de la Release, tel quel (version, taille, empreinte SHA-256, « Ce qui change ») ;
- `installer.cmd` : l'installeur de la Release (la page Télémétrie Mémo y écrit l'adresse du site).

`scripts/build.mjs` les sert deux fois :

- `/downloads/simhub/v0/` : lu par les plugins 0.x (mise à jour dans SimHub) et par la page Télémétrie Mémo ;
- `/downloads/simhub/` : la même DLL annoncée en `2.99.0`, pour que les anciens plugins 2.x passent une fois à la 0.x.
  Une fois en 0.x, le plugin ne lit plus que `v0/` : pas de boucle.

Le build refuse un `plugin.json` qui ne correspond pas à la DLL (taille ou empreinte).

## Publier une version

Automatique : chaque Release du plugin ouvre une PR vers `dev` qui remplace `v0/` (branche `plugin-x.y.z`, voir
`docs/publier.md` du plugin). La fusionner dans `dev` (vert) ; elle part en production avec la prochaine release du
site, après le « go prod » de Nathan.
