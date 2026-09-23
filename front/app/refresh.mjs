import {state,load} from './core.mjs?v=10-community-only';
import {renderNav,renderHome} from './home-view.mjs?v=14-community-only';
import {renderEvent} from './event-view.mjs?v=21-community-only';
import {renderMyEntries} from './entries-view.mjs?v=9-community-only';
export async function refreshAfterSave(message,firstId){await load();renderNav();state.drafts={};if(firstId)state.events.sort((a,b)=>a.id===firstId?-1:b.id===firstId?1:0);if(state.page==='event')renderEvent(message);else if(state.page==='my-entries')renderMyEntries();else renderHome(message);}
export async function refresh(){await load();renderNav();state.drafts={};if(state.page==='event')renderEvent();else if(state.page==='my-entries')renderMyEntries();else renderHome();}
