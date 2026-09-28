-- Imported iRacing special events still waiting for their time slots: their single placeholder start
-- becomes the common "Horaire à définir" start (departure flag tbd).
UPDATE events SET departures=json_set(departures,'$[0].tbd',json('true'))
WHERE id IN (SELECT event_id FROM iracing_imports WHERE external_id LIKE 'special:%')
  AND schedule_pending=1 AND json_array_length(departures)=1 AND json_extract(departures,'$[0].time')='20:00';
