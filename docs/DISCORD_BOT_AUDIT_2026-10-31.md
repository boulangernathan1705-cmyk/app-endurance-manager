# Audit du bot Discord — 31 octobre 2026

## Périmètre et méthode

Code de départ : `dev` à `34a65a0136bd9608640374d9ef818249de0f756d`, après synchronisation de la release `main` à `25d51e6`. Lecture des modules Discord, accès par rôles, notifications, routes d'administration et déclencheurs planifiés ; tests avec Discord simulé et toutes les migrations SQLite appliquées. Consultation des documentations officielles Discord sur les permissions, fils et mentions.

Contrôles en production **en lecture seule** : déclencheurs du Worker `endurance-manager-prod`, réglages Discord et états de suivi D1. Aucune écriture dans la base de production, aucun message ou ping réel, aucune modification de rôle ou de salon pendant cet audit. Le contrôle D1 constate l'état enregistré par l'application ; il ne remplace pas une lecture directe des permissions Discord ni une vérification des notifications reçues sur les clients Discord.

## Ce que fait le bot et qui reçoit quoi

| Action | Déclenchement et destinataires | Mention / notification | Permissions et accès |
| --- | --- | --- | --- |
| Contrôle d'accès au site | Connexion/visite après 10 min ; rotation des membres non contrôlés depuis 24 h ; actualisation admin | Aucun message | Lit les membres et rôles du serveur lié. Cumule les autorisations du site ; `access` nécessaire, administration implicite incluse. Ne distribue pas les rôles Discord aux pilotes. |
| Récaps de semaine et calendrier | Changements mis en file, contrôle toutes les 2 min ; rotation horaire à `:30` | Cartes initiales sans mentions, drapeau silencieux ; modifications sans mentions | Bot : voir, écrire, historique, liens ; gestion de salons pour ses propres créations. Copie des restrictions de catégorie selon le choix de l'admin. Informations limitées à la communauté. |
| Fils de course | Course admissible dans les 7 jours, 15 jours pour une course d'au moins 24 h ; règles particulières pour les courses iRacing officielles | Création des cartes silencieuse | Création de fils publics, écriture dans les fils et gestion des fils pour leur suppression. Un fil public reste soumis à la visibilité de son parent. |
| Ajout aux fils | Passages de 2 min, lots de 50, membres connus du serveur avec accès au site ; inscrits prioritaires | Mentions individuelles introduites dans une modification de la carte, puis retirées ; aucun nouveau message | Le mécanisme d'adhésion et l'absence de badge restent à vérifier sur un client Discord réel. L'accès au site et la visibilité Discord sont deux politiques distinctes. |
| Vocal d'équipage | Dès création avec horaire connu ; synchronisation dédiée toutes les 5 min, également après changements en file | Carte et changements sans mentions, noms simples | Politique actuelle : vocal **public pour les membres du serveur**, y compris sous une catégorie privée. Autorise les fonctions normales du vocal et de son chat ; n'accorde pas de nouvelle modération, administration ou mention de masse aux membres. |
| Rappels dans le vocal | Dans les 24 h et 1 h précédant le départ, si activés ; si les deux sont dus, seul le plus proche est envoyé | Silencieux, `allowed_mentions.parse=[]`, drapeau 4096 ; pas de ping individuel | Recompte les rappels lorsque l'heure du départ change. Budget partagé et rotation : 5 min est la fréquence de traitement, pas une garantie d'envoi à la seconde. |
| Rappel dans la cloche du site | Premier passage dans les 24 h avant un départ, si activé | Notification sur le site ; aucun ping Discord | Pilotes inscrits connus lors du passage ; limites sur les inscrits tardifs ci-dessous. |
| Fin de course et fermeture du vocal | Message après arrivée ; suppression à partir d'arrivée + 2 h ; suppression d'équipage explicite : fermeture immédiate | Message de fin silencieux | Hors suppression explicite, attend qu'aucun des pilotes suivis ne soit connecté. Une panne de lecture de leur état ne doit pas autoriser la suppression. |
| Suppression des fils/récaps de course | Dernier départ + durée + 24 h ; tâches de nettoyage au quart d'heure | Aucun ping | Recalcule l'échéance. Les destinations des administrateurs sont protégées ; gestion de fils nécessaire pour supprimer un fil. |
| Annonce du jour | Premier traitement dès **7 h 30 heure de Paris** ; rafraîchissement du contenu toutes les 10 min au plus tôt | Au plus une **tentative** `@everyone` par communauté et jour, avant 9 h, avec une course inscrite ; reprise, déplacement, inscription tardive et stream seul silencieux | Seul le salon d'annonce configuré. La réservation du ping est enregistrée avant l'appel Discord. Cela évite sa répétition, sans garantir sa réception. |
| Boutons Présent / Absent | Présent ouvre le site ; Absent vérifie une interaction signée, le serveur, les autorisations et la situation du pilote | Réponse éphémère au seul utilisateur | Aucun rôle attribué. Une course passée ou un pilote déjà inscrit ne peut pas être marqué absent par ce bouton. |
| Mot de passe Gridfest | Action explicite d'un admin, lots de 8 pilotes confirmés | Message privé au destinataire ; aucune mention collective | Vérifie l'appartenance au serveur, la place et la version de l'événement. Aucun mot de passe publié dans les salons ou les récaps. Les MP peuvent être refusés par le destinataire. |
| Demande de communauté | Soumission du formulaire | Message administratif avec mentions désactivées | Aucun accès ou rôle automatiquement accordé au demandeur. |
| Mise en place du Discord officiel | Action réservée aux gestionnaires de la plateforme | Aucun ping de bienvenue | Crée/actualise les rôles Staff et Organisateur et organise les salons ; traitement distinct nécessitant l'administration du serveur. Pas d'attribution automatique de ces rôles aux utilisateurs. |

Une matinée sans course inscrite consomme son occasion de ping : une première inscription ultérieure peut créer une annonce, mais elle reste silencieuse. Les enregistrements `ping_attempted=1` ne prouvent donc pas qu'un ping a été envoyé.

## Anomalies corrigées dans cette branche

| Priorité | Constat initial | Correction et preuve |
| --- | --- | --- |
| Haute | Les invitations des deux écrans Discord ne demandaient pas les mêmes droits ; le ping collectif était absent des deux et la gestion des permissions absente de l'invitation récap. | Même ensemble complet de droits pour le bot, sans Administrateur ni droits de modération des membres. Test des bits et des liens exposés par les routes. Les refus locaux d'une catégorie doivent toujours être traités sur Discord. |
| Haute | Le salon d'annonce pouvait être déclaré prêt sans lecture de l'historique. Après une réponse perdue, l'absence d'historique compromet la récupération du message initial. | Historique exigé dans le salon réel d'annonce, signalé précisément avant activation. Le test de présentation, qui ne récupère pas un message antérieur et ne pingue pas, conserve ses besoins minimaux. |
| Haute | Un salon existant pouvait accepter la création de fils sans autoriser leur suppression ; la validation des catégories propres au bot omettait les droits sur les fils et la gestion des permissions. | Vérifications complétées avant enregistrement ; tests de refus individuels puis de rétablissement. |
| Moyenne | La synchronisation comparait uniquement les règles des membres. Une règle propre au bot privée de droits sur les fils n'était pas réparée si les autres règles étaient inchangées. | Les catégories et salons gérés par le bot contrôlent aussi sa règle personnelle. Réparation stable au passage suivant, sans accorder la gestion des fils aux membres ni remplacer les règles des vocaux. |
| Moyenne | Les administrateurs du site avec un rôle `admin` sans case `access`, et les gestionnaires de plateforme membres du serveur, étaient omis de la sélection d'ajout aux fils. | Sélection alignée sur l'accès implicite des administrateurs et gestionnaires, tout en exigeant une appartenance enregistrée au serveur. Test des deux cas et maintien de l'exclusion des membres sans accès. |
| Haute | À l'expiration d'un vocal, une erreur de lecture de l'état vocal d'un pilote était assimilée à une absence ; une erreur 403 ou serveur pouvait donc conduire à supprimer un vocal occupé. | Seule une absence confirmée (`Unknown Voice State` / `Unknown Member`) permet de poursuivre. Les erreurs de droits ou serveur reportent la suppression ; reprise vérifiée après retour à la normale. La suppression explicite d'un équipage conserve sa fermeture immédiate. |
| Moyenne | L'erreur de modification des droits d'un vocal orientait seulement vers voir/gérer les salons/se connecter. | Message enrichi avec « Gérer les rôles », nécessaire à la modification des permissions. Cela améliore le diagnostic sans présumer la cause exacte d'un refus réel. |

## Fragilités restant identifiées

Ces points ne sont pas présentés comme corrigés par cette branche :

1. **Rappel de cloche suivi par départ, pas par pilote ni heure du départ.** `bellReminders` marque `race_reminders` avant de constituer les destinataires et d'insérer leurs notifications. Un inscrit tardif peut manquer le rappel ; déplacer l'heure du même départ ne crée pas un nouveau rappel de cloche. Une interruption après le marquage peut aussi le perdre. Un suivi individuel et transactionnel est nécessaire pour garantir ces cas. Aucun impact sur le droit au ping quotidien Discord.
2. **Envoi vocal ambigu.** Les bits des rappels 24 h / 1 h et du message de fin sont enregistrés après leur POST Discord. Une réponse perdue ou une écriture D1 échouée peut conduire à répéter un message silencieux. `allowed_mentions` reste vide : ce défaut ne permet pas de pinguer les pilotes.
3. **Diagnostic vocal minimal.** Le contrôle d'activation historique vérifie le socle voir/gérer/écrire/historique/connexion ; il ne valide pas séparément chaque fonction élargie accordée au vocal ni tous les droits nécessaires à sa modification. L'invitation corrigée demande l'ensemble, mais un bot installé avant doit être réautorisé et les refus locaux restent possibles. Le refus réel sur `commu-dev` demande cette vérification.
4. **Adhésion aux fils par modification de mentions.** Les tests valident les utilisateurs sélectionnés et les requêtes émises, mais ne simulent pas le client Discord. L'adhésion effective et l'absence de badge doivent être confirmées sur un serveur de test. Si le retrait des mentions échoue après leur ajout, elles peuvent rester visibles jusqu'à une reprise ou une autre édition de la carte.

Autres limites examinées : les restrictions de visibilité Discord ne sont pas déduites automatiquement de la case d'accès au site ; un retrait d'accès au site n'efface pas les inscriptions existantes. Les vocaux publics ne deviennent pas privés parce qu'ils sont déplacés sous une catégorie privée. L'état vocal consulté au nettoyage est celui des pilotes suivis, pas un comptage garanti de tous les visiteurs du vocal.

## État observé en production

Lecture du 31 octobre vers **6 h 55–7 h, heure de Paris**, avant le créneau d'annonce :

- Déclencheurs réels conformes au dépôt : `*/2`, `*/5`, `*/15` minutes.
- Récaps activés pour `commu-dev`, `fmt`, `spm`, `tdz` ; pas d'erreur récap enregistrée à la lecture.
- Annonce du matin configurée sur `tdz` uniquement ; rappels activés sur `tdz` et `commu-dev`, désactivés sur `fmt` et `spm`.
- Deux vocaux suivis sur `tdz`, tous deux marqués `public-voice-v3:` et sans erreur vocal enregistrée.
- Un vocal suivi sur `commu-dev`, encore marqué `public-voice-v2:`, avec un refus de modification enregistré à **6 h 55 min 50 s**. Le détail enregistré ne permet pas de déterminer à lui seul le droit Discord manquant ; ne pas conclure que le nouveau correctif a déjà réparé ce serveur.
- Aucun vocal actif suivi pour `fmt` ou `spm` : cela ne valide pas leur prochaine création.
- Aucun envoi du 31 octobre attendu avant 7 h 30. Les lignes du 30 octobre sans message peuvent correspondre au retrait des courses terminées ; elles ne prouvent ni succès ni échec de réception d'une notification.

## Validation

11 scénarios de régression ajoutés : ils échouent tous sur le code initial et passent avec les corrections. `npm run check` réussit : **516 tests**, build Workers et audit strict. `git diff --check` réussit également. Aucun test n'utilise un jeton Discord réel. Les corrections sont proposées sur une branche vers `dev` ; elles ne sont pas déployées en production par cet audit.

## Références officielles

- [Mentions autorisées et messages](https://docs.discord.com/developers/resources/message#allowed-mentions-object) : nécessité de `MENTION_EVERYONE`, reconstruction des mentions à l'édition et limites des drapeaux silencieux.
- [Historique des messages](https://docs.discord.com/developers/resources/message#get-channel-messages) : une lecture sans `READ_MESSAGE_HISTORY` ne renvoie pas l'historique.
- [Permissions Discord](https://docs.discord.com/developers/topics/permissions) : priorités des règles, permissions des fils et visibilité du parent.
- [Salons et fils](https://docs.discord.com/developers/resources/channel) : `MANAGE_ROLES` pour modifier les permissions et `MANAGE_THREADS` pour supprimer un fil.
