-- Setup of a community by its admins (members page, « Mise en place »): the automatic Discord recap.
-- One row = one message, kept up to date in the Discord channel of the webhook chosen by the admins:
--   scope 'all'              one message with the LMU and iRacing races,
--   scope 'lmu' or 'iracing' one message for this simulator only (both rows: two messages, e.g. two channels).
-- A community without any row keeps the former behaviour (module discordWeekly + the site's webhook).
CREATE TABLE community_recaps (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('all','lmu','iracing')),
  webhook_url TEXT NOT NULL CHECK (webhook_url GLOB 'https://*/api/webhooks/*'),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, scope)
);
