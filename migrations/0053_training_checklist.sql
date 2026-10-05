CREATE TABLE training_checklist (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  exercise TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 1,
  manual INTEGER NOT NULL DEFAULT 0,
  auto INTEGER NOT NULL DEFAULT 0,
  proof TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(user_id,scope,exercise)
);
