# Charte Endurance Manager

La page `/charte` montre la référence visuelle. La charte s’applique à chaque communauté et à chaque simulateur.

| Périmètre | Source de référence |
| --- | --- |
| Couleurs, espaces, arrondis, tailles de texte | `styles/tokens.css` |
| Styles du document et primitives globales | `styles/foundation.css` |
| Composition du CSS commun | `styles.css`, liens des pages HTML, `scripts/build.mjs` |
| Personnalisation d’une communauté | `server/community-look.mjs`, `styles/brand-theme.css`, variable `--community-accent` |
| Compatibilité des dispositions historiques | `styles/ux-refresh.css`, dans l’ordre de ses imports |

## Faire évoluer la cascade

- Une feuille de composant possède ses règles de taille, d’état et de responsive. Les compositions propres à un écran
  restent dans la feuille de la page. Utiliser les variables de la charte pour les valeurs communes.
- Pour alléger une surcharge historique, identifier d’abord le sélecteur qui l’emporte dans chaque état utile. Déplacer
  les règles en conservant leur ordre. Simplifier dans une étape distincte, avec une comparaison avant/après.
- La charte doit préserver l’accent de la communauté, le libellé et la couleur du type d’événement, les variantes de
  navigation, les états de focus et les cartes compactes, même lorsqu’une carte est seule.
- Le passage mobile se fait à 760 px. Contrôler 760 et 761 px, en plus des exemples habituels sur téléphone, PC
  et ultrawide. Comparer des thèmes différents, les accès pilote et organisateur, les listes vides ou chargées,
  les textes longs et les formulaires ouverts.
- Les comparaisons se font dans le même moteur, avec les mêmes données. Les commandes et références sont dans
  [DEPLOYMENT.md](../DEPLOYMENT.md). Un refactoring à rendu constant conserve les références visuelles de la CI.

## Habillage des Events TDZ

La Semaine, la Liste et l’en-tête de la fiche TDZ utilisent les accents des simulateurs sur le liseré et le fond diagonal. La Liste et la fiche reprennent les mêmes teintes LMU et iRacing que les Endurances. Le logo de l’admin reste dans son emplacement d’origine et garde ses proportions. Les pastilles indiquent le format et l’accès. Le Mois conserve sa légende par type. Gridfest et les streams gardent leurs visuels dédiés.
Sur mobile, la Semaine et la Liste TDZ reprennent la hauteur minimale, la largeur du panneau et la découpe en biais des cartes Endurances de la Semaine. Le logo reste entier. La Liste affiche le circuit ou le nombre de manches, les horaires et les inscriptions. Les réglages des manches figurent sur la fiche.

Sur téléphone, les cartes Endurances et Events TDZ ouvrent leur fiche au premier appui. Le fond teinté des cartes TDZ est visible au repos. Sur ordinateur, le panorama des Endurances apparaît au survol à la souris.

Sur la fiche TDZ mobile, l’en-tête regroupe les pastilles, la date en ligne, le titre, le circuit et le départ autour du logo. Les réglages de la course apparaissent dans un bloc pleine largeur sous l’en-tête. Les cartes d’accueil et les autres formats de fiche suivent leurs dispositions propres.
