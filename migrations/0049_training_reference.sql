-- Reference lap times (server/training.mjs): Ohne Speed's spreadsheet, read again once a day and kept whole, with the
-- date its author gives it. Shown on the circuit sheets with credit to him.
CREATE TABLE training_reference (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated TEXT,
  fetched_at INTEGER NOT NULL
);
