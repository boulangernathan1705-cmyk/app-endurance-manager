// Laissez-passer du relais en direct (relay/worker.mjs) : le site, qui sait qui est connecté et ce qu'il a le droit de
// voir, signe pour quelques minutes qui ouvre quel salon ; le relais, sur un autre compte Cloudflare, le vérifie avec le
// même secret (RELAY_SECRET) sans rien demander au site. Format : <données en base64url>.<signature HMAC-SHA256>.

const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unbase64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));

// How long a pass opens a connection: the time to connect. The room then asks to reconnect every few hours.
export const PASS_FOR = 5 * 60_000;

async function key(secret) {
  if (!secret || String(secret).length < 32) throw new Error('RELAY_SECRET manquant ou trop court.');
  return crypto.subtle.importKey('raw', encoder.encode(String(secret)), {name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
}

// data: {c: community id, r: 'driver' | 'viewer', u: user id, n: name, col: colour}.
export async function signPass(secret, data, at = Date.now()) {
  const body = base64url(encoder.encode(JSON.stringify({...data, exp:at + PASS_FOR})));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body)));
  return `${body}.${base64url(signature)}`;
}

// The pass's data, or null when it is not one, was not signed with this secret, or is out of date.
export async function readPass(secret, pass, at = Date.now()) {
  const [body, signature, extra] = String(pass || '').split('.');
  if (!body || !signature || extra !== undefined || pass.length > 2000) return null;
  try {
    if (!await crypto.subtle.verify('HMAC', await key(secret), unbase64url(signature), encoder.encode(body))) return null;
    const data = JSON.parse(new TextDecoder().decode(unbase64url(body)));
    if (!(data?.exp > at) || typeof data.c !== 'string' || !['driver', 'viewer'].includes(data.r)) return null;
    return data;
  } catch { return null; }
}

// Where to connect with a pass: the relay's address (https://…) turned into its WebSocket door.
export const relaySocketUrl = (relay, pass) => `${String(relay).replace(/^http/, 'ws').replace(/\/+$/, '')}/socket?pass=${encodeURIComponent(pass)}`;
