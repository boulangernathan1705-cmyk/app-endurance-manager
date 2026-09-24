import {state,load,showError} from './app/core.mjs?v=13-tondeuz-tool';
import {renderCommunities} from './app/community-directory.mjs?v=13-tondeuz-tool';

try {
  await load();
  const siteId=state.organizations?.siteCommunityId||state.activeCommunityId||null;
  const community=[...(state.organizations?.communities||[]),...(state.organizations?.discoverableCommunities||[])].find(item=>item.id===siteId);
  const allowed=['admin','organizer'].includes(state.user?.role)||['owner','manager'].includes(community?.role);
  if(!state.user||!siteId||!community||!allowed)throw Error('Ces paramètres sont réservés aux responsables du site.');
  renderCommunities(siteId);
} catch(error) {
  showError(error);
}
