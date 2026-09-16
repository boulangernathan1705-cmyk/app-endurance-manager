import {state} from './front/app/core.mjs';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=28-paddock-network';
import './front/app/paddock-network.mjs?v=1-event-first';

installCrewDepartureOpenState(state);
