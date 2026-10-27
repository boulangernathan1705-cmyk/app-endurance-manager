import worker from './worker.mjs';
import {homeRedirect, homePage} from './home.mjs';
import {isWeeklyDiscordMutation, mutationTarget} from './discord-weekly-format.mjs';
import {syncWeeklyDiscord, syncDueRecaps} from './discord-weekly.mjs';
import {cleanup, communityLabel, origin} from './core.mjs';
import {importNextCommunity, completeSpecialTimes} from './iracing-import.mjs';
import {refreshShowcaseIfDue} from './demo.mjs';
import {refreshMemberships} from './access.mjs';
import {purgeNotifications} from './notifications.mjs';
import {cleanupEventRecaps} from './recap-discord.mjs';
import {syncCrewDiscord, cleanupOrphanCrewDiscord} from './crew-discord.mjs';
import {allCommunities, currentCommunity, communityById, communitySlug, appearanceOf} from './community.mjs';
import {isDevelopment,devRobots,markDevelopmentResponse} from './dev-environment.mjs';
import {isCommunityPage, freshPageRequest, withCommunityLook} from './community-look.mjs';
// The team's live room of the mur des stands (Durable Object, binding LIVE in the wrangler files).
export {LiveRoom} from './live.mjs';

async function runWeeklySync(env, community = null, eventId = null) {
  return syncWeeklyDiscord(env, Date.now(), community, eventId);
}
// The race changed by a request, read before it runs (a deleted entry or crew can no longer be looked up).
export async function discordMutationTarget(env, request) {
  const target=mutationTarget(request);
  if(!target)return null;
  if(target.kind==='events'){
    // Official race entries can belong to a different community than the current site.
    let communityId=null;
    if(request.method==='POST'&&/\/(registrations|crews)$/.test(new URL(request.url).pathname)){
      try{communityId=(await request.clone().json()).communityId||null;}catch{}
    }
    return {eventId:target.id,communityId};
  }
  try{
    // Read before deletion; the registration/crew determines which Discord must be updated.
    const row=await env.DB.prepare(`SELECT event_id,community_id FROM ${target.kind} WHERE id=?`).bind(target.id).first();
    return row?{eventId:row.event_id,communityId:row.community_id}:null;
  }catch{return null;}
}

// After a change of races or entries: the recap messages of this community only.
function queueWeeklySync(env, ctx, request, eventId = null, communityId = null) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil((communityId?communityById(env,communityId):currentCommunity(env,request)).then(async community => {
    if(!community)return;
    await runWeeklySync(env, community, eventId).catch(error => console.error('Discord weekly sync failed', error instanceof Error ? error.message : 'unknown'));
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
    // A page of a community's site: its look is put in the page itself (server/community-look.mjs).
    const lookOf = env?.DB && isCommunityPage(request, communityLabel(new URL(request.url), env)) ? await currentCommunity(env, request).catch(() => null) : null;
    if (lookOf) request = freshPageRequest(request);
    if (development && pathname === '/robots.txt') return devRobots();
    if (pathname === '/manifest.webmanifest' && env?.DB) return appManifest(request, env);
    if (pathname === '/app-icon.png' && env?.DB && env?.ASSETS) return appIcon(request, env);
    // The community of the main address has no <slug>.BASE_DOMAIN of its own (e.g. commu-dev.endurance-manager.app
    // on production): only its main address serves it.
    if (env?.DB && communityLabel(new URL(request.url), env) === communitySlug(env, null) && new URL(request.url).hostname !== new URL(origin(env)).hostname) return communityNotFound();
    // A page of <slug>.BASE_DOMAIN for a community that does not exist: a plain "not found" page.
    if (env?.DB && communityLabel(new URL(request.url), env) && !pathname.startsWith('/api/') && (request.headers.get('Accept') || '').includes('text/html')
      && !lookOf && !(await env.DB.prepare('SELECT 1 FROM communities WHERE slug=?').bind(communityLabel(new URL(request.url), env)).first())) return communityNotFound();
    if (pathname === '/' && ['GET','HEAD'].includes(request.method)) {
      const community = lookOf || (env?.DB ? await currentCommunity(env, request).catch(() => null) : null);
      const redirect = homeRedirect(request, community);
      if (redirect) return redirect;
      if (env?.ASSETS) {
        const home = withCommunityLook(await homePage(request, env), lookOf);
        return development ? markDevelopmentResponse(home, env) : home;
      }
    }
    const weeklyMutation = isWeeklyDiscordMutation(request);
    const target = weeklyMutation && env?.DB ? await discordMutationTarget(env, request) : null;
    const response = withCommunityLook(await worker.fetch(request, env, ctx), lookOf);
    if (weeklyMutation && response.ok) queueWeeklySync(env, ctx, request, target?.eventId, target?.communityId);
    // A WebSocket opening (mur des stands) goes back untouched: a copied response would lose its socket.
    if (response.status === 101) return response;
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
    // Every quarter of an hour: the crews on Discord (voice channels, reminders), a few requests at a
    // time (fewer next to the iRacing import, which makes many).
    run('Crew Discord sync failed', () => syncCrewDiscord(env, at.getTime(), {requests:slot === 1 ? 4 : 8}));
    run('Orphan crew Discord cleanup failed', () => cleanupOrphanCrewDiscord(env, at.getTime()));
    run('Event recap cleanup failed', () => cleanupEventRecaps(env,at.getTime()));
    // :00 Members and Discord roles not checked for a day are checked again by the bot, a few at a time.
    if (slot === 0 && env.DISCORD_BOT_TOKEN) run('Membership check failed', async () => refreshMemberships(env, await allCommunities(env), 12));
    // :15 Official team and solo iRacing endurances, once for the whole platform.
    if (slot === 1 && env.IRACING_IMPORT !== 'off') run('iRacing import failed', () => importNextCommunity(env, at));
    // :30 The weekly Discord recaps checked longest ago.
    if (slot === 2) run('Discord weekly scheduled sync failed', () => syncDueRecaps(env, 3));
    // :00 and :45: a Discord setting still being put in place (or taken off) goes on (not next to the iRacing import).
    else if (slot !== 1) run('Discord pending sync failed', () => syncDueRecaps(env, 1, at.getTime(), {pending:true}));
    // :45 Time slots of the coming special events (iracing.com article of the race week), and the showcase on Mondays.
    if (slot === 3) run('Special times or showcase failed', async () => {
      if (env.IRACING_IMPORT !== 'off') await completeSpecialTimes(env, {withinDays:10});
      await refreshShowcaseIfDue(env, at);
    });
  }
};

