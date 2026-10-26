-- One counter per combo, raised when its data changes (a session arrives, laps taken out or put back): the key of the
-- sheet the plugin's practice banner reads every few minutes, kept in the cache until then (server/combos.mjs).
CREATE TABLE combo_revisions (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  car TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY(community_id, track, car)
);
