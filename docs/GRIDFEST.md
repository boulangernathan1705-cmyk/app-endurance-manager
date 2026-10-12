# Gridfest TDZ (DEV)

Le module reste réservé aux TDZ et doit être activé dans Administration → Modules.
Le nom affiché est désormais **Gridfest**. La clé interne historique `grindfest`,
les identifiants des événements, les inscrits et l’ordre des listes d’attente sont conservés.
Les anciens types `Grindfest` restent acceptés ; la migration 0065 met leur libellé à jour.

## Inscription

Le lien d’invitation est celui du Discord configuré pour la communauté, sans lien codé en dur.
Le visiteur se connecte avec Discord, rejoint le serveur et conserve les règles d’accès existantes :
appartenance à la communauté et rôles autorisés. Après avoir rejoint Discord, la vérification
du compte peut prendre une minute ; « Vérifier mon accès » relance la lecture de ses droits.

Pour un Gridfest, le pilote renseigne son **nom exact en jeu** (obligatoire, 64 caractères au maximum).
Ce champ reste distinct de son identité Discord et apparaît dans les colonnes des streamers.
Les inscriptions déjà présentes restent en place ; leur nom en jeu doit être complété avant l’envoi du MP.
Les autres courses ne demandent pas ce champ.

La fiche conserve le parcours d’inscription du site : les informations pilote et le streamer
se choisissent à la première étape, puis le récapitulatif affiche l’identité Discord, le nom
dans le jeu, le streamer et les catégories. « Modifier » permet de revenir sur ces choix
sans perdre la saisie ; la validation finale enregistre une inscription pour toutes les manches.

## Mot de passe et MP Discord

1. Dans « Modifier l’événement », saisis le mot de passe (30 caractères maximum, sans espace) puis enregistre l’événement.
2. Configure ce même mot de passe sur le serveur de course.
3. Sur la page Gridfest, clique sur « Envoyer par MP » quand tu le décides.
4. « Suivi » affiche les MP envoyés, les échecs et les inscriptions à compléter.

Le bot utilise le compte Discord du pilote inscrit. Seuls les inscrits confirmés avec un nom en jeu
reçoivent le MP ; les listes d’attente et les inscriptions sans compte Discord sont exclues.
L’appartenance au Discord est vérifiée en direct, et la place ainsi que le mot de passe sont
revérifiés avant l’envoi. Un désistement ne déclenche jamais de MP automatique.

Le mot de passe n’est renvoyé par l’API des événements qu’aux administrateurs, même si le pilote
est déjà inscrit. Il n’est publié ni dans les salons, ni dans les récapitulatifs, ni dans les notifications.
Les MP bloqués sont signalés à l’admin. Après autorisation des MP par le pilote, relance l’envoi :
les MP déjà réussis pour ce mot de passe sont ignorés. Les envois sont découpés en petits lots
pour respecter les limites du Worker ; une interruption peut être reprise par la même action.

Un mot de passe partagé reste transmissible par son destinataire. Pour retirer l’accès d’un pilote
qui l’a reçu, change-le **sur le site et sur le serveur de course**, puis envoie le nouveau aux inscrits
confirmés. Si le jeu offre une liste de pilotes autorisés, elle permet de renforcer ce contrôle côté jeu.

## Livraison

Branche cible : `dev`. Le déploiement DEV applique la migration 0065 sur sa base D1 dédiée.
Aucune publication sur `main`, modification de configuration PROD ou copie de données DEV → PROD.
Les tests simulent Discord : ils n’envoient aucun MP réel aux pilotes.
