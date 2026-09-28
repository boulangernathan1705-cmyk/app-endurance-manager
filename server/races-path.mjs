// The site calls its race API /api/races: ad blockers often block addresses containing "/api/events",
// which look like analytics endpoints. /api/events stays accepted for pages opened before the rename.
export const racesPath = pathname => String(pathname).replace(/^\/api\/races(?=\/|$)/, '/api/events');
