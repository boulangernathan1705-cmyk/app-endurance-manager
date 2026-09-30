-- How communities work, explained once to the pilots of several communities (front/community-intro.mjs): seen by
-- this account, on any device. Nothing else changes.
ALTER TABLE users ADD COLUMN community_intro_seen INTEGER NOT NULL DEFAULT 0;
