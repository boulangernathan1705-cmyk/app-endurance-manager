-- Optional circuit selected from the LMU track list for an event.
-- Existing events remain valid and can be completed later.
ALTER TABLE events ADD COLUMN circuit TEXT NOT NULL DEFAULT '';
