# Mémo collectif

Le mémo se consulte sans envoyer de données. Les contributeurs voient aussi leurs statistiques personnelles, calculées séparément sur les cinq dernières séances. Les données collectives ne contiennent aucun nom ni identifiant de pilote.

Chaque circuit et voiture a un cycle de collecte de 15 jours. Les nouveaux tours exploitables alimentent des sommes et des nombres d'observations par séance, sans conserver de tableaux de tours dans la collecte. Les moyennes sont d'abord calculées pour chaque pilote, puis entre pilotes avec un poids égal. Un maximum de 100 tours exploitables par contributeur suffit à constituer l'échantillon et borne la collecte quand les autres pilotes manquent. Les tours invalides, aux stands et trop éloignés du rythme sont exclus.

À partir de cinq contributeurs et 100 tours exploitables au total, la publication est figée et les contributions collectives s'arrêtent. L'entraînement personnel continue. La prochaine collecte démarre 15 jours après le début du cycle, à la prochaine réception de séance, consultation ou tâche planifiée. Le dernier mémo reste affiché jusqu'à la publication du nouvel échantillon suffisant. Une première fiche peut présenter des valeurs provisoires dès cinq tours mesurés.

Le bouton d'administration du mémo appelle `POST /api/training/memo/restart`. Seuls les gestionnaires de plateforme peuvent relancer tous les circuits et voitures après une grosse mise à jour du jeu. La raison ou version est obligatoire. Les séances antérieures au nouveau cycle, y compris les anciens fichiers envoyés tardivement, n'alimentent pas ce cycle. Les statistiques personnelles restent disponibles.

Les premières consultations peuvent créer une référence provisoire à partir des résumés existants, sans relire les tours historiques. Cette référence ne compte pas dans le quorum du nouveau cycle. Les publications restent disponibles lorsque les anciennes séances et les résumés personnels expirent. Une consultation normale lit la publication, les compteurs de collecte et le seul résumé personnel du lecteur. Les réceptions de séances utilisent des échantillons compacts et leur identifiant propre au pilote pour éviter le double comptage.

La migration `0052_memo_cycles.sql` ajoute les publications et les échantillons sans supprimer l'historique. Les temps de service donnés par le jeu et les chronos de référence externes gardent leurs mécanismes de mise à jour distincts du cycle des moyennes mesurées.
