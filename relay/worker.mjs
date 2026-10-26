// Relais du mur des stands, déployé seul sur un second compte Cloudflare (wrangler.relay.jsonc) : le direct (le plugin
// du pilote au volant, les pages des coéquipiers) ne touche jamais le quota du site. Il ne garde que le salon de chaque
// communauté (LiveRoom, server/live.mjs, le même que sur le site) et n'ouvre la porte qu'avec un laissez-passer signé par
// le site (shared/relay-pass.mjs). Aucune base de données, aucun compte : le site reste le seul à savoir qui a le droit.
import {openLive} from '../server/live.mjs';
import {readPass} from '../shared/relay-pass.mjs';

export {LiveRoom} from '../server/live.mjs';

const text = (body, status = 200) => new Response(body, {status, headers:{'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return text('Endurance Manager · relais du mur des stands');
    if (url.pathname !== '/socket') return text('Introuvable.', 404);
    const pass = await readPass(env.RELAY_SECRET, url.searchParams.get('pass'));
    if (!pass) return text('Laissez-passer refusé ou expiré.', 403);
    try {
      return await openLive(request, env, pass.c, {Role:pass.r, User:pass.u || '', Name:pass.n || '', Color:pass.col || ''});
    } catch (error) {
      return text(error.message || 'Erreur du relais.', error.status || 500);
    }
  }
};
