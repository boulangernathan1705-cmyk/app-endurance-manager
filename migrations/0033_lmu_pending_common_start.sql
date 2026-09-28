-- LMU races marked "Horaires à confirmer" and still without any entry or crew: their placeholder starts
-- (0:00 each day) become a single common start "à définir" on the first day (departure flag tbd), where
-- everyone enters; the real times are added later by editing the race.
UPDATE events SET departures=json_array(json_set(json_extract(departures,'$[0]'),'$.tbd',json('true'))), version=version+1
WHERE schedule_pending=1 AND circuit NOT LIKE 'iracing-%' AND COALESCE(format,'endurance')='endurance'
  AND json_array_length(departures)>=1
  AND json_extract(departures,'$[0].startsAt') > CAST(strftime('%s','now') AS INTEGER)*1000
  AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id=events.id)
  AND NOT EXISTS (SELECT 1 FROM crews c WHERE c.event_id=events.id);
