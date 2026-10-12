-- Gridfest-only information: never change the pilot's Discord identity.
ALTER TABLE registrations ADD COLUMN game_name TEXT NOT NULL DEFAULT '';

-- A delivery is private to one Discord account and one version of the server password.
-- The password itself stays in the existing, admin-only event details, never in this history.
CREATE TABLE gridfest_password_deliveries (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
  attempt_token TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(event_id,user_id,password_hash)
);

UPDATE events SET details=json_set(details,'$.type','Gridfest'),
  name=CASE WHEN name='Grindfest' THEN 'Gridfest' ELSE name END
  WHERE format='solo' AND json_extract(details,'$.type')='Grindfest';
