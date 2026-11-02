-- An admin entered on an endurance start says he streams it (Nathan 2026-11-02): the stream's start and end, Paris time.
ALTER TABLE registrations ADD COLUMN stream_time TEXT NOT NULL DEFAULT '';
ALTER TABLE registrations ADD COLUMN stream_end TEXT NOT NULL DEFAULT '';
