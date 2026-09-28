import worker from './worker.mjs';
import {homeRedirect, homePage} from './home.mjs';
import {isWeeklyDiscordMutation} from './discord-weekly-format.mjs';
import {ensureDiscordWeeklySchema} from './discord-weekly-schema.mjs';
import {syncWeeklyDiscord} from './discord-weekly.mjs';
import {cleanup} from './core.mjs';
import {syncIracingEvents} from './iracing-import.mjs';
import {isDevelopment,devRobots,markDevelopmentResponse} from './dev-environment.mjs';

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
    // No ownership backfill here: this runs on every cold start, and crews created by
    // organizers are intentionally ownerless until a pilot joins one by themselves.
    // The one-time backfill of pre-existing crews lives in migration 0016_crew_ownership.sql.

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
    const development = isDevelopment(env);
    if (development && pathname === '/robots.txt') return devRobots();
    if (pathname === '/' && ['GET','HEAD'].includes(request.method)) {
      const redirect = homeRedirect(request);
      if (redirect) return redirect;
      if (env?.ASSETS) {
        const home = await homePage(request, env);
        return development ? markDevelopmentResponse(home) : home;
      }
    }
    if (pathname.startsWith('/api/')) await ensureCrewOwnershipSchema(env);
    const weeklyMutation = isWeeklyDiscordMutation(request);
    const response = await worker.fetch(request, env, ctx);
    if (weeklyMutation && response.ok) queueWeeklySync(env, ctx);
    return development ? markDevelopmentResponse(response) : response;
  },

  async scheduled(controller, env, ctx) {
    // Official iRacing endurances: twice a day, 7:00 UTC (the schedule it reads is refreshed around 6:17 UTC)
    // and 13:00 UTC (special event time slots, published on iracing.com on the Monday morning of the race
    // week), and at the next run as long as nothing was ever imported (first deployment).
    const at = new Date(controller?.scheduledTime || Date.now());
    if (env?.DB && env.IRACING_IMPORT !== 'off') ctx.waitUntil((async () => {
      const daily = [7, 13].includes(at.getUTCHours()) && at.getUTCMinutes() < 15;
      if (daily || !(await env.DB.prepare('SELECT 1 FROM iracing_imports LIMIT 1').first())) await syncIracingEvents(env);
    })().catch(error => {
      console.error('iRacing import failed', error instanceof Error ? error.message : 'unknown');
    }));
    // Expired sessions, OAuth states and rate-limit counters are purged here too, not only on Discord login.
    if (env?.DB) ctx.waitUntil(cleanup(env).catch(error => {
      console.error('Scheduled cleanup failed', error instanceof Error ? error.message : 'unknown');
    }));
    if (!env?.DISCORD_WEEKLY_WEBHOOK_URL) return;
    ctx.waitUntil(runWeeklySync(env).catch(error => {
      console.error('Discord weekly scheduled sync failed', error instanceof Error ? error.message : 'unknown');
    }));
  }
};
