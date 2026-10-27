-- « Une catégorie par course »: a race's infos now go in its thread of # endurances-de-la-semaine (channel_id is then the
-- thread, thread_parent that channel); its category only holds its crews' voices. in_thread 0 = the infos-de-la-course
-- channel of before, replaced by a thread.
ALTER TABLE discord_recap_publications ADD COLUMN in_thread INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_recap_publications ADD COLUMN thread_parent TEXT;
