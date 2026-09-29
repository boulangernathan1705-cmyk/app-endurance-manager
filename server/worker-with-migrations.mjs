import worker from './worker.mjs';
import {homeRedirect, homePage} from './home.mjs';
import {isWeeklyDiscordMutation} from './discord-weekly-format.mjs';
import {ensureDiscordWeeklySchema} from './discord-weekly-schema.mjs';
import {syncWeeklyDiscord, syncDueRecaps} from './discord-weekly.mjs';
import {cleanup, communityLabel} from './core.mjs';
import {importNextCommunity, completeSpecialTimes} from './iracing-import.mjs';
import {refreshShowcaseIfDue} from './demo.mjs';
import {refreshMemberships} from './access.mjs';
import {allCommunities, currentCommunity, appearanceOf} from './community.mjs';
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

async function appManifest(request, env) {
  let community = null;
  try { community = await currentCommunity(env, request); } catch {}
  const onCommunitySite = Boolean(community && communityLabel(new URL(request.url), env));
  const logo = onCommunitySite ? appearanceOf(community).logoUrl : null;
  const icons = [
    ...(logo ? [{src:logo.replace('size=256', 'size=512'), sizes:'512x512', type:'image/png'}] : []),
    {src:'/images/app-icon-192.png', sizes:'192x192', type:'image/png'},
    {src:'/images/app-icon-512.png', sizes:'512x512', type:'image/png'},
    {src:'/images/app-icon-maskable-512.png', sizes:'512x512', type:'image/png', purpose:'maskable'}];
  const manifest = {id:'/', start_url:'/', scope:'/', display:'standalone', lang:'fr', background_color:'#0a0b0c', theme_color:'#0a0b0c',
    name:onCommunitySite ? `${community.name} · Endurance Manager` : 'Endurance Manager',
    short_name:onCommunitySite ? community.shortName : 'Endurance',
    description:'Organisation des courses d’endurance simracing : inscriptions, disponibilités et équipages.', icons};
  return new Response(JSON.stringify(manifest), {headers:{'Content-Type':'application/manifest+json; charset=utf-8', 'Cache-Control':'public, max-age=3600'}});
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
    if (pathname === '/manifest.webmanifest' && env?.DB) return appManifest(request, env);
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

  // Every 15 minutes. A run may make 50 calls to the database and 50 requests: one heavy task per quarter of
  // an hour, each working by small batches (the cleanup, light, runs every time).
  async scheduled(controller, env, ctx) {
    if (!env?.DB) return;
    const at = new Date(controller?.scheduledTime || Date.now());
    const slot = Math.floor(at.getUTCMinutes() / 15);
    const run = (label, task) => ctx.waitUntil(task().catch(error => console.error(label, error instanceof Error ? error.message : 'unknown')));
    // Expired sessions, OAuth states and rate-limit counters are purged here too, not only on Discord login.
    run('Scheduled cleanup failed', () => cleanup(env));
    // :00 Members and Discord roles not checked for a day are checked again by the bot, a few at a time.
    if (slot === 0 && env.DISCORD_BOT_TOKEN) run('Membership check failed', async () => refreshMemberships(env, await allCommunities(env), 12));
    // :15 Official iRacing endurances of one community (a new one first, then each in turn).
    if (slot === 1 && env.IRACING_IMPORT !== 'off') run('iRacing import failed', () => importNextCommunity(env, at));
    // :30 The weekly Discord recaps checked longest ago.
    if (slot === 2) run('Discord weekly scheduled sync failed', async () => { await ensureDiscordWeeklySchema(env); await syncDueRecaps(env, 3); });
    // :45 Time slots of the coming special events (iracing.com article of the race week), and the showcase on Mondays.
    if (slot === 3) run('Special times or showcase failed', async () => {
      if (env.IRACING_IMPORT !== 'off') await completeSpecialTimes(env, {withinDays:10});
      await refreshShowcaseIfDue(env, at);
    });
  }
};
