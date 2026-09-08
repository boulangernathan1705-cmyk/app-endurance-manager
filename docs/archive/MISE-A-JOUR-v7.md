# Endurance Manager — mise à jour v7

Cette archive contient les fichiers modifiés à replacer dans le dépôt existant, en conservant les dossiers. Elle ne remplace pas le dépôt complet. Aucune modification n'a été déployée automatiquement sur GitHub ou Cloudflare.

## Installation sur le site existant

1. Conserver une copie du dépôt actuel et exporter la base D1 avant la migration. Une copie des fichiers HTML ne sauvegarde pas les inscriptions.
2. Appliquer **une seule fois** `migrations/0012_participants.sql` sur la base existante, qui doit déjà avoir la migration 0011. Ne pas rejouer les migrations anciennes.
3. Remplacer les fichiers de cette archive dans GitHub, aux mêmes emplacements. Faire ces étapes pendant une courte période sans inscriptions : l'ancien serveur ne peut plus créer d'inscription après la migration 0012.
4. Laisser Cloudflare reconstruire et déployer le Worker. La commande de build reste `npm run build:workers`, la commande de déploiement `npx wrangler deploy`. Ne pas utiliser une commande qui rejoue automatiquement toutes les anciennes migrations appliquées à la main.
5. Recharger la page. Les références JS et CSS ont un nouveau numéro de version.

Depuis un terminal connecté à Cloudflare, dans le dossier du dépôt :

```sh
npx wrangler d1 export fmt-endurance --remote --output=../endurance-avant-v7.sql
npx wrangler d1 execute fmt-endurance --remote --file=migrations/0012_participants.sql
```

L'export doit réussir avant de lancer la seconde commande. Conserver le fichier SQL hors du dépôt GitHub et hors de `public/` : il contient les données du site. Documentation officielle : https://developers.cloudflare.com/d1/wrangler-commands/

Pour une application depuis la console D1, conserver les retours à la ligne du fichier SQL, notamment après les commentaires commençant par `--`. « This query returned no data » n'est pas en soi une erreur de création de schéma. Vérifier ensuite :

```sql
SELECT COUNT(*) AS inscriptions_sans_fiche
FROM registrations WHERE participant_id IS NULL;
PRAGMA foreign_key_check;
```

La première requête doit renvoyer 0 ; la seconde ne doit renvoyer aucune ligne.

## Comportement

- Chaque pilote possède une fiche stable partagée par ses catégories et départs. Le pseudo ne sert plus de clé pour retirer les inscriptions concurrentes.
- « Mon inscription » concerne la personne connectée. « Inscrire un pilote » permet à l'organisateur de choisir une fiche existante ou d'en créer une. Pour un pilote déjà inscrit par un autre organisateur, sélectionner sa fiche existante.
- « Mes inscriptions » distingue les inscriptions personnelles et celles gérées pour d'autres pilotes.
- L'affectation à un équipage et le retrait des autres catégories du même pilote, sur le même départ, sont réalisés ensemble. Les inscriptions sur d'autres départs sont conservées.
- L'organisateur voit les catégories qui seront retirées avant l'ajout. Le message de réussite indique combien ont été retirées.
- Un pilote affecté ne peut plus ajouter une catégorie sur ce départ. Ses heures et souhaits restent modifiables. Pour changer de catégorie ou se déclarer indisponible, il faut d'abord le retirer de l'équipage. La désinscription reste possible.
- Les totaux de pilotes utilisent les fiches distinctes. Les compteurs par catégorie représentent les inscriptions, qui peuvent concerner plusieurs départs.
- Récapitulatif de course allégé, formulaires harmonisés, couleurs GT3 verte et GTE orange, couleurs de noms cohérentes avec l'équipage. La grille d'heures conserve une ligne sur ordinateur et jusqu'à 12 colonnes par ligne sur téléphone.

## Anciennes données et limites

La migration conserve les inscriptions et les équipages. Elle rapproche les anciennes inscriptions lorsqu'elles partagent un compte Discord, un jeton invité ou le même organisateur et le même pseudo normalisé. Elle ne fusionne pas automatiquement des homonymes créés par des organisateurs différents ni des pseudos anciens différents : cette correspondance ne peut pas être déduite avec certitude. Les éventuelles fiches historiques séparées nécessitent un examen avant regroupement.

Une inscription créée par un organisateur pour un pilote ne devient pas automatiquement la propriété d'un compte Discord portant le même pseudo. Le créateur conserve ses droits de gestion. Aucun droit administrateur supplémentaire n'est introduit.

Une ancienne double inscription déjà affectée avant cette migration n'est pas effacée par la migration. Retirer le pilote de l'équipage, puis le réaffecter à partir de sa fiche commune applique la nouvelle règle de retrait des autres catégories.

## Sauvegarde et retour arrière

Refaire un export D1 avant chaque modification du schéma. Vérifier périodiquement un export dans une base séparée avant d'en dépendre pour une restauration. La procédure fournie ne configure pas de sauvegarde automatique ni de suppression des archives.

Après cette migration, remettre uniquement un ancien `index.html` ou un ancien serveur n'est pas un retour arrière complet : les nouvelles contraintes exigent une fiche pilote. En cas de problème, conserver l'export et coordonner le retour du code et du schéma ; ne pas supprimer les tables à la main. Une restauration de données peut perdre les inscriptions postérieures à la sauvegarde.

## Vérifications locales

`node --test tests/api.test.mjs tests/interface.test.mjs`

Les tests couvrent notamment la reconnexion, les droits, l'identité partagée entre organisateurs, le changement de pseudo, le retrait des catégories concurrentes, les conflits de version et la conservation d'une base peuplée pendant la migration. Le build Worker est produit avec `node scripts/build.mjs --workers`.

Résultat : 15 tests réussis et build Worker réussi. Le contrôle visuel dans un navigateur réel n'a pas pu être effectué : son téléchargement a échoué. Vérifier après déploiement les heures 13 à 24 sur téléphone, l'ajout d'une catégorie, les couleurs GT3/GTE et la sélection d'une fiche pilote existante. Les tests locaux n'ont modifié aucune donnée de production.
