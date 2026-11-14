// The one way the site talks to Discord as its bot: the token, a short wait when Discord asks for one (one more
// try), and a pause before the last request a route allows. Each module keeps its own words for a refusal.
export const DISCORD_API = 'https://discord.com/api/v10';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Discord's « try again in … » when it is short enough to wait for (in ms), else null.
export async function retryAfter(response) {
  if (response.status !== 429) return null;
  const data = await response.clone().json().catch(() => null), seconds = Number(data?.retry_after ?? response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds <= 5 ? Math.ceil(seconds * 1000) + 50 : null;
}
// The last request allowed on this route for now (Discord says so in its answer): wait for the next one, rather than be refused.
export async function spaceOut(response) {
  const seconds = Number(response.headers?.get?.('x-ratelimit-reset-after'));
  if (response.headers?.get?.('x-ratelimit-remaining') === '0' && Number.isFinite(seconds) && seconds > 0) await pause(Math.min(seconds, 5) * 1000 + 50);
}

export const botToken = env => String(env?.DISCORD_BOT_TOKEN || '').trim();

// One request: {ok, status, code, data, errors}. Never throws for an answer of Discord (a network failure or a
// timeout still throws). A FormData body carries a file and gets more time.
export async function discordFetch(env, method, path, body = null) {
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  const call = () => fetch(DISCORD_API + path, {method, signal:AbortSignal.timeout(form ? 20000 : 8000),
    headers:{Authorization:`Bot ${botToken(env)}`, ...(body && !form ? {'Content-Type':'application/json'} : {})},
    body:form ? body : body ? JSON.stringify(body) : undefined});
  let response = await call();
  const wait = await retryAfter(response);
  if (wait !== null) response = await (await pause(wait), call());
  await spaceOut(response);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return response.ok ? {ok:true, status:response.status, code:0, data}
    : {ok:false, status:response.status, code:Number(data?.code) || 0, data:null, errors:data?.errors};
}
