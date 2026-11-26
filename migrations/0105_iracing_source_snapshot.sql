-- Source baseline, separate from administrator edits. Existing imports are initialized without overwriting them.
ALTER TABLE iracing_imports ADD COLUMN source_snapshot TEXT;
