import {esc} from './core.mjs';
import {TRACK_LIMITS,RACE_WEATHERS} from '../../shared/catalog.mjs';

// Endurance settings (all optional): track limits, tyres available, cars on track, fair share, forecast weather. On the race
// page each one is an icon with its value; its name is in the info bubble.
const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const RACE_INFO_ICONS={
  trackLimits:svg('<path d="M4 12c3-6 13-6 16 0"/><path d="M3 16h18M3 20h18M6 16l2 4M11 16l2 4M16 16l2 4"/>'),
  tyres:svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  grid:svg('<rect x="4" y="3" width="6" height="5" rx="1"/><rect x="14" y="7" width="6" height="5" rx="1"/><rect x="4" y="12" width="6" height="5" rx="1"/><rect x="14" y="16" width="6" height="5" rx="1"/>'),
  fairShare:svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M3.5 10.5h6M14.5 10.5h6M12 14.5V21"/>'),
  dry:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  mixed:svg('<path d="M8 4.5a3.5 3.5 0 0 1 5.6 1.6"/><path d="M4 7.5h1M6 3.5l.7.7"/><path d="M7 20a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 1 1 17 20Z"/>'),
  rain:svg('<path d="M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 1 1 17 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>'),
};
RACE_INFO_ICONS.weather=RACE_INFO_ICONS.mixed;
const TRACK_SHORT={strict:'Strict',normal:'Normal'};

export function raceInfoChips(event){
  const info=event?.details||{},chips=[];
  const chip=(key,value,tip)=>chips.push(`<span class="race-info-chip" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${RACE_INFO_ICONS[key]}<b>${esc(value)}</b></span>`);
  if(TRACK_LIMITS[info.trackLimits])chip('trackLimits',TRACK_SHORT[info.trackLimits],`Limites de piste : ${TRACK_LIMITS[info.trackLimits].toLowerCase()}`);
  if(info.tyres)chip('tyres',info.tyres,`Pneus disponibles pour la course : ${info.tyres}`);
  if(info.grid)chip('grid',info.grid,`Voitures sur la piste : ${info.grid}`);
  if(RACE_WEATHERS[info.weather]||info.weatherNote)chip(RACE_WEATHERS[info.weather]?info.weather:'weather',RACE_WEATHERS[info.weather]||'Météo',['Météo prévue',RACE_WEATHERS[info.weather]&&`: ${RACE_WEATHERS[info.weather].toLowerCase()}`,info.weatherNote&&`${RACE_WEATHERS[info.weather]?'.':' :'} ${info.weatherNote}`].filter(Boolean).join(''));
  if(typeof info.fairShare==='boolean')chip('fairShare',info.fairShare?'Oui':'Non',`Partage du volant : ${info.fairShare?'activé':'désactivé'}`);
  return chips.length?`<span class="race-info-chips">${chips.join('')}</span>`:'';
}

// Event form, step 1: the settings in a grid, each optional.
export function raceInfoFields(event){
  const info=event?.details||{};
  const option=(value,label,current)=>`<option value="${value}" ${String(current??'')===value?'selected':''}>${label}</option>`;
  const fair=typeof info.fairShare==='boolean'?String(info.fairShare):'';
  return `<div class="race-info-fields" data-format-section="endurance"><span class="form-label">Infos de la course <small>(facultatif)</small></span><div class="race-info-grid">`
    +`<label class="form-label"><span>${RACE_INFO_ICONS.trackLimits}Limites de piste</span><select name="raceTrackLimits">${option('','—',info.trackLimits)}${Object.entries(TRACK_LIMITS).map(([key,label])=>option(key,label,info.trackLimits)).join('')}</select></label>`
    +`<label class="form-label"><span>${RACE_INFO_ICONS.tyres}Pneus</span><input name="raceTyres" type="number" inputmode="numeric" min="1" max="99" step="1" value="${esc(info.tyres??'')}" placeholder="Nombre"></label>`
    +`<label class="form-label"><span>${RACE_INFO_ICONS.grid}Grille</span><input name="raceGrid" type="number" inputmode="numeric" min="1" max="120" step="1" value="${esc(info.grid??'')}" placeholder="Voitures"></label>`
    +`<label class="form-label"><span>${RACE_INFO_ICONS.fairShare}Partage du volant <span class="tip-info" data-tip="Fair share : chaque pilote de l’équipage doit rouler une part minimale de la course.">ⓘ</span></span><select name="raceFairShare">${option('','—',fair)}${option('true','Activé',fair)}${option('false','Désactivé',fair)}</select></label>`
    +`<label class="form-label"><span>${RACE_INFO_ICONS.weather}Météo</span><select name="raceWeather">${option('','—',info.weather)}${Object.entries(RACE_WEATHERS).map(([key,label])=>option(key,label,info.weather)).join('')}</select></label>`
    +`<label class="form-label"><span>Précision météo</span><input name="raceWeatherNote" maxlength="60" value="${esc(info.weatherNote??'')}" placeholder="Pluie possible la nuit"></label>`
    +`</div></div>`;
}
export function readRaceInfo(form){
  const value=name=>form.elements[name]?.value||'';
  const fair=value('raceFairShare');
  return {trackLimits:value('raceTrackLimits'),tyres:value('raceTyres'),grid:value('raceGrid'),...(fair?{fairShare:fair==='true'}:{}),weather:value('raceWeather'),weatherNote:value('raceWeatherNote').trim()};
}
export function raceInfoRecap(form){
  const info=readRaceInfo(form),parts=[];
  if(info.trackLimits)parts.push(`Limites ${TRACK_LIMITS[info.trackLimits].toLowerCase()}`);
  if(info.tyres)parts.push(`${info.tyres} pneus`);
  if(info.grid)parts.push(`${info.grid} voitures`);
  if('fairShare' in info)parts.push(`Partage du volant ${info.fairShare?'activé':'désactivé'}`);
  if(info.weather||info.weatherNote)parts.push(`Météo${info.weather?` ${RACE_WEATHERS[info.weather].toLowerCase()}`:''}${info.weatherNote?` (${info.weatherNote})`:''}`);
  return parts.join(' · ');
}
