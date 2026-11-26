import {gameForEvent} from '../../shared/catalog.mjs';
import {api} from './api-client.mjs';

export function createRaceService(activeGame) {
  // Only in-memory copies. The caller supplies the current session scope before using the service.
  const eventResponses=new Map();
  let eventSession='';
  async function fetchEvents(scope) {
    if (!eventResponses.has(scope)) eventResponses.set(scope,{});
    const result = await api(`/api/races?game=${encodeURIComponent(activeGame)}&scope=${scope}`,'GET',undefined,eventResponses.get(scope));
    return (Array.isArray(result.events)?result.events:[]).filter(event => event.format === 'solo' || gameForEvent(event) === activeGame);
  }
  // One in-memory list for the calendar and the organisers. In-flight reads belong to this session only.
  const otherGame = activeGame === 'lmu' ? 'iracing' : 'lmu';
  let otherEndurancesCache = {events:[], at:0, pending:null, response:{}, listeners:new Map()};
  const otherGameEvent = id => otherEndurancesCache.events.find(event => event.id === id) || null;

  function invalidateOtherEndurances() {
    otherEndurancesCache = {...otherEndurancesCache, at:0, pending:null, response:{}, listeners:new Map()};
  }

  function otherGameEndurances(view, onLoad) {
    const cache = otherEndurancesCache;
    if (Date.now() - cache.at < 60000) return cache.events;
    cache.listeners.set(view,onLoad);
    cache.pending ??= api(`/api/races?game=${otherGame}&scope=upcoming`,'GET',undefined,cache.response).then(result => {
      if (cache !== otherEndurancesCache) return;
      cache.events = (Array.isArray(result.events) ? result.events : [])
        .filter(event => event.format !== 'solo' && gameForEvent(event) === otherGame)
        .map(event => ({...event,otherGame}));
      cache.at = Date.now();
      const listeners = [...cache.listeners.values()];
      cache.listeners.clear();
      for (const listener of listeners) listener();
    }).catch(() => {
      cache.at = Date.now();
      cache.listeners.clear();
    }).finally(() => { cache.pending = null; });
    return cache.events;
  }

  function setSession(sessionKey) {
    if (sessionKey!==eventSession) {
      eventResponses.clear();
      otherEndurancesCache = {events:[], at:0, pending:null, response:{}, listeners:new Map()};
      eventSession=sessionKey;
    }
  }

  return {fetchEvents,setSession,otherGameEvent,invalidateOtherEndurances,otherGameEndurances};
}
