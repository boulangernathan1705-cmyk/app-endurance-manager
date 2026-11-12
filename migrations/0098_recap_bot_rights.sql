-- Droits du bot sur le serveur Discord, vérifiés chaque heure par le site (et non plus seulement au réglage) :
-- ceux qui manquent (liste JSON des noms Discord) et l'heure de la vérification.
ALTER TABLE community_recap_settings ADD COLUMN missing_rights TEXT NOT NULL DEFAULT '[]';
ALTER TABLE community_recap_settings ADD COLUMN rights_checked_at INTEGER NOT NULL DEFAULT 0;
