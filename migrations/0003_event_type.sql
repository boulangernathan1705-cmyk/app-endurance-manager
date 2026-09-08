ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'private' CHECK(event_type IN ('special','lmu','private'));
