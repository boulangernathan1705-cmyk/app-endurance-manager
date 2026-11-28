-- Optional per-community post-event reviews; an immutable eligibility snapshot also prevents duplicate notifications.
CREATE TABLE event_review_sessions (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
 opens_at INTEGER NOT NULL,
 closes_at INTEGER NOT NULL,
 PRIMARY KEY(event_id, community_id)
);
CREATE INDEX event_review_sessions_community ON event_review_sessions(community_id, opens_at DESC);
CREATE TABLE event_review_eligible (
 event_id TEXT NOT NULL,
 community_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,community_id,user_id),
 FOREIGN KEY(event_id,community_id) REFERENCES event_review_sessions(event_id,community_id) ON DELETE CASCADE
);
CREATE TABLE event_reviews (
 event_id TEXT NOT NULL,
 community_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 rating INTEGER NOT NULL CHECK(typeof(rating)='integer' AND rating BETWEEN 1 AND 5),
 comment TEXT NOT NULL DEFAULT '' CHECK(length(comment)<=1000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,community_id,user_id),
 FOREIGN KEY(event_id,community_id,user_id) REFERENCES event_review_eligible(event_id,community_id,user_id) ON DELETE CASCADE
);
