import {state} from './front/app/core.mjs?v=12-site-tool';
import {installCrewDepartureOpenState} from './front/crew-departure-open-state.mjs?v=1';
import './front/app/actions.mjs?v=42-site-tool';
import './front/app/paddock-network.mjs?v=9-community-only';

installCrewDepartureOpenState(state);
