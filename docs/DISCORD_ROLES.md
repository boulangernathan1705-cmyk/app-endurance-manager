# Rôles Discord → droits sur le site (projet, pas encore développé)

Décidé le 26 septembre 2026. À développer quand le serveur Discord qui utilisera le site sera choisi.

## Principe
- Un bot Discord est invité sur le serveur de la communauté, sans aucune permission. L'option « Server Members Intent » est activée dans le Discord Developer Portal.
- À la connexion d'un membre, le site lit ses rôles sur le serveur.
- Toutes les 15 minutes, la tâche planifiée déjà en place relit les rôles des membres. Un rôle ajouté ou retiré sur Discord est donc répercuté sur le site en 15 minutes maximum.
- Coût pour Cloudflare : environ un appel Discord par tranche de 1 000 membres à chaque passage, et une écriture en base seulement quand des rôles ont changé. On reste très loin des limites de l'offre gratuite.

## Droits sur le site
Le site raisonne en droits plutôt qu'en rôles figés :

| Droit | Exemple |
|---|---|
| Consulter les courses | tout le monde, même sans connexion |
| S'inscrire comme pilote | rôle « safe » |
| Créer un équipage | rôle « safe » |
| Créer et gérer les événements | rôle « orga » |
| Administrer le site | rôle « admin » |

- **Page de réglage pour les administrateurs** : pour chaque droit, ils choisissent le ou les rôles Discord qui le donnent. La liste des rôles est lue directement sur le serveur.
- **Gestion des membres** : on y voit les rôles Discord de chacun et d'où viennent ses droits. Une exception manuelle reste possible pour dépanner.
- **Sans connexion, ou sans le bon rôle** : consultation seulement. L'inscription sans compte (lien personnel) sera supprimée.
- **Rôle retiré** : les droits disparaissent, les inscriptions déjà faites restent.

## Une communauté par site
- Le site est dédié à une seule communauté (un serveur Discord) : pas de sélecteur de communauté dans l'interface.
- Une autre communauté peut avoir sa propre copie : même code, avec son propre Worker, sa base, son serveur Discord et son adresse.
- Les valeurs propres à une communauté (identifiant du serveur, nom affiché, bannière) doivent donc être des réglages, pas du code en dur.

## Mise en place le moment venu
1. Créer l'application et le bot dans le Discord Developer Portal, activer « Server Members Intent », puis inviter le bot sur le serveur sans permission.
2. Enregistrer le jeton du bot comme secret Cloudflare (`DISCORD_BOT_TOKEN`), sur dev puis sur la prod.
3. Renseigner l'identifiant du serveur Discord.
4. Régler les correspondances entre rôles et droits dans la page d'administration.

## Plus tard, avec le même bot
- Événements Discord créés automatiquement pour chaque course.
- Rappels en message privé avant un départ.
- Commandes slash (`/courses`, `/inscription`).
- Annonces par webhook (nouvelle course, équipage complet).
