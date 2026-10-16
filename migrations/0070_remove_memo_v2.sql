-- Retire memo v2, including consent, personal measurements, links and references.
-- Keep previous applied migrations immutable.
DROP TABLE IF EXISTS memo_links;
DROP TABLE IF EXISTS memo_samples;
DROP TABLE IF EXISTS memo_contributors;
DROP TABLE IF EXISTS memo_pit_profiles;
DROP TABLE IF EXISTS memo_reference;
UPDATE communities SET modules=json_remove(modules, '$.memo');
