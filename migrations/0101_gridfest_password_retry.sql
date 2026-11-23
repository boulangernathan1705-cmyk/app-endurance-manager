-- A refused Gridfest MP that may pass later (Discord busy, too many MPs at once) is sent again by the bot,
-- a few times, without an admin click. Additive only.
ALTER TABLE gridfest_password_deliveries ADD COLUMN retryable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gridfest_password_deliveries ADD COLUMN retries INTEGER NOT NULL DEFAULT 0;
