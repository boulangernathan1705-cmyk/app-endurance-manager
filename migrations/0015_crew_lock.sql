-- Organizer-controlled crew completion state.
-- Existing crews remain open by default.
ALTER TABLE crews ADD COLUMN locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1));
