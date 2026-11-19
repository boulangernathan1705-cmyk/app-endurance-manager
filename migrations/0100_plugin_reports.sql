-- Retours de test du plugin SimHub (module « Retours de test », plugin 2.6) : le journal d'une séance ou un signalement
-- écrit par le pilote, pour suivre les essais des pilotes et continuer le développement.
CREATE TABLE IF NOT EXISTS plugin_reports (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plugin_reports_created ON plugin_reports(created_at);
