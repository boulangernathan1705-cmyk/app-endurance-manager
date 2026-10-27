-- The pilots noted before v1.67 were noted per race, not per thread: those of a thread made again were never put back.
-- Everyone is added again (an edit of the race's message: nobody is notified, those already in stay as they are).
DELETE FROM discord_thread_members;
UPDATE discord_recap_publications SET members_checked_at=0;
