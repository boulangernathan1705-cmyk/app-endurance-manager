import worker from './worker.mjs';
import {isWeeklyDiscordMutation} from './discord-weekly-format.mjs';
import {ensureDiscordWeeklySchema} from './discord-weekly-schema.mjs';
import {syncWeeklyDiscord} from './discord-weekly.mjs';
import {ensureOrganizationSchema} from './organization-schema.mjs';
import {organizationAwareFetch} from './organizations.mjs';
import {ensureDevTestSpaces} from './dev-test-spaces.mjs';

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
        ORDER BY r.created_at,r.id
        LIMIT 1
      )
      WHERE owner_user_id IS NULL`).run();

    try {
      await env.DB.prepare("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0016_crew_ownership.sql')").run();
    } catch {}
  })().catch(error => {
    crewOwnershipReady = null;
    throw error;
  });

  return crewOwnershipReady;
}

async function runWeeklySync(env) {
  await ensureDiscordWeeklySchema(env);
  return syncWeeklyDiscord(env);
}

function queueWeeklySync(env, ctx) {
  if (!env?.DISCORD_WEEKLY_WEBHOOK_URL || !ctx?.waitUntil) return;
  ctx.waitUntil(runWeeklySync(env).catch(error => {
    console.error('Discord weekly sync failed', error instanceof Error ? error.message : 'unknown');
  }));
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/')) {
      await ensureCrewOwnershipSchema(env);
      await ensureOrganizationSchema(env);
      await ensureDevTestSpaces(request,env);
    }
    const weeklyMutation = isWeeklyDiscordMutation(request);
    const response = pathname.startsWith('/api/')
      ? await organizationAwareFetch(request,env,ctx,(nextRequest,nextEnv,nextCtx)=>worker.fetch(nextRequest,nextEnv,nextCtx))
      : await worker.fetch(request,env,ctx);
    if (weeklyMutation && response.ok) queueWeeklySync(env, ctx);
    return response;
  },

  async scheduled(_controller, env, ctx) {
    if (!env?.DISCORD_WEEKLY_WEBHOOK_URL) return;
    ctx.waitUntil((async()=>{
      await ensureCrewOwnershipSchema(env);
      await ensureOrganizationSchema(env);
      return runWeeklySync(env);
    })().catch(error => {
      console.error('Discord weekly scheduled sync failed', error instanceof Error ? error.message : 'unknown');
    }));
  }
};
