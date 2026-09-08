# Correction des inscriptions multi-catégories

Cette version corrige le parcours d’inscription dans plusieurs catégories :

- un pilote peut ajouter une autre catégorie après sa première inscription ;
- un organisateur ou un administrateur peut aussi ajouter une catégorie à son propre pseudo, tout en gardant le bouton pour inscrire un autre pilote ;
- si la base utilise encore l’ancien schéma, le site affiche maintenant une erreur claire demandant la migration 0011.

## Mise à jour

Remplace les fichiers source et la copie `public/` par ceux de cette archive, puis déploie.

Sur la base D1, applique une seule fois `migrations/0011_multi_category_registrations.sql`, après les migrations 0001 à 0009. Le message « This query returned no data » est normal pour cette migration : elle crée/modifie des tables et ne renvoie pas de lignes.

Pour vérifier l’application, exécute :

```sql
SELECT name FROM sqlite_master
WHERE type = 'index' AND name LIKE 'idx_registration%';
```

Les index `idx_registration_user_category`, `idx_registration_guest_category` et `idx_registration_name_category` doivent apparaître.
