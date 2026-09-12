# Audit sécurité et réputation — 12 septembre 2026

## Contexte

Un avertissement Google Chrome / Safe Browsing « Site dangereux » a été signalé de façon intermittente sur `https://endurance-manager.app`. Google Search Console a indiqué la catégorie « Pages trompeuses » sans fournir d'URL d'exemple.

Un autre blocage observé sur un réseau équipé de Fortinet classait le domaine comme « Newly Registered Domain ». Cette catégorie décrit l'âge / la réputation du domaine et ne constitue pas à elle seule une détection de logiciel malveillant.

## Résultat de l'audit du code

L'audit du dépôt n'a identifié aucun mécanisme de collecte de mot de passe, de paiement, de téléchargement de logiciel ou d'exécution de JavaScript tiers dans l'application.

Les points contrôlés :

- authentification Discord OAuth limitée au scope `identify`, avec `state` aléatoire, durée limitée et cookie `__Host-` sécurisé ;
- aucun champ de mot de passe dans l'application : les identifiants Discord sont saisis uniquement sur le domaine officiel Discord ;
- cookie de session `HttpOnly`, `Secure`, `SameSite=Lax` ;
- jetons de session stockés hachés côté serveur ;
- origine canonique HTTPS imposée côté API ;
- requêtes d'écriture protégées par contrôle `Origin` et limitation de débit ;
- requêtes SQL paramétrées ;
- validation serveur des données et limitation de taille des corps de requête ;
- échappement HTML des données utilisateur avant rendu ;
- aucun script JavaScript tiers chargé dans les pages ;
- aucune redirection ouverte pilotée par une URL utilisateur ;
- lien de récupération invité placé dans le fragment `#access=...`, donc non transmis au serveur dans le Referer ;
- dépendances runtime tierces absentes ; Playwright est uniquement une dépendance de développement ;
- ressources externes limitées à Discord pour les avatars / OAuth et Wikimedia Commons pour les cartes de circuits.

## Renforcements déjà déployés en production

- télémétrie client : `Origin` exact obligatoire, `Content-Type` limité à `text/plain`, limitation à 30 envois / 10 minutes / IP ;
- Content Security Policy restrictive ;
- HSTS ;
- protection anti-framing ;
- `X-Content-Type-Options: nosniff` ;
- politique Referrer stricte ;
- Permissions Policy restrictive ;
- blocage de l'indexation de l'environnement `workers.dev`, de la gestion des membres et des diagnostics ;
- `robots.txt`, `sitemap.xml` et `/.well-known/security.txt` ;
- seules origines d'images externes nécessaires autorisées : Wikimedia Commons et CDN Discord ;
- origine de production fixée à `https://endurance-manager.app`.

## Passe réputation actuellement sur `dev`

Cette passe ajoute des signaux publics de confiance et des garde-fous anti-régression :

- page publique `about.html` expliquant le rôle du service, Discord OAuth et les mesures de sécurité ;
- mention visible à côté de la connexion : « Connexion via Discord OAuth · aucun mot de passe transmis à Endurance Manager » ;
- descriptions publiques (`meta description`) sur l'accueil et les espaces de course ;
- lien « À propos & sécurité » depuis les pieds de page ;
- HSTS porté à deux ans ;
- ajout de `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` et `X-DNS-Prefetch-Control: off` ;
- `about.html` ajouté au sitemap ;
- `security.txt` renvoie vers la section sécurité publique ;
- audit CI renforcé pour refuser `eval`, `new Function`, `document.write`, les champs mot de passe, les références HTTP non chiffrées, une dérive du scope OAuth ou des cookies de session, et la disparition des principaux en-têtes de sécurité.

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

## Vérifications Cloudflare à effectuer dans le tableau de bord

Ces réglages ne sont pas lisibles depuis le dépôt et doivent être contrôlés directement dans Cloudflare :

1. **SSL/TLS → Overview** : utiliser **Full (strict)** si disponible pour ce Worker / domaine.
2. **SSL/TLS → Edge Certificates** : activer **Always Use HTTPS**.
3. Vérifier que le certificat Edge de `endurance-manager.app` est actif et renouvelé automatiquement.
4. Conserver TLS moderne et éviter toute règle de redirection vers une URL `http://`.

## Réputation externe

### Google Safe Browsing / Search Console

Le rapport Search Console « Problèmes de sécurité » reste la source de vérité. Google précise qu'un problème peut exister sans URL d'exemple et qu'un avertissement peut dépendre du contexte de navigation.

Après déploiement et vérification de cette passe :

1. ouvrir **Sécurité et actions manuelles → Problèmes de sécurité** ;
2. vérifier de nouveau toute URL d'exemple éventuelle ;
3. demander un examen ;
4. expliquer le diagnostic, les mesures de sécurité et les changements déployés ;
5. si la classification « Pages trompeuses » semble toujours erronée, utiliser aussi le signalement de faux positif Safe Browsing.

### FortiGuard

Le domaine observé comme « Newly Registered Domain » doit être soumis à une réévaluation via FortiGuard Web Filter → **Request a Review**. La catégorie suggérée la plus cohérente est **Games**, car le contenu dominant concerne l'organisation de courses dans des simulateurs / jeux vidéo. En alternative, **General Organizations** peut décrire l'aspect communautaire.

### Microsoft Defender SmartScreen

Si Edge / SmartScreen affiche un avertissement, utiliser le lien de signalement « ce site ne contient pas de menaces » depuis l'écran d'avertissement. Microsoft indique que la réputation d'URL, l'ancienneté du domaine, le volume de trafic, le TLS, les redirections et le contenu des pages font partie des signaux pris en compte.

## Contrôles indépendants après déploiement

Après mise en production de la passe réputation :

- lancer une analyse **Mozilla HTTP Observatory** sur `endurance-manager.app` ;
- contrôler les en-têtes avec un second outil indépendant de type SecurityHeaders ;
- vérifier manuellement `https://endurance-manager.app/robots.txt`, `/sitemap.xml` et `/.well-known/security.txt` ;
- vérifier l'absence de mixed content dans les outils développeur du navigateur ;
- tester la connexion Discord depuis une session privée et confirmer que le navigateur quitte bien Endurance Manager pour le domaine officiel Discord avant toute authentification.

## Déploiement

La passe réputation reste sur `dev` tant que les contrôles qualité et navigateurs ne sont pas verts et que l'affichage n'a pas été validé. La production est mise à jour uniquement via Pull Request `dev -> main` après validation explicite.
