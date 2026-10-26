-- One « Discord » setting (Administration → Modules): each recap has its own place on the server.
-- destination_id: the LMU races, iracing_destination_id: the iRacing races (a category under which each race gets its own
-- in « une catégorie par course », a text channel for the week's message in « récap de la semaine »);
-- calendar_destination_id: the week's events (a text channel). '' = not published.
ALTER TABLE community_recap_settings ADD COLUMN iracing_destination_id TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN iracing_destination_name TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN calendar_destination_id TEXT NOT NULL DEFAULT '';
ALTER TABLE community_recap_settings ADD COLUMN calendar_destination_name TEXT NOT NULL DEFAULT '';
UPDATE community_recap_settings SET iracing_destination_id=destination_id, iracing_destination_name=destination_name WHERE scope IN ('all','iracing');
UPDATE community_recap_settings SET destination_id='', destination_name='' WHERE scope='iracing';
-- The week's message of « récap général » (event_id '') becomes the LMU one, or the iRacing one: each sim has its message.
UPDATE discord_recap_publications SET event_id='week:iracing'
  WHERE event_id='' AND community_id IN (SELECT community_id FROM community_recap_settings WHERE scope='iracing');
UPDATE discord_recap_publications SET event_id='week:lmu' WHERE event_id='';
