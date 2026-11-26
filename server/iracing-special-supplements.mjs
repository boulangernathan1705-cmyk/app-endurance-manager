// Verified omissions in the public season feed. This is an explicit, dated fallback,
// not a second authoritative schedule: live feed dates/status always take precedence.
// Add future entries only after checking the official source. Expired entries are ignored.
export const OFFICIAL_SPECIAL_SUPPLEMENTS = [
  {
    slug:'992-endurance-cup', name:'992 Endurance Cup',
    date_start:'2026-11-27', date_end:'2026-11-29',
    track_name:'Circuit de Spa-Francorchamps', car_class:'Porsche Cup',
    duration_minutes:720,
    official_source:'https://www.iracing.com/this-week-iracing-creventic-992-endurance-cup-special-event/',
    verified_at:'2026-11-26'
  },
  {
    slug:'pcc-vir', name:'THE Production Car Challenge @ViR',
    date_start:'2026-12-18', date_end:'2026-12-19',
    track_name:'ViR Grand Course', car_class:'Production Car Challenge Cars',
    duration_minutes:240,
    official_source:'https://www.iracing.com/special-events/',
    verified_at:'2026-11-26'
  }
];
