-- With LMU and iRacing both published, the races share one category per sim (« 🏎️ LMU », « 🏁 iRacing »).
-- shared: category_id is that sim's category, deleted with the last race in it.
-- old_category_id: the race's own category from before, deleted once its voice channels have left it.
ALTER TABLE discord_recap_publications ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_recap_publications ADD COLUMN old_category_id TEXT;
