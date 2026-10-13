# Récap de préparation sur Discord

Le récap annonce les courses, départs, équipages, catégories, voitures, pilotes, places ouvertes/completes et pilotes sans équipage (un par ligne, avec les logos de ses catégories). Les logos de catégorie sont les emojis du bot lui-même (`images/discord-emojis`, envoyés une fois par le bot, sans Nitro) ; tant qu’ils manquent, la catégorie garde sa couleur. Il ne constitue pas un bilan des résultats sportifs. Chaque communauté ne publie que ses propres inscriptions, équipages et absences, y compris sur les courses officielles partagées.

## Configuration guidée

Dans **Administration → Modules → Récap de la semaine sur Discord → Régler** :

1. Choisir **Récap général** (un salon texte existant, un message regroupant les courses) ou **Une catégorie par course** (« 🏎️ LMU · 6h de Spa » : un salon `infos-de-la-course`, puis les vocaux des équipages si le module Équipages est actif). Une course a sa catégorie 7 jours avant son départ (15 jours pour une course de 24 h ou plus), même sans inscrit (les courses officielles iRacing importées attendent un inscrit de la communauté) : les vocaux d’équipage y sont créés directement. Plus de nouvelle catégorie quand le serveur approche les 500 salons de Discord. Les catégories des courses se rangent sous la catégorie choisie, dans l’ordre de leur création.
2. Cocher **LMU**, **iRacing**, ou les deux, indépendamment du mode. Les nouveaux réglages proposent les deux simulateurs ; les réglages existants préremplissent leur sélection.
3. Sélectionner directement le **salon texte** en mode général ou la **catégorie** en mode par événement sur le serveur Discord de la communauté. Aucun webhook à copier pour les nouvelles configurations.
4. Consulter l’aperçu sur le site puis cliquer **Activer le récap automatique**. L’aperçu ne publie rien. **Envoyer un test sur Discord** est une action volontaire distincte : elle utilise le même message que l’activation, sans activer l’automatisation. Pour un récap déjà activé, tester des réglages différents demande d’abord leur activation afin de préserver la publication actuelle.

Après activation, une page courte indique l’état, le mode, les simulateurs, la destination et les erreurs éventuelles. **Modifier**, **Voir l’aperçu** et **Désactiver** restent disponibles ; aucun parcours hebdomadaire n’est nécessaire.

## Bot et permissions

Le Worker doit disposer de `DISCORD_CLIENT_ID` et du secret `DISCORD_BOT_TOKEN`. Ne jamais placer ce secret dans le dépôt ou dans le navigateur. Utiliser **Donner les droits au bot** pour l’inviter sur le serveur concerné.

Le bot doit pouvoir **Voir le salon**, **Envoyer des messages**, **Intégrer des liens** et **Voir les anciens messages**. Le mode par événement exige aussi **Gérer les salons** pour créer, ranger et supprimer les catégories des courses. Les permissions du salon/de la catégorie, y compris les refus propres au bot et à ses rôles, sont vérifiées avant activation ; la page indique précisément les permissions manquantes. Les erreurs Discord sont également affichées après une synchronisation. Les nouvelles catégories de course reprennent les permissions de la catégorie choisie. Les catégories déjà créées conservent leurs permissions : en cas de salon vide, vérifier les droits du bot dans cette catégorie et son salon, puis relancer le test pour publier dans le salon existant.

## Message unique, salons par événement

- Chaque publication conserve son identifiant de message et modifie ce message sur place. Une inscription, un changement d’équipage ou une absence ne crée pas une nouvelle publication et ne provoque pas de notification répétée.
- Les mentions sont désactivées ; le premier message du bot est également envoyé avec les notifications supprimées.
- Tous les départs d’une même endurance sont regroupés dans son salon. La clé de suivi utilise la communauté et l’identité de l’événement, jamais son nom, son équipage ou un horaire de départ.
- Le nom du salon est dérivé du nom de l’endurance, avec un suffixe stable. Les événements homonymes et les collisions ne mélangent pas leurs données.
- Les nouveaux événements éligibles obtiennent automatiquement leur salon. Le bot traite au plus deux événements par synchronisation pour rester dans son budget de requêtes ; les autres passent aux synchronisations suivantes.
- Les synchronisations concurrentes partagent un verrou. L’empreinte du contenu évite les éditions inutiles. Un salon créé juste avant une interruption est retrouvé grâce à son marqueur de sujet ; un premier message dont la réponse a été perdue est retrouvé dans l’historique récent avec son nonce.
- Si un message ou un salon suivi a été supprimé, l’état devient **Publication en erreur**. L’administrateur clique sur **Réparer le récap** : les salons de course disparus et les messages supprimés sont rétablis, sans changer les réglages ni les inscriptions. Les publications encore présentes sont conservées. Le récap général reste dans le salon choisi ; si celui-ci a disparu, il faut choisir un autre salon via Modifier. Aucune nouvelle publication automatique après un refus de permissions ou une erreur réseau ambiguë.
- Discord accepte au plus 10 embeds et 6000 caractères cumulés. Les longues listes sont condensées, puis abrégées si nécessaire ; les liens vers le site donnent accès aux détails complets.

## Suppression après la course : décision confirmée

**La catégorie d’une course et son salon `infos-de-la-course`, avec tout leur contenu, sont supprimés 24 heures après la fin de son dernier départ** (les vocaux d’équipage le sont déjà 2 h après la fin). La catégorie choisie par les admins n’est jamais supprimée. Un salon créé par la première version (directement dans la catégorie choisie) est déplacé dans la catégorie de sa course, message conservé. Le calcul utilise l’horaire de ce dernier départ et la durée de la course, en minutes lorsqu’elle est renseignée.

Le contrôle de suppression s’exécute toutes les 15 minutes et relit les horaires avant de supprimer : le délai de 24 heures n’est jamais anticipé. Les suppressions sont traitées par petits lots ; une erreur Discord, une synchronisation en cours ou une file importante peut retarder le prochain essai. Une modification de l’horaire ou de la durée est prise en compte. Tant qu’un horaire reste à confirmer ou que la durée est inconnue, aucune suppression automatique n’est programmée.

Le salon général est conservé. Désactiver le récap ou repasser au mode général ne suspend pas le nettoyage des salons d’événement déjà créés. Si un événement est supprimé du site, son dernier délai connu reste utilisé pour son salon Discord. Les salons vocaux d’équipage et leur nettoyage existant restent indépendants.

## Période et absents

Le récap général conserve la période existante : semaine en heure de Paris, avec bascule vers la prochaine semaine comportant un départ futur si nécessaire. Le salon d’un événement conserve ses différents départs, y compris au-delà de cette semaine, jusqu’à son expiration.

Les absents déclarés figurent en bas du bloc de leur événement, uniquement pour la communauté concernée. La liste est masquée si vide et suit les déclarations/retraits.

## Transition vers le bot

Les publications de récap par webhook sont retirées : ni le secret historique `DISCORD_WEEKLY_WEBHOOK_URL`, ni les lignes de `community_recaps` ne déclenchent un envoi. Les anciens endpoints de configuration et de test répondent 410 et orientent vers le module bot. Leurs données historiques sont conservées sans être utilisées pour publier ; aucun ancien message Discord n’est supprimé.

Les deux modes, général et par course, sont gérés par le bot. Une communauté déjà configurée avec le bot garde ses réglages et identifiants de publication. Une communauté encore au webhook doit choisir une destination dans Administration → Modules, donner les droits nécessaires au bot puis activer le récap. Sa sélection de simulateurs est proposée quand elle peut être déduite des anciens réglages. Le token d’un webhook ne permet pas au bot de modifier son ancien message : le bot utilise sa propre publication.

Le bouton **Donner les droits au bot** est accessible pendant le choix de destination et depuis l’état du récap en cas d’erreur. Il demande Voir le salon, Envoyer des messages, Voir les anciens messages, Intégrer des liens et Gérer les salons. Les refus propres à un salon ou une catégorie doivent aussi être corrigés dans Discord ; une invitation ne les annule pas. Actualiser les destinations vérifie à nouveau les droits effectifs avant activation. Désactiver le bot ne réactive jamais un webhook.



## Vérification sur un Discord de test

Ces étapes nécessitent une destination explicitement autorisée. Les tests automatisés utilisent un faux Discord et n’envoient rien sur un serveur réel.

1. Inviter le bot et vérifier les refus de permissions sur un salon texte et sur une catégorie.
2. Tester le mode général avec LMU seul, iRacing seul puis les deux. Noter l’identifiant du message ; modifier une inscription et vérifier que le même message est édité sans notification.
3. Activer le mode par événement avec deux courses homonymes et plusieurs départs de l’une d’elles. Vérifier deux catégories, un salon `infos-de-la-course` et un message dans chacune et l’isolation entre communautés.
4. Déclarer puis retirer une absence. Vérifier la liste en bas du bon événement et sa disparition quand elle est vide.
5. Sur des courses fictives, vérifier que le salon reste présent avant fin + 24 h puis disparaît au contrôle suivant. Reporter un départ et vérifier que sa nouvelle fin est utilisée. Confirmer que le salon général reste présent.
6. Retirer temporairement une permission puis la rétablir. Vérifier l’erreur affichée et la reprise sans doublon.

## Aperçu de l’interface

Captures réalisées localement avec des réponses API fictives :

- [Choix sur ordinateur](previews/issue-261/recap-choices-desktop.png)
- [Choix sur mobile](previews/issue-261/recap-choices-mobile.png)
- [Aperçu sur ordinateur](previews/issue-261/recap-preview-desktop.png)
- [Aperçu sur mobile](previews/issue-261/recap-preview-mobile.png)

## Réparation par un administrateur

Dans Administration → Modules → Récap, **Réparer le récap** vérifie les droits réels de la destination enregistrée et relance la publication. La réparation respecte le verrou de synchronisation et conserve mode, simulateurs, destination et activation. Un récap désactivé reste désactivé. Pour plusieurs courses, les lots restent limités à deux : relancer la réparation pour les suivantes.

- **Salon ou catégorie de course disparu** : la réparation le rétablit avec les permissions de la destination.
- **Message supprimé** : le bot publie un nouveau message dans le salon existant ; les messages présents sont modifiés, sans doublon ni mentions.
- **Destination supprimée ou serveur changé** : Modifier → actualiser les destinations → choisir la destination actuelle → activer.
- **Permissions manquantes** : donner les droits au bot et vérifier les refus propres au salon sur Discord, puis réparer. Le bot ne s’accorde aucun droit automatiquement.
- **Discord temporairement indisponible** : l’erreur est affichée ; réessayer plus tard. Une panne réseau ne déclenche pas la création d’un deuxième message.
