import worker from './worker.mjs';
import {purgeTraining, refreshLaptimes} from './training.mjs';
import {homeRedirect, homePage} from './home.mjs';
import {isWeeklyDiscordMutation} from './discord-weekly-format.mjs';
import {syncWeeklyDiscord, syncDueRecaps} from './discord-weekly.mjs';
import {cleanup, communityLabel, origin} from './core.mjs';
import {importNextCommunity, completeSpecialTimes} from './iracing-import.mjs';
import {refreshShowcaseIfDue} from './demo.mjs';
import {refreshMemberships} from './access.mjs';
import {purgeNotifications} from './notifications.mjs';
import {syncCrewDiscord} from './crew-discord.mjs';
import {allCommunities, currentCommunity, communitySlug, appearanceOf} from './community.mjs';
import {isDevelopment,devRobots,markDevelopmentResponse} from './dev-environment.mjs';

async function runWeeklySync(env, community = null) {
  return syncWeeklyDiscord(env, Date.now(), community);
}

// After a change of races or entries: the recap messages of this community only.
function queueWeeklySync(env, ctx, request) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(currentCommunity(env, request).then(async community => {
    await runWeeklySync(env, community).catch(error => console.error('Discord weekly sync failed', error instanceof Error ? error.message : 'unknown'));
    // The threads of its crews on Discord follow at once (a new pilot, another car…).
    if (community?.modules?.crewChannels === true) await syncCrewDiscord(env, Date.now(), {community, requests:6});
  }).catch(error => {
    console.error('Discord sync failed', error instanceof Error ? error.message : 'unknown');
  }));
}

// Logo of the community whose site this is (the icon of its Discord server), or null on the main site.
async function communityLogo(request, env) {
  let community = null;
  try { community = await currentCommunity(env, request); } catch {}
  const onCommunitySite = Boolean(community && communityLabel(new URL(request.url), env));
  return {community:onCommunitySite ? community : null, logo:onCommunitySite ? appearanceOf(community).logoUrl : null};
}

// Installable app. On a community's site, its icons are the icon of its Discord server only (phones and
// computers otherwise pick the site's logo, maskable or same address); the icon's id in the address makes a new
// Discord icon a new file.
async function appManifest(request, env) {
  const {community, logo} = await communityLogo(request, env);
  const version = logo ? (logo.match(/\/([a-f0-9_]+)\.png/)?.[1] || '') : '';
  const icons = logo
    ? [192, 512].map(size => ({src:`/app-icon.png?size=${size}&v=${version}`, sizes:`${size}x${size}`, type:'image/png'}))
    : [{src:'/images/app-icon-192.png', sizes:'192x192', type:'image/png'},
      {src:'/images/app-icon-512.png', sizes:'512x512', type:'image/png'},
      {src:'/images/app-icon-maskable-512.png', sizes:'512x512', type:'image/png', purpose:'maskable'}];
  const manifest = {id:'/', start_url:'/', scope:'/', display:'standalone', lang:'fr', background_color:'#0a0b0c', theme_color:'#0a0b0c',
    name:community ? `${community.name} · Endurance Manager` : 'Endurance Manager',
    short_name:community ? community.shortName : 'Endurance',
    description:'Organisation des courses d’endurance simracing : inscriptions, disponibilités et équipages.', icons};
  return new Response(JSON.stringify(manifest), {headers:{'Content-Type':'application/manifest+json; charset=utf-8', 'Cache-Control':'public, max-age=3600'}});
}

// The app's icon at the site's own address (home screen of the iPhone, installed app): the community's
// Discord icon, or the site's logo when there is none or Discord does not answer.
async function appIcon(request, env) {
  const url = new URL(request.url), size = [180, 512].includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : 192;
  const {logo} = await communityLogo(request, env);
  if (logo) {
    const image = await fetch(logo.replace('size=256', `size=${size > 256 ? 512 : 256}`), {cf:{cacheTtl:86400, cacheEverything:true}}).catch(() => null);
    if (image?.ok) return new Response(image.body, {headers:{'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400'}});
  }
  return env.ASSETS.fetch(new Request(new URL(`/images/app-icon-${size}.png`, url)));
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
    if (pathname === '/app-icon.png' && env?.DB && env?.ASSETS) return appIcon(request, env);
    // The community of the main address has no <slug>.BASE_DOMAIN of its own (e.g. commu-dev.endurance-manager.app
    // on production): only its main address serves it.
    if (env?.DB && communityLabel(new URL(request.url), env) === communitySlug(env, null) && new URL(request.url).hostname !== new URL(origin(env)).hostname) return communityNotFound();
    // A page of <slug>.BASE_DOMAIN for a community that does not exist: a plain "not found" page.
    if (env?.DB && communityLabel(new URL(request.url), env) && !pathname.startsWith('/api/') && (request.headers.get('Accept') || '').includes('text/html')
      && !(await env.DB.prepare('SELECT 1 FROM communities WHERE slug=?').bind(communityLabel(new URL(request.url), env)).first())) return communityNotFound();
    if (pathname === '/' && ['GET','HEAD'].includes(request.method)) {
      const redirect = homeRedirect(request);
      if (redirect) return redirect;
      if (env?.ASSETS) {
        const home = await homePage(request, env);
        return development ? markDevelopmentResponse(home, env) : home;
      }
    }
    const weeklyMutation = isWeeklyDiscordMutation(request);
    const response = await worker.fetch(request, env, ctx);
    if (weeklyMutation && response.ok) queueWeeklySync(env, ctx, request);
    return development ? markDevelopmentResponse(response, env) : response;
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
    // Notifications of the bell older than 30 days.
    run('Notifications cleanup failed', () => purgeNotifications(env));
    run('Training cleanup failed', () => purgeTraining(env));
    // The reference lap times of the circuit sheets, read again once a day (it returns at once when they are fresh).
    run('Laptimes import failed', () => refreshLaptimes(env));
    // Every quarter of an hour: the crews on Discord (threads, voice channels, reminders), a few requests at a
    // time (fewer next to the iRacing import, which makes many).
    run('Crew Discord sync failed', () => syncCrewDiscord(env, at.getTime(), {requests:slot === 1 ? 4 : 8}));
    // :00 Members and Discord roles not checked for a day are checked again by the bot, a few at a time.
    if (slot === 0 && env.DISCORD_BOT_TOKEN) run('Membership check failed', async () => refreshMemberships(env, await allCommunities(env), 12));
    // :15 Official iRacing endurances of one community (a new one first, then each in turn).
    if (slot === 1 && env.IRACING_IMPORT !== 'off') run('iRacing import failed', () => importNextCommunity(env, at));
    // :30 The weekly Discord recaps checked longest ago.
    if (slot === 2) run('Discord weekly scheduled sync failed', () => syncDueRecaps(env, 3));
    // :45 Time slots of the coming special events (iracing.com article of the race week), and the showcase on Mondays.
    if (slot === 3) run('Special times or showcase failed', async () => {
      if (env.IRACING_IMPORT !== 'off') await completeSpecialTimes(env, {withinDays:10});
      await refreshShowcaseIfDue(env, at);
    });
  }
};
