import {state} from './front/app/core.mjs?v=8-explicit-general';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=35-event-syntax';
import './front/app/paddock-network.mjs?v=7-event-syntax';

installCrewDepartureOpenState(state);
