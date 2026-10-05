-- The Ferrari 296 GT3's service times, read in LMU's own API on 2026-10-05 (RepairAndRefuel, pitStopTimes) and
-- checked on real stops, so the circuit sheet can show them before the plugin sends them itself. The plugin's
-- values replace these as soon as it sends some (updated_at 0).
INSERT OR IGNORE INTO training_cars(car,car_class,service,updated_at) VALUES
  ('Ferrari 296 LMGT3 Evo','GT3','{"fuelRate":3.4,"energyRate":2.5,"connect":2,"tyres4":12,"tyres2":4.5,"wing":25,"ductFront":10,"ductRear":9,"brakes":120,"driver":25,"repair":30}',0),
  ('Ferrari 296 LMGT3','GT3','{"fuelRate":3.4,"energyRate":2.5,"connect":2,"tyres4":12,"tyres2":4.5,"wing":25,"ductFront":10,"ductRear":9,"brakes":120,"driver":25,"repair":30}',0);
