-- Events calendar: every simulator (LMU, iRacing, AMS2, ACE). NULL on older rows: the simulator follows the
-- circuit (iracing-… = iRacing, else LMU). On AMS2 and ACE the circuit is typed by the organizer.
ALTER TABLE events ADD COLUMN sim TEXT CHECK(sim IS NULL OR sim IN ('lmu','iracing','ams2','ace'));
-- Details of an event shown on the community's calendar: end time, server password, short note (JSON).
ALTER TABLE events ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
