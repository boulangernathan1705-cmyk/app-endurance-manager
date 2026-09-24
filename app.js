import {state} from './front/app/core.mjs?v=11-community-navigation';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=41-community-navigation';
import './front/app/paddock-network.mjs?v=9-community-only';

installCrewDepartureOpenState(state);
