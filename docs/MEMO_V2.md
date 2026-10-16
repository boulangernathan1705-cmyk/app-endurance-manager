# Mémo LMU v2 — dev

Deux onglets : Stands et Relais. Aucune recommandation ni routine d’entraînement.
Les pages utilisent les surfaces et accents communs du site, en mode clair et sombre.

## Mesures et confidentialité

Partage explicitement consenti. Un contributeur consulte ses données et la moyenne
des autres (lui-même exclu) ; un non-contributeur ne reçoit que les agrégats.
Chaque mesure collective demande trois pilotes. La moyenne est pondérée par les
observations dans les cinq dernières séances d’un pilote, puis à poids égal entre
pilotes. Les sessions sont triées par date du jeu, pas date d’envoi.

Une fiche distingue exactement circuit, tracé, voiture, conditions, composé et version
du jeu. Une propriété inconnue doit être explicitement « Non renseigné » et n’est pas
fusionnée avec les autres. Maximum 100 séances/contributeur, rétention de 90 jours.
Seules les mesures agrégées de la séance sont envoyées ; aucun nom de pilote tiers.

## Liaison à valider sur PC — pas de connecteur distribué à ce stade

`MEMO_CONNECTOR_READY` reste absent (false). La page permet de consentir mais n’annonce
aucune liaison active. Cette variable ne doit être activée qu’après un essai LMU/SimHub.
L’API de réception est prête pour cet essai. Il faut encore réaliser/valider l’adaptateur
et vérifier les propriétés réellement disponibles dans le jeu. Ne pas réutiliser
l’ancien exécutable ni ses clés : l’ancien schéma a été supprimé.

`POST /api/memo/link` (session navigateur + Origin) délivre une clé une seule fois,
après consentement et activation du connecteur. Elle expire après 90 jours ; recréer
une clé révoque la précédente. `DELETE /api/memo/link` la révoque sans effacer les
mesures. `DELETE /api/memo/consent` efface mesures et clé.

`POST /api/memo/collector`, `Authorization: Bearer <clé>`, JSON :

```json
{
  "schema": 1,
  "sessionId": "identifiant-stable-de-la-seance",
  "startedAt": 1792134000,
  "scope": {
    "circuit": "spa", "layout": "Spa WEC", "car": "Toyota GR010 Hybrid",
    "weather": "dry", "compound": "Medium", "gameVersion": "version-exacte"
  },
  "metrics": {
    "fuelLitres": {"value": 2.8, "count": 20},
    "energyPercent": {"value": 4.2, "count": 20},
    "lapSeconds": {"value": 124.2, "count": 20},
    "wearFL": {"value": 1.0, "count": 20}
  }
}
```

Exemple de protocole, jamais une donnée de production. `value` est la moyenne
mesurée ; `count` son nombre d’observations valides (par métrique). Seuls les tours
complets exploitables doivent entrer : exclure entrées/sorties des stands, invalides,
réinitialisations, changement de pneus et remontées de niveau. Ne jamais déduire une
consommation lors d’un ravitaillement. Les unités carburant/énergie/usure doivent être
converties explicitement ; aucune fraction 0–1 devinée côté serveur. Usure en points
de pourcentage perdus par tour. Omettre toute valeur non exposée par le jeu.

Les passages `pitTransit` sont sans arrêt (mêmes points entrée/sortie).
`pitLoss` est le delta par rapport au trajet piste entre points communs, hors
immobilisation — pas la durée de la voie des stands. Ne pas le déduire d’un tour
entier perturbé. Au minimum cinq tours pour publier les métriques de conduite.
Le serveur impose accès membre, module actif, clé valide, débit et taille bornés.
Une séance envoyée une seconde fois est ignorée ; envoyer seulement les séances closes.

## Références de services

`PUT /api/memo/pit-profile` est réservé au gestionnaire de plateforme avec Origin.
Corps `{scope, profile}`. Le profil est spécifique circuit/tracé/voiture/version.
Il n’est pas rempli par une moyenne d’arrêts dont on ignore les opérations.

`profile` contient `source`, éventuellement `pitTransit`, `pitLoss`, et `services`.
Chaque service a `after: []` ou des dépendances explicites. Les dépendances forment
un graphe sans cycle. Le calcul utilise les dates de fin, donc un swap peut chevaucher
plusieurs services successifs. Pour `fuel` : `basis: "litres" | "energyPercent"`,
`fixed` (s), `perUnit` (s/unité). Pour `tyres2`, `tyres4`, `driver`, `brakes`, `wing` :
`seconds`. `repair` doit aussi avoir un ordre vérifié, mais sa durée est saisie à partir
de l’annonce du jeu : pas de forfait universel de dégâts. Aucune règle LMU supposée.

## Chronos de référence

Tableau public Ohne Speed, import journalier au créneau :45 ; une visite peut aussi
déclencher la première synchronisation en arrière-plan, sans bloquer la page.
Le dernier import valide est conservé si le document est indisponible ou change de
structure. Affichage du tracé, catégorie, version du document, date et source.
Le pilote choisit le tracé du document : aucune correspondance approximative
n’attribue les chronos d’une variante à une autre. Aucun conseil ni classement ajouté.

## Validation restante sur PC

Vérifier le flux LMU/SimHub, les unités et le découpage des tours ; puis mesurer
traversée, trajet piste équivalent et services isolés/combinés. Vérifier notamment
swap long avec petit ravitaillement et pneus. Valider les profils par voiture/version
avant d’afficher une durée. Ne pas activer de règle hypothétique pour remplir l’écran.
