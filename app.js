import {state} from './front/app/core.mjs';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=32-community-first-runtime';
import './front/app/paddock-network.mjs?v=4-community-first-runtime';

installCrewDepartureOpenState(state);
