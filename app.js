import {state} from './front/app/core.mjs?v=10-community-only';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=39-community-settings-ux';
import './front/app/paddock-network.mjs?v=9-community-only';

installCrewDepartureOpenState(state);
