import {discoverMemberships} from './access.mjs';
import {allCommunities} from './community.mjs';
import {
  DAY, SESSION_DAYS, cleanup, communityLabel, cookie, cookieNames, hash, now,
  origin, rateLimit, redirect, requireDiscord, returnPath, setCookie, siteOrigin, token
} from './core.mjs';

export async function oauthStart(request, env) {
  requireDiscord(env); await rateLimit(request, env, 'oauth', 20); await cleanup(env);
  const state = token();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await hash(state), now() + 600).run();
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, response_type:'code', redirect_uri:origin(env) + '/api/auth/discord/callback', scope:'identify', state}).toString();
  // Discord knows one return address (the main one): the page to reopen afterwards, on the community site
  // where the sign-in started, is kept in a cookie shared by the sites of the platform.
  const back = siteOrigin(request, env) + returnPath(new URL(request.url).searchParams.get('return'));
  const names = cookieNames(env);
  return redirect(auth.href, [setCookie(names.state, state, 600, names.domain), setCookie(names.ret, encodeURIComponent(back), 600, names.domain)]);
}
export async function oauthCallback(request, env) {
  requireDiscord(env);
  const url = new URL(request.url), state = url.searchParams.get('state');
  const names = cookieNames(env);
  const clear = setCookie(names.state, '', 0, names.domain), clearReturn = setCookie(names.ret, '', 0, names.domain);
  // Back to the page (and community site) the sign-in started from; anything else: the main home page.
  let back = origin(env) + '/';
  try {
    const wanted = new URL(decodeURIComponent(cookie(request, names.ret)));
    if (wanted.origin === origin(env) || communityLabel(wanted, env)) back = wanted.origin + returnPath(wanted.pathname + wanted.search + wanted.hash);
  } catch {}
  const failed = () => redirect(new URL(back).origin + '/?auth=error', [clear, clearReturn]);
  // Why a sign-in fails is written to the Worker logs (never a code, token or secret).
  if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookie(request, names.state)) { console.error('Discord sign-in failed: state', state ? (cookie(request, names.state) ? 'mismatch' : 'no browser cookie') : 'missing'); return failed(); }
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await hash(state), now()).first();
  if (!row || !url.searchParams.get('code') || url.searchParams.has('error')) { console.error('Discord sign-in failed:', !row ? 'state expired or reused' : url.searchParams.get('error') || 'no code'); return failed(); }
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID, client_secret:env.DISCORD_CLIENT_SECRET, grant_type:'authorization_code', code:url.searchParams.get('code'), redirect_uri:origin(env) + '/api/auth/discord/callback'}), signal:AbortSignal.timeout(10000)});
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw Error(`token ${response.status} ${String(detail.error || '').slice(0, 40)}`); }
    const auth = await response.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {headers:{Authorization:`Bearer ${auth.access_token}`}, signal:AbortSignal.timeout(10000)});
    if (!profileResponse.ok) throw Error(`profile ${profileResponse.status}`);
    const profile = await profileResponse.json();
    if (!/^\d{15,22}$/.test(profile.id)) throw Error('identity');
    const display = String(profile.global_name || profile.username || 'Pilote').slice(0, 32);
    const avatarHash = typeof profile.avatar === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(profile.avatar) ? profile.avatar : '';
    const session = token();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(profile.id, display, now()),
      env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(session), profile.id, now() + SESSION_DAYS * DAY)
    ]);
    await discoverMemberships(env, await allCommunities(env), profile.id).catch(error => console.error('Memberships at sign-in:', String(error?.message || '').slice(0, 80)));
    const old = cookie(request, names.session);
    if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(old)).run();
    const avatarCookie = avatarHash
      ? `em_discord_avatar=${encodeURIComponent(`${profile.id}:${avatarHash}`)}; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * DAY}`
      : `em_discord_avatar=; Path=/;${names.domain ? ` Domain=${names.domain};` : ''} Secure; SameSite=Lax; Max-Age=0`;
    return redirect(back, [clear, clearReturn, setCookie(names.session, session, SESSION_DAYS * DAY, names.domain), avatarCookie]);
  } catch (error) {
    console.error('Discord sign-in failed:', String(error?.message || 'unknown').slice(0, 80));
    return failed();
  }
}
