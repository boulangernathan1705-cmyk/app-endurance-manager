-- Discord's « … a commencé un fil » notice in # endurances-de-la-semaine, deleted once per race thread (1: done).
ALTER TABLE discord_recap_publications ADD COLUMN thread_notice_gone INTEGER NOT NULL DEFAULT 0;
