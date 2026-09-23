import {state} from './front/app/core.mjs?v=8-explicit-general';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=34-explicit-general';
import './front/app/paddock-network.mjs?v=6-explicit-general';

installCrewDepartureOpenState(state);
