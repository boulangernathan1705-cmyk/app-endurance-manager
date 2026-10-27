-- The « Discord » setting asked question by question (server/discord-layout.mjs): the admins' answers as JSON ('' = a
-- setting made before, kept as it was). bot_categories: the categories the bot made for it ({"main":id,"lmu":id,
-- "iracing":id,"pit":id}), deleted by the bot once no longer wanted and empty.
ALTER TABLE community_recap_settings ADD COLUMN layout TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN bot_categories TEXT NOT NULL DEFAULT '{}';
