# Actualisation conditionnelle et mesures Cloudflare

Les listes `/api/events` et `/api/races` restent privées et en `Cache-Control: no-store`.
Le navigateur conserve seulement les deux réponses (à venir et archives) dans la mémoire de la page,
avec leur ETag. Chaque actualisation vérifie toujours `/api/session` puis l'identité et les droits
sur la route des événements. Une réponse 304 réutilise une copie des données précédentes ;
une réponse 200 remplace la liste. Le rythme d'une minute, la pause pendant la saisie, la reprise
au retour sur la page et le secours XHR restent inchangés. Une modification de la session,
du compte, des permissions ou des paramètres de communauté vide les deux réponses mémorisées.

## Invalidation et migration

Appliquer `0090_event_list_revision.sql` par le flux habituel de migrations D1 avant la publication.
Sans cette migration, le serveur répond normalement en 200, sans ETag : seule l'économie est désactivée.
La migration ajoute une ligne de révision, des déclencheurs sur les tables lues par les événements
et deux index pour les échéances. Aucun événement, inscription ou équipage n'est supprimé.

La révision est volontairement globale à la base : les courses officielles, noms et autorisations
d'autres communautés peuvent modifier la réponse d'un pilote. Elle couvre aussi les imports,
les traitements planifiés et les modifications SQL directes. Une vérification de fraîcheur de
l'appartenance Discord sans changement de rôle, statut ou pseudo ne change pas la révision.
Les écritures ajoutent donc une petite mise à jour du compteur ; les lectures inchangées évitent
la reconstruction du graphe événements/inscriptions/équipages.

Les ETag sont liés à l'identité, aux permissions, à la communauté, à l'origine, au simulateur,
au filtre et à l'environnement. Ils incluent les passages en archives, la marge d'un jour des
courses à venir et l'expiration de l'association stream/équipage. Ces recherches utilisent des index,
sans relire l'ensemble des courses archivées. Une nouvelle table de révision reçoit une génération aléatoire. Après une restauration de sauvegarde,
renouveler cette génération avec `UPDATE event_list_revision SET generation=lower(hex(randomblob(16))) WHERE id=1;`
pour éviter de réutiliser un ancien ETag après un retour en arrière du compteur. Toute future table ou règle temporelle influençant la liste doit être
ajoutée à l'invalidation ; une modification du format de réponse doit changer `events-v1`.

## Mesures

Les configurations Wrangler activent Workers Logs à 10 % des invocations et
`REQUEST_METRICS=on`. Seuls les GET de session et de listes d'événements émettent un journal
structuré `event=request_usage`, avec une route fixe, le statut, le nombre de requêtes D1,
les lignes lues/écrites, la durée SQL et `elapsed_ms` (temps écoulé, **pas** temps CPU).
Le journal personnalisé ne contient ni SQL, ni paramètres, ni cookies, ni identifiants de pilotes,
ni corps de réponse. Les métadonnées natives d'invocation Cloudflare donnent le temps CPU.
`observability.redact_query_string=true` retire également les paramètres des URL des nouveaux
journaux et traces natifs, notamment sur les retours OAuth Discord. Ce réglage ne modifie pas
les requêtes reçues par le Worker et ne supprime pas les journaux antérieurs.

Pour les requêtes suivies, `first()` exécute la même requête SQL via `all()` une seule fois pour
conserver les métadonnées D1 normalement perdues par `first()`. `metadata_complete=false` signale
un adaptateur qui ne fournit pas ces métadonnées : les compteurs de lignes ne sont alors pas exhaustifs.
Les batches conservent leurs instructions et leurs garanties transactionnelles.

Dans Workers Observability, filtrer les journaux sur `event=request_usage`, grouper par `route`
et `status`, puis comparer :

- le nombre de réponses 304 et 200 des événements ;
- les lectures D1 et le temps CPU des invocations correspondantes ;
- les erreurs et latences, ainsi que le volume d'écritures du compteur.

Ne pas confondre l'échantillon de journaux avec les totaux de facturation. Les anciens onglets
continuent à fonctionner mais ne profiteront des requêtes conditionnelles qu'après leur mise à jour.
Valider les gains en développement puis en production avant d'envisager un changement d'offre.
