import {state,load} from './core.mjs';
import {renderNav,renderHome} from './home-view.mjs';
import {renderEvent} from './event-view.mjs';
import {renderMyEntries} from './entries-view.mjs';
export async function refreshAfterSave(message,firstId){await load();renderNav();state.drafts={};if(firstId)state.events.sort((a,b)=>a.id===firstId?-1:b.id===firstId?1:0);if(state.page==='event')renderEvent(message);else if(state.page==='my-entries')renderMyEntries();else renderHome(message);}
export async function refresh(){await load();renderNav();state.drafts={};if(state.page==='event')renderEvent();else if(state.page==='my-entries')renderMyEntries();else renderHome();}
