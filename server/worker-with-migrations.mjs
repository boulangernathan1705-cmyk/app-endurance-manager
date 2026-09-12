import worker from './worker.mjs';

let crewOwnershipReady = null;

async function ensureCrewOwnershipSchema(env) {
  if (!env.DB) return;
  if (crewOwnershipReady) return crewOwnershipReady;

  crewOwnershipReady = (async () => {
    const info = (await env.DB.prepare('PRAGMA table_info(crews)').all()).results || [];
    const hasOwner = info.some(column => column.name === 'owner_user_id');

    if (!hasOwner) {
      try {
        await env.DB.prepare('ALTER TABLE crews ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL').run();
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }

    await env.DB.prepare('CREATE INDEX IF NOT EXISTS crews_owner_user ON crews(owner_user_id)').run();
    await env.DB.prepare(`UPDATE crews
      SET owner_user_id = (
        SELECT p.user_id
        FROM crew_members cm
        JOIN registrations r ON r.id = cm.registration_id
        JOIN participants p ON p.id = r.participant_id
        WHERE cm.crew_id = crews.id
          AND p.user_id IS NOT NULL
        ORDER BY r.created_at, r.id
        LIMIT 1
      )
      WHERE owner_user_id IS NULL`).run();

    // Keep Wrangler's migration history consistent when this recovery path was needed.
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0016_crew_ownership.sql')").run();
    } catch {}
  })().catch(error => {
    crewOwnershipReady = null;
    throw error;
  });

  return crewOwnershipReady;
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/')) await ensureCrewOwnershipSchema(env);
    return worker.fetch(request, env, ctx);
  }
};
