import worker from './worker.mjs';
import {homeRedirect, homePage} from './home.mjs';
import {isWeeklyDiscordMutation} from './discord-weekly-format.mjs';
import {ensureDiscordWeeklySchema} from './discord-weekly-schema.mjs';
import {syncWeeklyDiscord} from './discord-weekly.mjs';
import {cleanup, communityLabel} from './core.mjs';
import {syncIracingEvents, completeSpecialTimes} from './iracing-import.mjs';
import {refreshMemberships} from './access.mjs';
import {allCommunities, currentCommunity} from './community.mjs';
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

async function runWeeklySync(env, community = null) {
  await ensureDiscordWeeklySchema(env);
  return syncWeeklyDiscord(env, Date.now(), community);
}

// After a change of races or entries: the recap messages of this community only.
function queueWeeklySync(env, ctx, request) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(currentCommunity(env, request).then(community => runWeeklySync(env, community)).catch(error => {
    console.error('Discord weekly sync failed', error instanceof Error ? error.message : 'unknown');
  }));
}

function communityNotFound() {
  const page = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Communauté introuvable · ENDURANCE MANAGER</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d0f;color:#e6ecea;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:28px;margin:0 0 12px}p{color:#c7d0d4;line-height:1.6}</style></head>
<body><main><h1>Communauté introuvable</h1><p>Aucune communauté n’existe à cette adresse. Vérifie le lien qu’on t’a donné, ou demande-le aux administrateurs de ta communauté.</p></main></body></html>`;
  return new Response(page, {status:404, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex'}});
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    const development = isDevelopment(env);
    if (development && pathname === '/robots.txt') return devRobots();
    // A page of <slug>.BASE_DOMAIN for a community that does not exist: a plain "not found" page.
    if (env?.DB && communityLabel(new URL(request.url), env) && !pathname.startsWith('/api/') && (request.headers.get('Accept') || '').includes('text/html')
      && !(await env.DB.prepare('SELECT 1 FROM communities WHERE slug=?').bind(communityLabel(new URL(request.url), env)).first())) return communityNotFound();
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
    if (weeklyMutation && response.ok) queueWeeklySync(env, ctx, request);
    return development ? markDevelopmentResponse(response) : response;
  },

  async scheduled(controller, env, ctx) {
    // Members and Discord roles not checked for a day are checked again by the bot (every hour, a few at a time).
    if (env?.DB && env.DISCORD_BOT_TOKEN && new Date(controller?.scheduledTime || Date.now()).getUTCMinutes() < 15) ctx.waitUntil(
      allCommunities(env).then(communities => refreshMemberships(env, communities)).catch(error => {
        console.error('Membership check failed', error instanceof Error ? error.message : 'unknown');
      }));
    // Official iRacing endurances: twice a day (7:00 and 13:00 UTC; the schedule it reads is refreshed around
    // 6:17 UTC), and at the next run as long as nothing was ever imported (first deployment). Special event
    // time slots (iracing.com article of the race week) are looked for every hour.
    const at = new Date(controller?.scheduledTime || Date.now());
    if (env?.DB && env.IRACING_IMPORT !== 'off') ctx.waitUntil((async () => {
      const daily = [7, 13].includes(at.getUTCHours()) && at.getUTCMinutes() < 15;
      if (daily || !(await env.DB.prepare('SELECT 1 FROM iracing_imports LIMIT 1').first())) await syncIracingEvents(env);
      // Every hour: time slots of the special events of the coming days (article of the race week).
      else if (at.getUTCMinutes() < 15) await completeSpecialTimes(env, {withinDays:10});
    })().catch(error => {
      console.error('iRacing import failed', error instanceof Error ? error.message : 'unknown');
    }));
    // Expired sessions, OAuth states and rate-limit counters are purged here too, not only on Discord login.
    if (env?.DB) ctx.waitUntil(cleanup(env).catch(error => {
      console.error('Scheduled cleanup failed', error instanceof Error ? error.message : 'unknown');
    }));
    if (!env?.DB) return;
    ctx.waitUntil(runWeeklySync(env).catch(error => {
      console.error('Discord weekly scheduled sync failed', error instanceof Error ? error.message : 'unknown');
    }));
  }
};
