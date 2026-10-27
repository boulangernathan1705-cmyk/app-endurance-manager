# Récap de préparation sur Discord

Le récap annonce les courses, départs, équipages, catégories, voitures, pilotes, places ouvertes/completes et pilotes sans équipage (un par ligne, avec les logos de ses catégories). Les logos de catégorie sont les emojis du bot lui-même (`images/discord-emojis`, envoyés une fois par le bot, sans Nitro) ; tant qu’ils manquent, la catégorie garde sa couleur. Il ne constitue pas un bilan des résultats sportifs. Chaque communauté ne publie que ses propres inscriptions, équipages et absences, y compris sur les courses officielles partagées.

## Réglage « Discord »

Dans **Administration → Modules → Discord → Régler**, le réglage se fait question par question (`server/discord-layout.mjs`) : chaque réponse fait apparaître les questions qui en dépendent. Sur téléphone, une question par écran, le croquis du serveur à la fin.

1. **Comment ranger les courses ?**
   - **Un fil par course** : chaque course a son fil « 🏎️ LMU · 6h de Spa » dans `# endurances-de-la-semaine` (le bloc de la course seul, sans l’en-tête de la semaine ; ouvert une semaine, rouvert par le bot à sa prochaine mise à jour s’il a été archivé), et sa catégorie du même nom pour les vocaux de ses équipages, créée dès qu’elle a un équipage (vocaux activés). Les réglages faits avant gardent leur catégorie : le salon `infos-de-la-course` est supprimé et remplacé par le fil. Une course a son fil 7 jours avant son départ (15 jours pour une course de 24 h ou plus), même sans inscrit (les courses officielles iRacing importées attendent un inscrit de la communauté). Plus de nouvelle catégorie quand le serveur approche les 500 salons de Discord.
   - **Récap de la semaine + pit talk** : les récaps de la semaine à un endroit, les vocaux d’équipage dans « Pit talk ».
2. **Quelles simus ?** LMU, iRacing ou les deux ; avec les deux : **ensemble ou séparés**.
3. Par course : le bot crée sa catégorie **« Endurance Manager »** (ou **« LMU »** et **« iRacing »** séparées) juste sous la catégorie choisie, chacune suivie de ses courses (LMU d’abord, puis iRacing, chacune par date). Dedans : `# endurances-de-la-semaine` (toujours, les fils des courses y sont) et, au choix, `# event-solo-de-la-semaine` (`# event-tdz-de-la-semaine` avec EVENT TDZ).
4. Récap de la semaine : où mettre les endurances (`# endurances-de-la-semaine` ; simus séparées : un `# endurances-de-la-semaine` par simu, dans « LMU » et « iRacing » créées par le bot, ou `# endurances-lmu-de-la-semaine` / `# endurances-iracing-de-la-semaine` juste sous un même endroit) et les events (avec les endurances, ailleurs, ou pas). Chaque endroit : **ne pas afficher**, **dans une catégorie du bot** (« Endurance Manager », ou « LMU » / « iRacing » séparées, placées juste sous la catégorie choisie ; sous une catégorie privée, privées comme elle si l'admin le choisit : le bot copie ses droits et les garde à jour, ce qui demande « Gérer les rôles »), ou **juste sous** un salon ou une catégorie du serveur : sous un salon, le bot crée le sien dans la même catégorie, juste après ; sous une catégorie, en tête de celle-ci.
5. **Des vocaux d’équipage ?** Par course : dans la catégorie de la course, nommés « Équipage A ». Récap de la semaine : le bot crée **« 🎙️ Pit talk »** juste sous la catégorie choisie, ou les met dans une catégorie existante ; nommés « LMU · 6h de Spa · Équipage A ». Puis **Rappels avant le départ** (cloche du site 24 h avant, chat du vocal 24 h et 1 h avant).

Chaque récap est **un message à part**, avec ses propres limites Discord ; plusieurs récaps peuvent partager un salon. Chez TDZ le calendrier passe en premier, ailleurs les endurances d’abord. Séparés, chaque simu a ses events (iRacing d’un côté, les autres simus de l’autre).

Un croquis « Sur ton serveur » suit les choix ; **Voir les messages** montre ce que le bot écrira sans rien envoyer. Rien n’est publié avant **Activer**.

**Changer d’avis** : le bot met le nouveau réglage en place puis retire ce qu’il avait créé pour l’ancien (messages, salons, catégories de course). Ses catégories (« Endurance Manager », « LMU », « iRacing », « Pit talk ») ne sont supprimées qu’une fois vides ; une catégorie de course attend que ses vocaux en soient partis. Les vocaux rejoignent leur nouvel endroit, renommés. **Tout retirer** supprime tout ce que le bot a créé (les vocaux occupés attendent d’être vides) ; les réponses restent pour la prochaine fois. Ce qui ne tient pas en une fois continue tous les quarts d’heure.

Un réglage fait avant ce questionnaire continue tel quel (catégories et salons choisis à l’époque, `# récap-de-la-semaine`, `# calendrier-de-la-semaine`) jusqu’au prochain enregistrement.

## Calendrier de la semaine

Le message « 📅 Calendrier de la semaine du … » liste les events (format solo) de la semaine en heure de Paris (ou de la prochaine semaine qui en a), un paragraphe par event : nom (lien vers le site), simu, circuit, départ, puis places (« 14/20 places », « complet · 3 en attente ») ou nombre d’inscrits de la communauté. Les events ne sont jamais dans les récaps d’endurance ni dans les catégories de course.

## Bot et permissions

Le Worker doit disposer de `DISCORD_CLIENT_ID` et du secret `DISCORD_BOT_TOKEN`. Ne jamais placer ce secret dans le dépôt ou dans le navigateur. Utiliser **Donner les droits au bot** pour l’inviter sur le serveur concerné.

Le bot doit pouvoir **Voir le salon**, **Envoyer des messages**, **Intégrer des liens** et **Voir les anciens messages**. Le mode par événement exige aussi **Gérer les salons** pour créer, ranger et supprimer les catégories des courses. Les permissions du salon/de la catégorie, y compris les refus propres au bot et à ses rôles, sont vérifiées avant activation ; la page indique précisément les permissions manquantes. Les erreurs Discord sont également affichées après une synchronisation. Les nouvelles catégories de course reprennent les permissions de la catégorie choisie. Les catégories déjà créées conservent leurs permissions : en cas de salon vide, vérifier les droits du bot dans cette catégorie et son salon, puis cliquer sur **Réparer** pour publier dans le salon existant.

## Message unique, salons par événement

- Chaque publication conserve son identifiant de message et modifie ce message sur place. Une inscription, un changement d’équipage ou une absence ne crée pas une nouvelle publication et ne provoque pas de notification répétée.
- Les mentions sont désactivées ; le premier message du bot est également envoyé avec les notifications supprimées.
- Tous les départs d’une même endurance sont regroupés dans son salon. La clé de suivi utilise la communauté et l’identité de l’événement, jamais son nom, son équipage ou un horaire de départ.
- Le nom du salon est dérivé du nom de l’endurance, avec un suffixe stable. Les événements homonymes et les collisions ne mélangent pas leurs données.
- Les nouveaux événements éligibles obtiennent automatiquement leur salon. Le bot traite au plus deux événements par synchronisation pour rester dans son budget de requêtes ; les autres passent aux synchronisations suivantes.
- Les synchronisations concurrentes partagent un verrou. L’empreinte du contenu évite les éditions inutiles. Un salon créé juste avant une interruption est retrouvé grâce à son marqueur de sujet ; un premier message dont la réponse a été perdue est retrouvé dans l’historique récent avec son nonce.
- Si un message ou un salon suivi a été supprimé, l’état devient **Publication en erreur**. L’administrateur clique sur **Réparer le récap** : les salons de course disparus et les messages supprimés sont rétablis, sans changer les réglages ni les inscriptions. Les publications encore présentes sont conservées. Le récap de la semaine reste dans le salon choisi ; si celui-ci a disparu, il faut en choisir un autre. Aucune nouvelle publication automatique après un refus de permissions ou une erreur réseau ambiguë.
- Discord accepte au plus 10 embeds et 6000 caractères cumulés. Les longues listes sont condensées, puis abrégées si nécessaire ; les liens vers le site donnent accès aux détails complets.

## Suppression après la course : décision confirmée

**Le fil d’une course et sa catégorie, avec tout leur contenu, sont supprimés 24 heures après la fin de son dernier départ** (les vocaux d’équipage le sont déjà 2 h après la fin). La catégorie choisie par les admins n’est jamais supprimée. Supprimer un fil demande « Gérer les fils » : un bot invité avant l’archive à la place. Un salon créé par la première version (directement dans la catégorie choisie) est déplacé dans la catégorie de sa course, message conservé. Le calcul utilise l’horaire de ce dernier départ et la durée de la course, en minutes lorsqu’elle est renseignée.

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
