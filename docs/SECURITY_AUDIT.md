# Audit sécurité — 12 septembre 2026

## Contexte

Un avertissement Google Chrome / Safe Browsing « Site dangereux » a été signalé de façon intermittente sur `https://endurance-manager.app`.

Google indique que les avertissements Safe Browsing peuvent dépendre du contexte de navigation et qu'ils ne sont donc pas toujours reproductibles. Le rapport « Problèmes de sécurité » de Google Search Console doit être utilisé comme source de vérité pour connaître la catégorie exacte et les URL concernées.

## Résultat de l'audit du code

Aucun mécanisme de collecte de mot de passe, de paiement, de téléchargement de logiciel ou d'exécution de code tiers n'est présent dans l'application.

Les points contrôlés :

- authentification Discord OAuth avec `state` aléatoire, durée limitée et cookie `__Host-` sécurisé ;
- cookie de session `HttpOnly`, `Secure`, `SameSite=Lax` ;
- origine canonique HTTPS imposée côté API ;
- requêtes d'écriture protégées par contrôle `Origin` et limitation de débit ;
- requêtes SQL paramétrées ;
- validation serveur des données ;
- échappement HTML des données utilisateur avant rendu ;
- aucun script JavaScript tiers chargé dans les pages ;
- aucune redirection ouverte pilotée par une URL utilisateur ;
- lien de récupération invité placé dans le fragment `#access=...`, donc non transmis au serveur dans le Referer ;
- dépendances runtime tierces absentes ; Playwright est uniquement une dépendance de développement ;
- ressources externes limitées à Discord pour les avatars / OAuth et Wikimedia Commons pour les cartes de circuits.

## Renforcements appliqués sur `dev`

- télémétrie client : `Origin` exact obligatoire, `Content-Type` limité à `text/plain`, limitation à 30 envois / 10 minutes / IP ;
- CSP renforcée ;
- HSTS ;
- protection anti-framing ;
- `nosniff` et politique Referrer stricte ;
- Permissions Policy restrictive ;
- blocage de l'indexation de l'environnement `workers.dev`, de la gestion des membres et des diagnostics ;
- ajout de `robots.txt`, `sitemap.xml` et `/.well-known/security.txt` ;
- maintien des seules origines d'images externes nécessaires : Wikimedia Commons et CDN Discord.

## Origines externes autorisées

### Navigation / backend

- `https://discord.com/oauth2/authorize`
- `https://discord.com/api/oauth2/token`
- `https://discord.com/api/v10/users/@me`

Ces échanges OAuth sont réalisés côté Worker, sauf la navigation de l'utilisateur vers la page officielle d'autorisation Discord.

### Images

- `https://cdn.discordapp.com`
- `https://commons.wikimedia.org`
- `https://upload.wikimedia.org`

Aucun JavaScript tiers n'est autorisé par la CSP.

## Procédure Safe Browsing / Search Console

1. Vérifier la propriété `endurance-manager.app` dans Google Search Console.
2. Ouvrir **Sécurité et actions manuelles → Problèmes de sécurité**.
3. Relever la catégorie exacte et toutes les URL d'exemple fournies par Google.
4. Inspecter les URL concernées sur mobile et ordinateur.
5. Une fois le site vérifié et propre, demander un examen depuis le rapport.
6. Si aucune anomalie n'est visible et que la classification semble erronée, utiliser également le formulaire Google de signalement de faux positif Safe Browsing.

## Déploiement

Ces renforcements restent sur `dev` tant qu'ils n'ont pas été validés. La production est mise à jour uniquement via une Pull Request `dev -> main` après contrôles verts et validation fonctionnelle.
