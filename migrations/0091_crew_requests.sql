-- « Demander un équipage »: creating crews is for the organisers (« Équipages »). A pilot entered on a start, without
-- a crew, proposes one (name, category, car, teammates); every organiser of the community is told on the site.
-- An organiser checks it on the « Équipages » page and creates the crew, or refuses it.
CREATE TABLE crew_requests (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  car TEXT,
  -- The entries proposed for the crew (the requester's first), JSON array of registration ids.
  registration_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(registration_ids)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','refused')),
  created_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER
);
CREATE INDEX crew_requests_open ON crew_requests(community_id, status, event_id);
-- One open request per pilot and start: a new one replaces it.
CREATE UNIQUE INDEX crew_requests_one ON crew_requests(user_id, departure_id) WHERE status='pending';
