-- Violet leaves the pilots' palette (shared/combos.mjs, COLORS): it marks the best pilot on the sheets and the practice
-- overlay. Pilots who had chosen it get a colour by their place again.
DELETE FROM combo_colors WHERE color = '#b98cff';
