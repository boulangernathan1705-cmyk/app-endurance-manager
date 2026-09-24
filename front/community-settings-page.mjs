import {state,load,showError} from './app/core.mjs?v=11-community-navigation';
import {renderCommunities} from './app/community-directory.mjs?v=12-community-navigation';

try {
  await load();
  renderCommunities(state.requestedCommunityId||state.activeCommunityId||null);
} catch(error) {
  showError(error);
}
