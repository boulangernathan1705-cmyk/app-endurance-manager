-- Banner of a community, sent by its admins (members page, Réglages → Apparence). Without one, the site's banner.
-- The image is resized and compressed by the browser before it is sent (2048 × 512, WebP, a few hundred KB).
CREATE TABLE community_banners (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  image BLOB NOT NULL CHECK (length(image) BETWEEN 1 AND 600000),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp', 'image/jpeg', 'image/png')),
  updated_at INTEGER NOT NULL
);
