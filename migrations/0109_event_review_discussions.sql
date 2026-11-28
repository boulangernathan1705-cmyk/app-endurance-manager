-- Old anonymous votes stay private. Opaque review keys never reveal the account id.
ALTER TABLE event_reviews ADD COLUMN public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1));
ALTER TABLE event_reviews ADD COLUMN review_key TEXT;
UPDATE event_reviews SET review_key=lower(hex(randomblob(16))) WHERE review_key IS NULL;
CREATE UNIQUE INDEX event_reviews_key ON event_reviews(review_key);
CREATE INDEX event_reviews_public ON event_reviews(event_id,community_id,public,created_at,review_key);
ALTER TABLE event_review_sessions ADD COLUMN archived_count INTEGER;
ALTER TABLE event_review_sessions ADD COLUMN archived_sum REAL;
CREATE INDEX event_review_sessions_expiry ON event_review_sessions(opens_at) WHERE archived_count IS NULL;
CREATE TABLE event_review_replies (
 id TEXT PRIMARY KEY,
 review_key TEXT NOT NULL REFERENCES event_reviews(review_key) ON DELETE CASCADE,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 author_name TEXT NOT NULL,
 comment TEXT NOT NULL CHECK(length(comment) BETWEEN 1 AND 1000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX event_review_replies_thread ON event_review_replies(review_key,created_at,id);
