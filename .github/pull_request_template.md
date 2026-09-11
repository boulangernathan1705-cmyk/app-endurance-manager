## Objet

Décris brièvement la modification.

## Validation DEV

- [ ] Testé sur `https://app.endurance-manager.workers.dev`
- [ ] `Quality checks` est vert
- [ ] Aucun test ne modifie volontairement les données de production

## Mise en production

Pour une release vers `main` :

- [ ] La PR est ouverte depuis `dev`
- [ ] Le comportement LMU est validé
- [ ] Le comportement iRacing est validé
- [ ] L'affichage mobile principal est validé
- [ ] Les migrations D1 nécessaires sont incluses

Après fusion dans `main`, Cloudflare déploie `https://endurance-manager.app` et le workflow de compatibilité navigateur vérifie la production.
