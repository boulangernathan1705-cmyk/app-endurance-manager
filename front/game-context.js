(() => {
  const game = location.pathname.startsWith('/iracing') ? 'iracing' : 'lmu';
  const labels = {lmu:'Le Mans Ultimate',iracing:'iRacing'};
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.__ENDURANCE_GAME__ = game;
  document.documentElement.dataset.game = game;

  const eventGame = event => String(event?.circuit || '').startsWith('iracing-') ? 'iracing' : 'lmu';
  const methodOf = (input, init) => String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, location.origin);
    const isCollection = url.origin === location.origin && url.pathname === '/api/events';
    const isEventDetail = url.origin === location.origin && /^\/api\/events\/[a-f0-9-]{36}$/.test(url.pathname);
    if (!isCollection && !isEventDetail) return nativeFetch(input, init);

    const method = methodOf(input, init);
    let requestInit = init;
    const keepsGame = game === 'iracing' && ((isCollection && method === 'POST') || (isEventDetail && method === 'PATCH'));
    if (keepsGame && typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (!payload.circuit) payload.circuit = 'iracing-tbd';
        requestInit = {...init,body:JSON.stringify(payload)};
      } catch {}
    }

    const response = await nativeFetch(input, requestInit);
    if (!isCollection || method !== 'GET' || !response.ok) return response;
    const type = response.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data.events)) return response;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return new Response(JSON.stringify({...data,events:data.events.filter(event => eventGame(event) === game)}), {
        status:response.status,
        statusText:response.statusText,
        headers
      });
    } catch {
      return response;
    }
  };

  addEventListener('DOMContentLoaded', () => {
    const label = document.getElementById('game-context-label');
    if (label) label.textContent = labels[game];
    document.title = `${labels[game]} — ENDURANCE MANAGER`;
  }, {once:true});
})();
