import {hash} from './core.mjs';
import {isDevelopment} from './dev-environment.mjs';

// A database-wide revision is deliberately conservative: official races and pilots' alternate
// communities can change any list. The indexed clocks also change without a write (archive,
// end of the one-day upcoming margin, and the stream crew lookup's one-day lifetime).
export async function eventListTag(env, actor, community, {game, scope, origin, at}) {
  let row;
  try {
    row = await env.DB.prepare(`SELECT generation, revision,
      (SELECT MAX(last_start) FROM events WHERE last_start<=?) AS archived,
      (SELECT MAX(last_start) FROM events WHERE last_start<=?) AS expired,
      (SELECT MAX(CAST(json_extract(departures,'$[0].startsAt') AS INTEGER)) FROM events
        WHERE sim='stream' AND CAST(json_extract(departures,'$[0].startsAt') AS INTEGER)<?) AS stream_expired
      FROM event_list_revision WHERE id=1`).bind(at, at-86400000, at-86400000).first();
  } catch (error) {
    // Deploying code before migration 0090 must only disable the optimization.
    if (String(error.message).includes('no such table: event_list_revision')) return null;
    throw error;
  }
  if (!row) return null;
  return `W/"${await hash(JSON.stringify(['events-v1', row, origin, community.id,
    actor.user?.id || '', actor.manager, [...actor.permissions].sort(), game, scope, isDevelopment(env)]))}"`;
}

export function matchesEventTag(header, tag) {
  // Never accept '*': the browser must already hold this particular, authorized representation.
  return Boolean(tag && header?.split(',').some(value => value.trim().replace(/^W\//, '') === tag.replace(/^W\//, '')));
}
