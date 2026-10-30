// Request-local only. Log aggregates, never SQL, bind values, cookies, URLs or response bodies.
// Cloudflare's sampled invocation log supplies CPU time; elapsed_ms below is wall time.
export function measuredDatabase(database) {
  const totals = {queries:0, rows_read:0, rows_written:0, sql_ms:0, metadata_complete:true};
  const originals = new WeakMap();
  function record(result) {
    const meta = result?.meta;
    totals.queries++;
    if (!Number.isFinite(meta?.rows_read) || !Number.isFinite(meta?.rows_written)) totals.metadata_complete=false;
    totals.rows_read += Number(meta?.rows_read) || 0;
    totals.rows_written += Number(meta?.rows_written) || 0;
    totals.sql_ms += Number(meta?.duration) || 0;
    return result;
  }
  function wrap(statement) {
    const wrapped = {
      bind(...values) { return wrap(statement.bind(...values)); },
      async all() { return record(await statement.all()); },
      async run() { return record(await statement.run()); },
      async first(column) {
        // D1 first() discards metadata; all() executes the same SQL exactly once.
        const row = (await wrapped.all()).results?.[0];
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row, column)) throw new Error('D1_ERROR: Column not found');
        return row[column];
      }
    };
    originals.set(wrapped, statement);
    return wrapped;
  }
  return {totals, database:{
    prepare(sql) { return wrap(database.prepare(sql)); },
    async batch(statements) { return (await database.batch(statements.map(statement => originals.get(statement) || statement))).map(record); }
  }};
}

export async function measureRequest(request, env, handler) {
  const path = new URL(request.url).pathname;
  const route = path === '/api/session' ? 'session' : ['/api/races','/api/events'].includes(path) ? 'events' : null;
  if (!route || request.method !== 'GET' || env.REQUEST_METRICS !== 'on' || !env.DB) return handler(env);
  const measured = measuredDatabase(env.DB), started = Date.now();
  let status = 500;
  try {
    const response = await handler({...env, DB:measured.database});
    status = response.status;
    return response;
  } catch (error) {
    status = Number.isInteger(error.status) ? error.status : 503;
    throw error;
  } finally {
    console.log({event:'request_usage', route, status, elapsed_ms:Date.now()-started, ...measured.totals});
  }
}
