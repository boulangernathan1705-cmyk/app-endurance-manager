ALTER TABLE combo_notes ADD COLUMN event_id TEXT;
ALTER TABLE combo_notes ADD COLUMN theme TEXT NOT NULL DEFAULT 'strategy'
  CHECK (theme IN ('strategy','tyres','consumption','track','pit','setup'));
ALTER TABLE combo_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1));
CREATE INDEX combo_notes_scope ON combo_notes(community_id,track,car,event_id,pinned DESC,created_at DESC);
ALTER TABLE combo_sessions ADD COLUMN session_type INTEGER;
CREATE INDEX combo_sessions_last_received ON combo_sessions(community_id,user_id,received_at DESC,started_at DESC);
