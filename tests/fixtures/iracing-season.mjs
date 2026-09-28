// A small season of the iRacing schedule (same shape as iRacing Planner's docs/data/*.json).
const EVERY_HALF_HOUR = Array.from({length:48}, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
export const SEASON = {
  championships:[
    {name:'IMSA Endurance Series', category:'SPORTS CAR', typical_session_duration_minutes:160,
      session_times_by_day:{'5':['02:00','07:00','18:00'], '6':['14:00']},
      weeks:[
        {week_number:1, track_name:'Road Atlanta - Full Course', date_start:'2026-09-19', date_end:'2026-09-25', duration_minutes:160},
        {week_number:2, track_name:'Long Beach Street Circuit', date_start:'2026-10-17', date_end:'2026-10-23', duration_minutes:160}]},
    {name:'IMSA Michelin Pilot Challenge', category:'SPORTS CAR', typical_session_duration_minutes:120,
      session_times_by_day:{'5':['04:00','15:00'], '6':['00:00','20:00']},
      weeks:[{week_number:3, track_name:'Charlotte Motor Speedway - Roval 2019', date_start:'2026-10-24', date_end:'2026-10-30', duration_minutes:120}]},
    {name:'2026 Petit Le Mans Presented by VCO', category:'SPORTS CAR', typical_session_duration_minutes:600,
      session_times_by_day:Object.fromEntries(Array.from({length:7}, (_, day) => [String(day), EVERY_HALF_HOUR])),
      weeks:[{week_number:1, track_name:'Road Atlanta - Full Course', date_start:'2026-11-06', date_end:'2026-11-12', duration_minutes:600}]},
    {name:'Formula A - Grand Prix Tour', category:'FORMULA CAR', typical_session_duration_minutes:90, session_times_by_day:{'5':['10:00']},
      weeks:[{week_number:1, track_name:'Monza', date_start:'2026-10-17', date_end:'2026-10-23', duration_minutes:90}]}
  ],
  special_events:[
    {slug:'petit-le-mans', name:'Petit Le Mans', date_start:'2026-11-06', date_end:'2026-11-08', track_name:null, car_class:'GTP // LMP2 // GT3 (IMSA)'},
    {slug:'indy-8hr', name:'8 Hours of Indianapolis', date_start:'2026-10-16', date_end:'2026-10-18', track_name:null, car_class:'GT3'},
    {slug:'daytona-500', name:'Daytona 500', date_start:'2026-10-16', date_end:'2026-10-18', track_name:'Daytona', car_class:'NASCAR  Cup Series'}
  ]
};
