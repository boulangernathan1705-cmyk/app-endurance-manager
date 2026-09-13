let ready = null;

export function ensureDiscordWeeklySchema(env) {
  if (ready) return ready;
  ready = env.DB.prepare(`CREATE TABLE IF NOT EXISTS discord_weekly_state (
    key TEXT PRIMARY KEY,
    message_id TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    week_key TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    dirty INTEGER NOT NULL DEFAULT 0,
    lock_token TEXT NOT NULL DEFAULT '',
    lock_until INTEGER NOT NULL DEFAULT 0
  )`).run().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}
