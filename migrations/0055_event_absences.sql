-- « Je serai absent » : a pilot says he will miss an event (solo event or endurance) of his community.
CREATE TABLE IF NOT EXISTS event_absences (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id, community_id)
);
