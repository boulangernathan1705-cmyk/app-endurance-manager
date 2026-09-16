import {state} from './front/app/core.mjs';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=25-organizations';
import './front/app/organizations-view.mjs?v=1';
import './front/app/organization-entry-bridge.mjs?v=1';

installCrewDepartureOpenState(state);
