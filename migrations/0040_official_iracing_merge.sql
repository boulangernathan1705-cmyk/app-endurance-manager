-- The official iRacing races, imported until now once per community (migration 0034), become one official race
-- each (migration 0039), common to every community.
-- For each iRacing race (external_id): the copy kept is the official one if it exists already, otherwise the copy
-- with the most entries and crews (then the oldest); it becomes official, its entries and crews keep their
-- community. The other copies are removed, only when nobody entered them: if one has an entry or a crew, the
-- migration stops here and changes nothing (the deployment stops with it), to be merged by hand.

CREATE TABLE official_merge AS
  SELECT external_id, community_id, event_id, activity,
    ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY community_id = 'official' DESC, activity DESC, created_at, event_id) AS copy
  FROM (SELECT i.external_id, i.community_id, i.event_id, i.created_at,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = i.event_id) + (SELECT COUNT(*) FROM crews c WHERE c.event_id = i.event_id) AS activity
    FROM iracing_imports i JOIN events e ON e.id = i.event_id);

-- Stop when a copy to remove has entries or crews.
CREATE TABLE official_merge_guard (entered_copies INTEGER NOT NULL CHECK (entered_copies = 0));
INSERT INTO official_merge_guard SELECT COUNT(*) FROM official_merge WHERE copy > 1 AND activity > 0;

UPDATE events SET community_id = 'official', version = version + 1
  WHERE community_id <> 'official' AND id IN (SELECT event_id FROM official_merge WHERE copy = 1);
DELETE FROM events WHERE id IN (SELECT event_id FROM official_merge WHERE copy > 1);

-- One import record per iRacing race, the official one.
INSERT OR IGNORE INTO iracing_imports(community_id, external_id, event_id, created_at)
  SELECT 'official', m.external_id, m.event_id, i.created_at FROM official_merge m
  JOIN iracing_imports i ON i.community_id = m.community_id AND i.external_id = m.external_id WHERE m.copy = 1;
DELETE FROM iracing_imports WHERE community_id <> 'official';

DROP TABLE official_merge_guard;
DROP TABLE official_merge;
