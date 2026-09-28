-- Endurance durations with minutes (e.g. 2 h 30). duration_hours stays the number of presence
-- slots (hours started, rounded up); NULL means a whole number of hours (duration_hours × 60).
ALTER TABLE events ADD COLUMN duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440);
