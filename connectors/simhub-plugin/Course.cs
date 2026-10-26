// Chiffres de course pour les tableaux de bord : ce qu'un dash LMU prend d'habitude au plugin NeoRed (énergie et carburant
// jusqu'à l'arrivée, à remettre, tours restants, positions dans la classe, menu des stands, durée de l'arrêt, pénalités,
// pneus, état de la voiture, météo), calculé ici depuis la même copie de la mémoire du jeu et le menu des stands de l'API
// locale. Publiés en propriétés SimHub sous les mêmes noms que NeoRed (EnduranceManagerPlugin.Energy.VE.Current_%…),
// pour qu'un dash passe de l'un à l'autre en changeant seulement le préfixe (« Convertir un dash NeoRed.ps1 »).
// Des chiffres bruts, aucun conseil. Rien ici ne modifie le jeu.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // One line of the game's pit menu (garage/PitMenu/receivePitMenu): its name, the choice made and its text.
    public class MenuItem
    {
        public string Name, Text;
        public int Index;
    }

    // The game's pit menu as the pilot has set it, read aside every few seconds (one read at a time).
    public class PitMenu
    {
        const string Url = "http://localhost:6397/rest/garage/PitMenu/receivePitMenu";
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        int busy;

        public volatile List<MenuItem> Items = new List<MenuItem>();
        public bool Busy => busy != 0;

        // Never throws: it runs on a pool thread, where an error would close SimHub.
        public void Read()
        {
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                var lines = JArray.Parse(client.GetStringAsync(Url).GetAwaiter().GetResult());
                var items = new List<MenuItem>();
                foreach (var line in lines.OfType<JObject>())
                {
                    string name = ((string)line["name"] ?? "").Replace(":", "").Trim().ToUpperInvariant();
                    int index = (int?)line["currentSetting"] ?? 0;
                    var settings = line["settings"] as JArray;
                    string text = settings != null && index >= 0 && index < settings.Count ? ((string)settings[index]?["text"] ?? "").Trim() : "";
                    if (name != "") items.Add(new MenuItem { Name = name, Index = index, Text = text });
                }
                Items = items;
            }
            catch { }
            finally { busy = 0; }
        }

        // The first number in a menu text (« 55% », « 45.0L », « 1.02 »), null when there is none.
        public static double? Number(string text)
        {
            var m = Regex.Match(text ?? "", @"-?\d+(?:[.,]\d+)?");
            return m.Success && double.TryParse(m.Value.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : (double?)null;
        }
    }

    // What the dashboards read, built once a second on the reading thread and published whole.
    public class CourseView
    {
        public double? VeCurrent, VeLastLap, VeAvg5, VeLapsLeft, VeNeeded, VeToRefill, VeToRefillSafe;
        public double? FuelCurrent, FuelMax, FuelLastLap, FuelAvg5, FuelLapsLeft, FuelNeeded, FuelToRefill, FuelToRefillSafe;
        public double? RatioLastLap, RatioAvg5;
        public double? LapsLeft, TimeLeft, LapTimeAvg10, LastLap, BestLap;
        public int? PosOverall, PosInClass, CarsInClass, Stops, Penalties, PitState;
        public double? GapToFirstInClassTime, GapAheadInClassTime;
        public int? GapToFirstInClassLaps;
        public bool InPits, InGarage;
        public double? LastStop;
        public string MenuFuel, MenuVe, MenuRatio, MenuRepair, MenuBrakes, MenuDriver, MenuWing, MenuGrille, MenuAll;
        public string[] MenuTyre = new string[4], MenuPressure = new string[4];
        public double? EstimateTotal, EstimateTyres, EstimateFuel, EstimateVe, EstimateDriver, EstimateBrakes, EstimateDamage;
        public string[] Compound = new string[4];
        public double?[] Pressure = new double?[4], TyreTemp = new double?[4], TyreLeft = new double?[4], BrakeTemp = new double?[4];
        public double? Damage, Water, Oil;
        public double? AirTemp, TrackTemp, Rain, Wetness;
        public string Car, Class, Track, Driver;
        public int? TC, TCSlip, TCCut, ABS, MotorMap, Migration, AntiSwayFront, AntiSwayRear;
        public string TCText, ABSText, MotorMapText, MigrationText;
        public double? BrakeBiasFront, Battery, Regen, GapAhead, GapBehind, DeltaBest, TrackLimitsPoints, TimeOfDay, CloudCoverage;
    }

    public class Course
    {
        const int ScoringInfo = 1632, VehScoring = 2192, VehSize = 584, MaxVehicles = 104;
        static readonly string[] Corners = { "FL", "FR", "RL", "RR" };

        public volatile CourseView View = new CourseView();

        static double F64(byte[] b, int at) => BitConverter.ToDouble(b, at);
        static int I32(byte[] b, int at) => BitConverter.ToInt32(b, at);
        static short I16(byte[] b, int at) => BitConverter.ToInt16(b, at);
        static string Text(byte[] b, int at, int size)
        {
            int end = Array.IndexOf(b, (byte)0, at, size);
            return Encoding.UTF8.GetString(b, at, (end < 0 ? at + size : end) - at).Trim();
        }
        static double? R(double? value, int digits) => value == null || double.IsNaN(value.Value) || double.IsInfinity(value.Value) ? null : Math.Round(value.Value, digits, MidpointRounding.AwayFromZero);
        static double? Mean(IEnumerable<double> values) { var list = values.ToList(); return list.Count > 0 ? list.Average() : (double?)null; }

        // Every property, its name (as NeoRed's) and how it reads the view. Plugin.cs attaches them all.
        public static readonly (string Name, Func<CourseView, object> Get)[] Properties = BuildProperties();

        static (string, Func<CourseView, object>)[] BuildProperties()
        {
            var list = new List<(string, Func<CourseView, object>)>
            {
                ("Energy.VE.Current_%", v => v.VeCurrent),
                ("Energy.VE.PerLastLap_%", v => v.VeLastLap),
                ("Energy.VE.PerLast5Lap_%", v => v.VeAvg5),
                ("Energy.VE.FractionPerLap_%", v => v.VeAvg5),
                ("Energy.VE.Computed_RemainLaps", v => v.VeLapsLeft),
                ("Energy.VE.NeededUntilEnd_%", v => v.VeNeeded),
                ("Energy.VE.toRefill_%", v => v.VeToRefill),
                ("Energy.VE.toRefill_safe_%", v => v.VeToRefillSafe),
                ("Energy.Fuel.Current_L", v => v.FuelCurrent),
                ("Energy.Fuel.Max_L", v => v.FuelMax),
                ("Energy.Fuel.PerLastLap_L", v => v.FuelLastLap),
                ("Energy.Fuel.LiterPerLap_Average", v => v.FuelAvg5),
                ("Energy.Fuel.Computed_RemainLaps", v => v.FuelLapsLeft),
                ("Energy.Fuel.NeededUntilEnd_L", v => v.FuelNeeded),
                ("Energy.Fuel.toRefill_L", v => v.FuelToRefill),
                ("Energy.Fuel.toRefill_safe_L", v => v.FuelToRefillSafe),
                ("Energy.ComputedFuelRatio_LastLap", v => v.RatioLastLap),
                ("Energy.ComputedFuelRatio_PerLast5Lap", v => v.RatioAvg5),
                ("GameInfos.Computed_RemainLaps", v => v.LapsLeft),
                ("GameInfos.TimeLeft_s", v => v.TimeLeft),
                ("GameInfos.Average_10LastLapsTime", v => v.LapTimeAvg10),
                ("GameInfos.LastLapTime", v => v.LastLap),
                ("GameInfos.BestLapTime", v => v.BestLap),
                ("GameInfos.PosOverall", v => v.PosOverall),
                ("GameInfos.PosInClass", v => v.PosInClass),
                ("GameInfos.CarsInClass", v => v.CarsInClass),
                ("GameInfos.GapToFirstInClassTime", v => v.GapToFirstInClassTime),
                ("GameInfos.GapToFirstInClassLaps", v => v.GapToFirstInClassLaps),
                ("GameInfos.GapToAheadInClassTime", v => v.GapAheadInClassTime),
                ("GameInfos.PitState", v => v.PitState),
                ("GameInfos.InPits", v => v.InPits),
                ("GameInfos.InGarage", v => v.InGarage),
                ("Pit.Stops", v => v.Stops),
                ("Pit.StopLength", v => v.LastStop),
                ("Race.Player.Penalties", v => v.Penalties),
                ("PitMenu.Fuel_Text", v => v.MenuFuel),
                ("PitMenu.Virtual_Energy_Text", v => v.MenuVe),
                ("PitMenu.FuelRatio", v => v.MenuRatio),
                ("PitMenu.RepairDamage_Text", v => v.MenuRepair),
                ("PitMenu.BrakesReplace_Text", v => v.MenuBrakes),
                ("PitMenu.Driver_Text", v => v.MenuDriver),
                ("PitMenu.Wing", v => v.MenuWing),
                ("PitMenu.Grille", v => v.MenuGrille),
                ("PitMenu.All_Text", v => v.MenuAll),
                ("PitStopEstimate.Total", v => v.EstimateTotal),
                ("PitStopEstimate.Tires", v => v.EstimateTyres),
                ("PitStopEstimate.Fuel", v => v.EstimateFuel),
                ("PitStopEstimate.VE", v => v.EstimateVe),
                ("PitStopEstimate.DriverSwap", v => v.EstimateDriver),
                ("PitStopEstimate.Brakes", v => v.EstimateBrakes),
                ("PitStopEstimate.Damage", v => v.EstimateDamage),
                ("VehicleCondition.Damage_%", v => v.Damage),
                ("VehicleCondition.WaterTemp", v => v.Water),
                ("VehicleCondition.OilTemp", v => v.Oil),
                ("WeatherInfos.Current.AmbientTemp", v => v.AirTemp),
                ("WeatherInfos.Track.Temp", v => v.TrackTemp),
                ("WeatherInfos.Current.RainIntensity_%", v => v.Rain),
                ("WeatherInfos.Track.Wetness_%", v => v.Wetness),
                ("Extended.VM_BRAKE_BALANCE", v => v.BrakeBiasFront),
                ("Extended.VM_TRACTIONCONTROLMAP", v => v.TC),
                ("Extended.VM_TRACTIONCONTROLSLIPANGLEMAP", v => v.TCSlip),
                ("Extended.VM_TRACTIONCONTROLPOWERCUTMAP", v => v.TCCut),
                ("Extended.VM_ANTILOCKBRAKESYSTEMMAP", v => v.ABS),
                ("Extended.VM_ELECTRIC_MOTOR_MAP", v => v.MotorMap),
                ("Extended.VM_BRAKE_MIGRATION", v => v.Migration),
                ("Extended.VM_FRONT_ANTISWAY", v => v.AntiSwayFront),
                ("Extended.VM_REAR_ANTISWAY", v => v.AntiSwayRear),
                ("Extended.TC_Text", v => v.TCText),
                ("Extended.ABS_Text", v => v.ABSText),
                ("Extended.MotorMap_Text", v => v.MotorMapText),
                ("Extended.Migration_Text", v => v.MigrationText),
                ("Energy.Batt.Current_%", v => v.Battery),
                ("Energy.Regen_kW", v => v.Regen),
                ("GameInfos.GapCarAhead", v => v.GapAhead),
                ("GameInfos.GapCarBehind", v => v.GapBehind),
                ("GameInfos.DeltaBest", v => v.DeltaBest),
                ("GameInfos.TimeOfDay", v => v.TimeOfDay),
                ("Race.Player.TrackLimitsPoints", v => v.TrackLimitsPoints),
                ("WeatherInfos.Current.CloudCoverage_%", v => v.CloudCoverage),
                ("VehicleInfos.Name", v => v.Car),
                ("VehicleInfos.Class", v => v.Class),
                ("TrackInfos.Name", v => v.Track),
                ("TeamInfos.Driver", v => v.Driver),
            };
            for (int i = 0; i < 4; i++)
            {
                int w = i;
                string c = Corners[i];
                list.Add(($"PitMenu.Tyre.{c}_TyreChange_Name", v => v.MenuTyre[w]));
                list.Add(($"PitMenu.Tyre.{c}_Tyre_NewPressure_kPa_Text", v => v.MenuPressure[w]));
                list.Add(($"Tyre.{c}_TyreCompound_Name", v => v.Compound[w]));
                list.Add(($"Tyre.{c}_TyrePressure_kPa", v => v.Pressure[w]));
                list.Add(($"Tyre.{c}_TyreTemp_C", v => v.TyreTemp[w]));
                list.Add(($"Tyre.{c}_TyreLeft_%", v => v.TyreLeft[w]));
                list.Add(($"VehicleCondition.{c}_BrakeTemp_C", v => v.BrakeTemp[w]));
            }
            return list.ToArray();
        }

        // Once a second while driving: everything from the same copy of the game's memory, the session recorded so far
        // (its laps and stops), the game's service times and the pit menu.
        public void Update(byte[] b, Sample s, LiveSession session, ServiceTimes service, PitMenu menu)
        {
            var view = new CourseView
            {
                Car = s.Car, Class = s.Class, Track = s.Track, Driver = s.Driver, InPits = s.InPits, InGarage = s.Garage,
                VeCurrent = R(s.Energy, 2), FuelCurrent = R(s.Fuel, 2), FuelMax = R(s.FuelCapacity, 1),
                Damage = R(s.Damage / 16.0 * 100, 0), Water = R(s.Water, 1), Oil = R(s.Oil, 1),
                AirTemp = R(s.AirTemp, 1), TrackTemp = R(s.TrackTemp, 1), Rain = R(s.Rain * 100, 0),
                Wetness = s.Wet >= 0 && s.Wet <= 1 ? R(s.Wet * 100, 0) : null
            };
            for (int i = 0; i < 4; i++)
            {
                var w = s.Wheels[i];
                view.Compound[i] = i < 2 ? s.FrontCompound : (string.IsNullOrEmpty(s.RearCompound) ? s.FrontCompound : s.RearCompound);
                view.Pressure[i] = R(w.Pressure, 1);
                view.TyreTemp[i] = R(w.Temp, 0);
                view.TyreLeft[i] = R(w.Wear * 100, 1);
                view.BrakeTemp[i] = R(w.Brake, 0);
            }

            // The settings in the car: levels, and « 3/9 » when the car has such a setting (0 steps: none).
            string Level(int level, int max) => max > 0 ? $"{level}/{max}" : null;
            view.TC = s.TC; view.TCSlip = s.TCSlip; view.TCCut = s.TCCut; view.ABS = s.ABS; view.MotorMap = s.MotorMap; view.Migration = s.Migration;
            view.AntiSwayFront = s.AntiSwayFront; view.AntiSwayRear = s.AntiSwayRear;
            view.TCText = Level(s.TC, s.TCMax); view.ABSText = Level(s.ABS, s.ABSMax); view.MotorMapText = Level(s.MotorMap, s.MotorMapMax);
            view.MigrationText = Level(s.Migration, s.MigrationMax);
            view.BrakeBiasFront = s.RearBrakeBias > 0 && s.RearBrakeBias < 1 ? R((1 - s.RearBrakeBias) * 100, 1) : null;
            view.Battery = s.Battery > 0 ? R(s.Battery * 100, 1) : null;
            view.Regen = R(s.Regen, 1);
            view.GapAhead = s.GapAhead > 0 ? R(s.GapAhead, 2) : null;
            view.GapBehind = s.GapBehind > 0 ? R(s.GapBehind, 2) : null;
            view.DeltaBest = R(s.DeltaBest, 2);
            // LMU's own lines after rF2's in the scoring: the time of day (seconds since midnight), the clouds (0-255?) and
            // how many track limits steps make a point.
            double tod = BitConverter.ToSingle(b, ScoringInfo + 344);
            view.TimeOfDay = tod >= 0 && tod <= 86400 ? R(tod, 0) : null;
            view.CloudCoverage = R(b[ScoringInfo + 350], 0);
            int perPoint = b[ScoringInfo + 352];
            view.TrackLimitsPoints = perPoint > 0 ? R((double)s.TrackLimitsSteps / perPoint, 2) : null;

            // The player in the scoring, and the field of his class.
            int count = Math.Min(I32(b, ScoringInfo + 104), MaxVehicles), me = -1;
            for (int i = 0; i < count; i++) if (I32(b, VehScoring + i * VehSize) == s.Id) { me = VehScoring + i * VehSize; break; }
            double length = F64(b, ScoringInfo + 88), et = F64(b, ScoringInfo + 68), end = F64(b, ScoringInfo + 76);
            int maxLaps = I32(b, ScoringInfo + 84);
            double fraction = length > 100 ? Math.Max(0, Math.Min(1, s.LapDist / length)) : 0;
            if (me >= 0)
            {
                view.PosOverall = b[me + 199];
                view.Stops = I16(b, me + 192);
                view.Penalties = I16(b, me + 194);
                view.PitState = b[me + 457];
                double best = F64(b, me + 144);
                view.BestLap = best > 0 ? R(best, 3) : null;
                // The class, best placed first: places, laps and the game's time behind the leader.
                var cls = new List<(int Place, int Laps, double Behind)>();
                for (int i = 0; i < count; i++)
                {
                    int at = VehScoring + i * VehSize;
                    if (Text(b, at + 200, 32) == s.Class) cls.Add((b[at + 199], I16(b, at + 100), F64(b, at + 244)));
                }
                cls.Sort((x, y) => x.Place.CompareTo(y.Place));
                int mine = cls.FindIndex(c => c.Place == view.PosOverall);
                if (mine >= 0)
                {
                    view.PosInClass = mine + 1;
                    view.CarsInClass = cls.Count;
                    view.GapToFirstInClassLaps = cls[0].Laps - cls[mine].Laps;
                    view.GapToFirstInClassTime = R(cls[mine].Behind - cls[0].Behind, 3);
                    if (mine > 0) view.GapAheadInClassTime = R(cls[mine].Behind - cls[mine - 1].Behind, 3);
                }
            }

            // The laps driven in this session: timed, away from the pits, for the pace; with a measure, for the use.
            var laps = session?.Laps ?? new List<LiveLap>();
            var timed = laps.Where(l => l.Time > 0 && !l.Pit && !l.Invalid).ToList();
            var last = laps.LastOrDefault(l => !l.Pit);
            view.LastLap = last != null && last.Time > 0 ? R(last.Time, 3) : null;
            view.LapTimeAvg10 = R(Mean(timed.Skip(Math.Max(0, timed.Count - 10)).Select(l => l.Time)), 3);
            double? pace = Mean(timed.Skip(Math.Max(0, timed.Count - 5)).Select(l => l.Time)) ?? (view.BestLap > 0 ? view.BestLap : null);
            var ve = laps.Where(l => !l.Pit && l.Energy > 0).Select(l => l.Energy).ToList();
            var fuel = laps.Where(l => !l.Pit && l.Fuel > 0).Select(l => l.Fuel).ToList();
            view.VeLastLap = ve.Count > 0 ? R(ve.Last(), 2) : null;
            view.VeAvg5 = R(Mean(ve.Skip(Math.Max(0, ve.Count - 5))), 2);
            view.FuelLastLap = fuel.Count > 0 ? R(fuel.Last(), 2) : null;
            view.FuelAvg5 = R(Mean(fuel.Skip(Math.Max(0, fuel.Count - 5))), 2);
            if (view.VeLastLap > 0 && view.FuelLastLap > 0) view.RatioLastLap = R(view.FuelLastLap / view.VeLastLap, 3);
            if (view.VeAvg5 > 0 && view.FuelAvg5 > 0) view.RatioAvg5 = R(view.FuelAvg5 / view.VeAvg5, 3);

            // What is left to drive, in laps from where the car is: by laps when the race counts them, else by time
            // (the lap running when the clock ends is finished).
            double? left = null;
            if (maxLaps > 0 && maxLaps < 10000) left = Math.Max(0, maxLaps - s.LapsDone - fraction);
            else if (end > 0 && end < 1e6 && pace > 0)
            {
                double time = Math.Max(0, end - et), rest = (1 - fraction) * pace.Value;
                left = time <= rest ? 1 - fraction : 1 - fraction + Math.Ceiling((time - rest) / pace.Value);
                view.TimeLeft = R(time, 0);
            }
            view.LapsLeft = R(left, 2);

            if (view.VeAvg5 > 0)
            {
                view.VeLapsLeft = R(s.Energy / view.VeAvg5, 2);
                if (left != null)
                {
                    double needed = left.Value * view.VeAvg5.Value;
                    view.VeNeeded = R(needed, 1);
                    // What to add, no more than the room left (100 %).
                    double room = Math.Max(0, 100 - s.Energy);
                    view.VeToRefill = R(Math.Min(Math.Max(0, needed - s.Energy), room), 1);
                    view.VeToRefillSafe = R(Math.Min(Math.Max(0, needed + view.VeAvg5.Value - s.Energy), room), 1);
                }
            }
            if (view.FuelAvg5 > 0)
            {
                view.FuelLapsLeft = R(s.Fuel / view.FuelAvg5, 2);
                if (left != null)
                {
                    double needed = left.Value * view.FuelAvg5.Value, room = s.FuelCapacity > 0 ? Math.Max(0, s.FuelCapacity - s.Fuel) : double.MaxValue;
                    view.FuelNeeded = R(needed, 1);
                    view.FuelToRefill = R(Math.Min(Math.Max(0, needed - s.Fuel), room), 1);
                    view.FuelToRefillSafe = R(Math.Min(Math.Max(0, needed + view.FuelAvg5.Value - s.Fuel), room), 1);
                }
            }
            var stop = session?.Stops?.LastOrDefault();
            view.LastStop = stop != null ? R(stop.Stationary, 1) : null;

            ReadMenu(view, menu, s, service);
            View = view;
        }

        // The pit menu as set, and how long the stop it asks would last with the game's service times: the jobs done
        // during the refuelling (« …Along » = 1) overlap, the others add up.
        static void ReadMenu(CourseView view, PitMenu menu, Sample s, ServiceTimes service)
        {
            var items = menu?.Items;
            if (items == null || items.Count == 0) return;
            MenuItem Find(Func<string, bool> match) => items.FirstOrDefault(item => match(item.Name));
            var veItem = Find(n => n.Contains("VIRTUAL ENERGY"));
            var ratioItem = Find(n => n.Contains("FUEL RATIO"));
            var fuelItem = Find(n => n == "FUEL" || (n.StartsWith("FUEL") && !n.Contains("RATIO")));
            var repairItem = Find(n => n.Contains("DAMAGE"));
            var brakesItem = Find(n => n.Contains("BRAKES") && !n.Contains("DUCT"));
            var driverItem = Find(n => n.Contains("DRIVER"));
            view.MenuVe = veItem?.Text;
            view.MenuRatio = ratioItem?.Text;
            view.MenuFuel = fuelItem?.Text;
            view.MenuRepair = repairItem?.Text;
            view.MenuBrakes = brakesItem?.Text;
            view.MenuDriver = driverItem?.Text;
            view.MenuWing = Find(n => n.Contains("WING"))?.Text;
            view.MenuGrille = Find(n => n.Contains("GRILLE"))?.Text;
            view.MenuAll = string.Join(" · ", items.Select(item => item.Name + " " + item.Text));
            int changed = 0;
            for (int i = 0; i < 4; i++)
            {
                string c = Corners[i];
                var tyre = Find(n => n.StartsWith(c + " TIRE") || n.StartsWith(c + " TYRE"));
                view.MenuTyre[i] = tyre?.Text;
                view.MenuPressure[i] = Find(n => n.StartsWith(c) && n.Contains("PRESS"))?.Text;
                // To check in game: the first choice of a wheel's line is « no change ».
                if (tyre != null && tyre.Index > 0) changed++;
            }

            if (service == null) return;
            double along = 0, after = 0;
            void Job(double? time, double? flag, Action<double> show)
            {
                if (time == null || time <= 0) return;
                show(Math.Round(time.Value, 1));
                if (flag == 1) along = Math.Max(along, time.Value); else after += time.Value;
            }
            // Energy or fuel to reach the level asked (the menu gives the level for energy, the litres to add for fuel).
            double? veTarget = PitMenu.Number(veItem?.Text);
            if (veTarget != null && service.EnergyRate > 0 && veTarget > s.Energy)
            {
                double time = (veTarget.Value - s.Energy) / service.EnergyRate.Value + (service.Connect ?? 0);
                view.EstimateVe = Math.Round(time, 1);
                along = Math.Max(along, time);
            }
            else if (veTarget == null && service.FuelRate > 0 && PitMenu.Number(fuelItem?.Text) is double litres && litres > 0)
            {
                double time = litres / service.FuelRate.Value + (service.Connect ?? 0);
                view.EstimateFuel = Math.Round(time, 1);
                along = Math.Max(along, time);
            }
            if (changed == 4) Job(service.Tyres4, service.TyresAlong, t => view.EstimateTyres = t);
            else if (changed > 0) Job(service.Tyres2, service.TyresAlong, t => view.EstimateTyres = t);
            if (brakesItem != null && brakesItem.Index > 0) Job(service.Brakes, service.BrakesAlong, t => view.EstimateBrakes = t);
            if (driverItem != null && driverItem.Index > 0) Job(service.Driver, service.DriverAlong, t => view.EstimateDriver = t);
            if (repairItem != null && repairItem.Index > 0 && s.Damage > 0) Job(service.Repair, service.RepairAlong, t => view.EstimateDamage = t);
            view.EstimateTotal = Math.Round(along + after, 1);
        }
    }

    // The game's answers we do not read yet (pit stop estimate, car condition, weather forecast, game state, setup
    // screen), written once per SimHub run on the pilot's PC: sent to us, they show their exact format before we use them.
    public static class ApiSamples
    {
        static readonly string[] Paths =
        {
            "strategy/pitstop-estimate", "strategy/usage", "garage/getVehicleCondition", "sessions/weather", "sessions/GetGameState",
            "garage/PitMenu/receivePitMenu", "garage/UIScreen/CarSetupOverview", "watch/sessionInfo"
        };
        static readonly HashSet<string> done = new HashSet<string>();
        static int busy;

        // tag: when it was taken (« piste », « stands »), kept in the file name. Never throws.
        public static void Take(string home, string tag)
        {
            if (done.Contains(tag) || System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                done.Add(tag);
                string folder = Path.Combine(home, "api");
                Directory.CreateDirectory(folder);
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) })
                    foreach (var path in Paths)
                    {
                        try
                        {
                            string answer = client.GetStringAsync("http://localhost:6397/rest/" + path).GetAwaiter().GetResult();
                            File.WriteAllText(Path.Combine(folder, tag + "-" + path.Replace('/', '-') + ".json"), answer);
                        }
                        catch { }
                    }
            }
            catch { }
            finally { busy = 0; }
        }
    }
}
