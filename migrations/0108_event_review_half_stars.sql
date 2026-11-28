-- Keep existing integer votes intact; accept half-star increments from 0.5 to 5.
-- event_reviews is a leaf table: it has no incoming foreign keys.
CREATE TABLE event_reviews_half_stars (
 event_id TEXT NOT NULL,
 community_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 rating REAL NOT NULL CHECK(typeof(rating) IN ('integer','real') AND rating BETWEEN 0.5 AND 5 AND rating*2=CAST(rating*2 AS INTEGER)),
 comment TEXT NOT NULL DEFAULT '' CHECK(length(comment)<=1000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,community_id,user_id),
 FOREIGN KEY(event_id,community_id,user_id) REFERENCES event_review_eligible(event_id,community_id,user_id) ON DELETE CASCADE
);
INSERT INTO event_reviews_half_stars(event_id,community_id,user_id,rating,comment,created_at,updated_at)
 SELECT event_id,community_id,user_id,rating,comment,created_at,updated_at FROM event_reviews;
DROP TABLE event_reviews;
ALTER TABLE event_reviews_half_stars RENAME TO event_reviews;
