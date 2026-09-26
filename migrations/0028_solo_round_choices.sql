-- Solo races with two rounds: each round has its own categories, and a driver chooses a category and
-- a car for each round. The first round's choice stays in category / car columns (counts, indexes).
ALTER TABLE registrations ADD COLUMN round_choices TEXT NOT NULL DEFAULT '[]';
