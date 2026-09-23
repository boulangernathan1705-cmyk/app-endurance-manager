import {state} from './front/app/core.mjs?v=7-runtime';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=33-core-versioned';
import './front/app/paddock-network.mjs?v=5-core-versioned';

installCrewDepartureOpenState(state);
