-- Remove the retired training and circuit memo modules, including personal links and telemetry.
DROP TABLE IF EXISTS training_relays;
DROP TABLE IF EXISTS training_relay_counts;
DROP TABLE IF EXISTS training_manual;
DROP TABLE IF EXISTS training_prep_setups;
DROP TABLE IF EXISTS training_prep_notes;
DROP TABLE IF EXISTS training_prep;
DROP TABLE IF EXISTS training_checklist;
DROP TABLE IF EXISTS training_memo_contributions;
DROP TABLE IF EXISTS training_memo_cycles;
DROP TABLE IF EXISTS training_memo_pilots;
DROP TABLE IF EXISTS training_reference;
DROP TABLE IF EXISTS training_cars;
DROP TABLE IF EXISTS training_pending;
DROP TABLE IF EXISTS training_profiles;
DROP TABLE IF EXISTS training_live;
DROP TABLE IF EXISTS training_marks;
DROP TABLE IF EXISTS training_devices;
DROP TABLE IF EXISTS training_sessions;

UPDATE communities SET modules=json_remove(modules, '$.training', '$.memo');
