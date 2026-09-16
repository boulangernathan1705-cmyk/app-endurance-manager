import {state} from './front/app/core.mjs';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=26-audiences';
import './front/app/organizations-view.mjs?v=4-teams-communities-simple';
import './front/app/organization-entry-bridge.mjs?v=2-audiences';

installCrewDepartureOpenState(state);
