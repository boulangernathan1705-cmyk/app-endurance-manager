import {state} from './front/app/core.mjs';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=30-community-context';
import './front/app/paddock-network.mjs?v=3-community-context';

installCrewDepartureOpenState(state);
