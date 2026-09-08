-- Keep the Discord account that created a registration, including registrations
-- entered by organizers on behalf of other pilots. This is separate from
-- user_id, which identifies the pilot account when the pilot registered directly.
ALTER TABLE registrations ADD COLUMN owner_user_id TEXT REFERENCES users(id);
CREATE INDEX idx_registration_owner ON registrations(owner_user_id) WHERE owner_user_id IS NOT NULL;
