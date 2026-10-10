# Rôles Discord → autorisations Endurance Manager

Les autorisations se règlent dans **Administration → Membres et rôles → Rôles**. Chaque case est enregistrée immédiatement et les autorisations de tous les rôles du membre se cumulent.

| Autorisation | Effet |
| --- | --- |
| Accès Endurance Manager | Entrer dans l’espace de la communauté et consulter ses courses |
| Endurances | S’inscrire aux endurances et rejoindre un équipage |
| Événements OPEN | S’inscrire aux événements OPEN |
| Événements SAFE | S’inscrire aux événements SAFE et OPEN |
| Équipages | Créer et gérer les équipages |
| Administrer | Administrer la communauté, ses réglages, ses courses et ses inscriptions |

## Réserver l’espace à certains rôles

1. Laisser **Accès Endurance Manager** décoché pour `@everyone`.
2. Cocher cette autorisation sur les rôles autorisés, par exemple « Pilote » ou « Safe ».
3. Cocher leurs autres autorisations selon les actions souhaitées.
4. Attribuer ces rôles aux membres sur Discord.

L’accès est fermé par défaut pour les membres ordinaires : ni l’appartenance au Discord, ni une autorisation d’inscription ou d’équipage ne suffisent. Au moins un rôle, `@everyone` compris, doit accorder l’accès. Les administrateurs du site, le propriétaire du Discord, ses rôles « Administrateur » et les gestionnaires de la plateforme conservent leur accès pour configurer la communauté.

Sans accès, le compte peut se connecter avec Discord mais voit « Accès réservé ». Les données et actions de la communauté sont protégées côté serveur, même par un lien direct à l’API. Une communauté non autorisée ne figure pas dans « Mes communautés » et ses équipages et inscriptions ne sont pas exposés dans les courses officielles depuis une autre communauté. La vitrine publique de la plateforme reste accessible.

## Synchronisation

Le bot lit les rôles uniquement sur le Discord lié à la communauté. Lors d’une visite, les rôles sont revérifiés après dix minutes ; la tâche planifiée vérifie aussi les membres quotidiennement. **Actualiser depuis Discord** permet une vérification immédiate. Une modification des cases sur le site s’applique dès la prochaine requête, sans nouvelle connexion.

Retirer l’accès ne supprime pas les inscriptions ni les équipages existants. En cas d’indisponibilité de Discord, les rôles déjà connus sont conservés ; un membre jamais vérifié ne peut pas entrer.

## Mise en service

Le bot doit être présent sur le Discord de la communauté, son identifiant enregistré et son jeton configuré comme secret Cloudflare `DISCORD_BOT_TOKEN`. L’activation de cette autorisation nécessite que les administrateurs cochent l’accès sur les rôles choisis avant que les pilotes puissent revenir. Les autorisations sont stockées dans les réglages existants : aucune migration D1 n’est nécessaire.
