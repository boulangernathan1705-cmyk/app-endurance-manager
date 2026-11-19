// Mur des stands en solo : le salon de l'équipe refait sur le PC du pilote, pour le dash « Endurance Manager · Mur »
// sans le site. Les mêmes règles que shared/live.mjs (ingest : tours et arrêts de chaque voiture, nos tours, relais ;
// raceGaps : écarts mesurés sur la piste ; publicFeed : moyennes sur 5 tours), sur la photo du jeu que le plugin
// enverrait au site (LiveShare.Local). Seulement ce que le dash lit : rien n'est envoyé, rien n'est gardé sur le disque.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class LocalRoom
    {
        const int RivalLaps = 8, OurLaps = 500, TrailKept = 400;

        class Lap { public int N; public double? T; public double[] S; public bool Pit; public double? Ve, Fuel; public double?[] Wear; }
        class Car
        {
            public List<Lap> Laps = new List<Lap>();
            public double? PitIn, Stop, LapTank;
            public int? StopLap;
            public bool LapPit;
            public double?[] Best = new double?[3];
            public List<(double Et, double D)> Trail = new List<(double, double)>();
            public int Back;
        }
        class Start { public int Laps; public double? Ve, Fuel; public double?[] Wheels; public bool Pit; }
        class Stint { public string Driver; public int From, Laps; }

        string key;
        long updated;
        JObject before;
        Dictionary<int, Car> cars = new Dictionary<int, Car>();
        List<Lap> ours = new List<Lap>();
        List<Stint> stints = new List<Stint>();
        Start start;

        static double? D(JToken t) => t != null && (t.Type == JTokenType.Float || t.Type == JTokenType.Integer) ? (double)t : (double?)null;
        static string S(JToken t) => t == null || t.Type == JTokenType.Null ? null : (string)t;
        static int I(JToken row, string name) => (int)(D(V(row, name)) ?? 0);
        static JToken V(JToken row, string name) { int k = Array.IndexOf(Wall.Field, name); return row is JArray a && k >= 0 && k < a.Count ? a[k] : null; }
        static double? Time(double? value) => value > 0 && value < 3600 ? value : null;
        static double? Round(double? value, int digits = 3) => value.HasValue && !double.IsNaN(value.Value) && !double.IsInfinity(value.Value) ? Math.Round(value.Value, digits, MidpointRounding.AwayFromZero) : (double?)null;
        static double? Mean(IEnumerable<double> list) { var l = list.ToList(); return l.Count > 0 ? l.Average() : (double?)null; }
        static double? Spread(List<double> list)
        {
            if (list.Count < 2) return null;
            double m = list.Average();
            return Math.Sqrt(list.Sum(x => (x - m) * (x - m)) / (list.Count - 1));
        }
        static double[] SectorsOf(JToken car)
        {
            double? s1 = Time(D(V(car, "ls1"))), s12 = Time(D(V(car, "ls2"))), t = Time(D(V(car, "last")));
            return s1.HasValue && s12 > s1 && t > s12 ? new[] { Round(s1).Value, Round(s12 - s1).Value, Round(t - s12).Value } : null;
        }
        static double?[] WheelsLeft(JObject me) => Enumerable.Range(0, 4).Select(i => D((me["wheels"] as JArray)?[i]?[0])).ToArray();

        // The game's clock went back, ran ahead of the real one or the planned end changed: another session (live.mjs otherSession).
        bool OtherSession(JObject snap, long at)
        {
            if (before == null) return false;
            double et = D(snap["et"]) ?? 0, was = D(before["et"]) ?? 0;
            double? end = D(snap["end"]), wasEnd = D(before["end"]);
            return et + 5 < was || et - was > (at - updated) / 1000.0 + 60 || (end.HasValue && wasEnd.HasValue && Math.Abs(end.Value - wasEnd.Value) > 1);
        }

        // One snapshot (the plugin's own, LiveShare.Local) into the history; the feed as the wall reads it (Wall.Make).
        public JObject Add(JObject snap, long at)
        {
            var me = (JObject)snap["me"];
            var field = (snap["field"] as JArray)?.OfType<JArray>().ToList() ?? new List<JArray>();
            int myId = (int)(D(me["id"]) ?? -1);
            string k = S(snap["track"]) + "|" + D(snap["session"]) + "|" + (S(me["vehicle"]) ?? myId.ToString());
            if (k != key || OtherSession(snap, at))
            {
                key = k; before = null; cars.Clear(); ours.Clear(); stints.Clear(); start = null;
            }
            double et = D(snap["et"]) ?? 0;
            updated = at;
            var old = (before?["field"] as JArray)?.OfType<JArray>().ToDictionary(r => I(r, "id")) ?? new Dictionary<int, JArray>();
            foreach (var car in field)
            {
                int id = I(car, "id");
                if (!cars.TryGetValue(id, out var state)) cars[id] = state = new Car();
                old.TryGetValue(id, out var was);
                int pit = I(car, "pit"), laps = I(car, "laps");
                if (pit != 0) state.LapPit = true;
                if (was != null && laps > I(was, "laps"))
                {
                    double? t = Time(D(V(car, "last"))), veLap = D(V(car, "veLap")), tank = D(V(car, "tank"));
                    var sectors = SectorsOf(car);
                    double? used = state.LapPit ? null : veLap > 0 ? Round(veLap, 2) : state.LapTank.HasValue && tank > 0 && state.LapTank - tank > 0 ? Round(state.LapTank - tank, 2) : null;
                    if (t.HasValue && laps - I(was, "laps") == 1)
                    {
                        state.Laps.Add(new Lap { N = laps, T = Round(t), S = sectors, Pit = state.LapPit, Ve = used });
                        if (state.Laps.Count > RivalLaps) state.Laps.RemoveAt(0);
                        if (sectors != null && !state.LapPit) for (int i = 0; i < 3; i++) if (state.Best[i] == null || sectors[i] < state.Best[i]) state.Best[i] = sectors[i];
                    }
                    state.LapPit = pit != 0;
                    state.LapTank = tank > 0 ? tank : null;
                }
                if (was != null && I(was, "pit") == 0 && pit == 1) state.PitIn = et;
                if (was != null && I(was, "pit") != 0 && pit == 0)
                {
                    if (state.PitIn.HasValue && et - state.PitIn < 900) state.Stop = Round(et - state.PitIn, 1);
                    state.PitIn = null;
                    state.StopLap = laps;
                }
            }
            var mine = field.FirstOrDefault(r => I(r, "id") == myId);
            JArray meBefore = null;
            old.TryGetValue(myId, out meBefore);
            if (mine != null)
            {
                int myLaps = I(mine, "laps");
                bool inPit = (D(me["pit"]) ?? 0) != 0;
                if (start == null) start = new Start { Laps = myLaps, Ve = D(me["ve"]), Fuel = D(me["fuel"]), Wheels = WheelsLeft(me) };
                if (inPit) start.Pit = true;
                if (meBefore != null && myLaps > I(meBefore, "laps"))
                {
                    int done = myLaps - I(meBefore, "laps");
                    bool clean = done == 1 && !start.Pit;
                    double? Used(double? from, double? to) => clean && from.HasValue && to.HasValue && from - to > 0 ? Round(from - to) : null;
                    var wheels = WheelsLeft(me);
                    ours.Add(new Lap { N = myLaps, T = done == 1 ? Round(Time(D(V(mine, "last")))) : null, S = done == 1 ? SectorsOf(mine) : null, Pit = start.Pit,
                        Ve = Used(start.Ve, D(me["ve"])), Fuel = Used(start.Fuel, D(me["fuel"])), Wear = Enumerable.Range(0, 4).Select(i => Used(start.Wheels[i], wheels[i])).ToArray() });
                    if (ours.Count > OurLaps) ours.RemoveAt(0);
                    if (stints.Count > 0) stints[stints.Count - 1].Laps += done;
                    start = new Start { Laps = myLaps, Ve = D(me["ve"]), Fuel = D(me["fuel"]), Wheels = wheels, Pit = inPit };
                }
                string driver = S(me["driver"]);
                var stint = stints.LastOrDefault();
                bool leftPits = meBefore != null && I(meBefore, "pit") != 0 && I(mine, "pit") == 0;
                if (stint == null || leftPits || (!string.IsNullOrEmpty(driver) && stint.Driver != driver)) stints.Add(new Stint { Driver = driver, From = myLaps });
            }
            before = snap;
            return Public(snap, field, mine, at);
        }

        // live.mjs raceGaps: each car's gap to its class leader and to the car ahead in its class, measured on track.
        Dictionary<int, JObject> Gaps(JObject snap, List<JArray> field)
        {
            var gaps = new Dictionary<int, JObject>();
            double length = D(snap["length"]) ?? 0, et = D(snap["et"]) ?? 0;
            if (!(length > 0)) return gaps;
            double Run(JArray car) => I(car, "laps") * length + Math.Max(0, D(V(car, "dist")) ?? 0);
            foreach (var car in field)
            {
                var state = cars[I(car, "id")];
                var trail = state.Trail;
                if (trail.Count > 0 && et - trail[trail.Count - 1].Et > 5) trail.Clear();
                double d = Run(car);
                if (trail.Count > 0 && et <= trail[trail.Count - 1].Et) continue;
                if (trail.Count > 0 && d < trail[trail.Count - 1].D - 50)
                {
                    if (++state.Back < 5) continue;
                    trail.Clear();
                }
                state.Back = 0;
                trail.Add((et, Math.Max(d, trail.Count > 0 ? trail[trail.Count - 1].D : d)));
                if (trail.Count > TrailKept) trail.RemoveAt(0);
            }
            int session = (int)(D(snap["session"]) ?? 0);
            if (session < 10 || session > 13) return gaps;
            var sorted = field.OrderBy(r => D(V(r, "place")) ?? 999).ToList();
            double? Pace(JArray car)
            {
                var five = cars[I(car, "id")].Laps.Where(l => l.T.HasValue && !l.Pit).Select(l => l.T.Value).Last5().ToList();
                return five.Count >= 3 ? five.Average() : Time(D(V(car, "last"))) ?? Time(D(V(car, "best")));
            }
            void Put(JObject into, JArray car, JArray reference, string name)
            {
                double mine = Run(car), theirs = Run(reference), apart = theirs - mine;
                if (apart <= 0) { into[name] = 0; return; }
                if (apart >= length) { into[name + "Laps"] = Math.Floor(apart / length); return; }
                var trail = cars[I(reference, "id")].Trail;
                int next = trail.FindIndex(p => p.D >= mine);
                if (next > 0)
                {
                    var a = trail[next - 1]; var b = trail[next];
                    double when = b.D > a.D ? a.Et + (b.Et - a.Et) * (mine - a.D) / (b.D - a.D) : b.Et;
                    into[name] = Round(Math.Max(0, et - when), 1);
                }
                else if (Pace(car) is double pace && pace > 0) into[name] = Round(apart / length * pace, 1);
            }
            foreach (var cls in sorted.Select(r => S(V(r, "cls"))).Distinct())
            {
                var list = sorted.Where(r => S(V(r, "cls")) == cls).ToList();
                for (int i = 1; i < list.Count; i++)
                {
                    var gap = new JObject();
                    Put(gap, list[i], list[0], "lead");
                    Put(gap, list[i], list[i - 1], "ahead");
                    gaps[I(list[i], "id")] = gap;
                }
            }
            return gaps;
        }

        // live.mjs publicFeed, the parts the wall reads.
        JObject Public(JObject snap, List<JArray> field, JArray mine, long at)
        {
            var gaps = Gaps(snap, field);
            var carsOut = new JObject();
            foreach (var car in field)
            {
                int id = I(car, "id");
                var state = cars[id];
                var five = state.Laps.Where(l => l.T.HasValue && !l.Pit).Select(l => l.T.Value).Last5().ToList();
                var info = new JObject
                {
                    ["avg5"] = Round(five.Count >= 2 ? five.Average() : (double?)null), ["sd5"] = Round(Spread(five)), ["stop"] = state.Stop,
                    ["sinceStop"] = state.StopLap.HasValue ? I(car, "laps") - state.StopLap.Value : I(car, "stops") != 0 ? (int?)null : I(car, "laps"),
                    ["lastSectors"] = SectorsOf(car) is double[] s ? JArray.FromObject(s) : null,
                    ["best"] = JArray.FromObject(state.Best)
                };
                if (gaps.TryGetValue(id, out var gap)) info.Merge(gap);
                carsOut[id.ToString()] = info;
            }
            var clean = ours.Where(l => l.T.HasValue && !l.Pit).ToList();
            var lastFive = clean.Last5().ToList();
            var recent = ours.Last5().ToList();
            var stint = stints.LastOrDefault();
            var stintLaps = stint == null ? new List<Lap>() : ours.Where(l => l.N > stint.From).ToList();
            double? Avg(IEnumerable<Lap> list, Func<Lap, double?> pick) => Round(Mean(list.Select(pick).Where(x => x > 0).Select(x => x.Value)));
            var oursOut = new JObject
            {
                ["avg5"] = Avg(lastFive, l => l.T), ["sd5"] = Round(Spread(lastFive.Select(l => l.T.Value).ToList())),
                ["ve5"] = Avg(recent, l => l.Ve), ["fuel5"] = Avg(recent, l => l.Fuel),
                ["wear5"] = JArray.FromObject(Enumerable.Range(0, 4).Select(i => Avg(recent, l => l.Wear?[i])).ToArray()),
                ["lastVe"] = ours.LastOrDefault()?.Ve, ["lastFuel"] = ours.LastOrDefault()?.Fuel,
                ["stintVe"] = Avg(stintLaps, l => l.Ve), ["stintFuel"] = Avg(stintLaps, l => l.Fuel),
                ["stintAvg"] = Avg(stintLaps.Where(l => l.T.HasValue && !l.Pit), l => l.T),
                ["bestSectors"] = JArray.FromObject(Enumerable.Range(0, 3).Select(i => { var v = clean.Where(l => l.S != null).Select(l => l.S[i]).ToList(); return v.Count > 0 ? v.Min() : (double?)null; }).ToArray())
            };
            // The wheels as the room cleans them (live.mjs cleanWheel): what the wall reads by name.
            var me = (JObject)snap["me"].DeepClone();
            if (me["wheels"] is JArray wheels)
                me["wheels"] = new JArray(wheels.Select(w => w is JArray a ? (JToken)new JObject
                {
                    ["left"] = a.ElementAtOrDefault(0), ["carcass"] = a.ElementAtOrDefault(1), ["kpa"] = a.ElementAtOrDefault(2), ["brake"] = a.ElementAtOrDefault(3),
                    ["tread"] = a.ElementAtOrDefault(4), ["inner"] = a.ElementAtOrDefault(5), ["optimal"] = a.ElementAtOrDefault(6),
                    ["flat"] = a.ElementAtOrDefault(9)?.Type == JTokenType.Boolean && (bool)a[9], ["off"] = a.ElementAtOrDefault(10)?.Type == JTokenType.Boolean && (bool)a[10]
                } : w));
            var snapOut = (JObject)snap.DeepClone();
            snapOut["me"] = me;
            // The room sends each car's distance to the metre (publicFeed): the same here, so the dots sit at the same place.
            int dist = Array.IndexOf(Wall.Field, "dist");
            foreach (var row in (snapOut["field"] as JArray)?.OfType<JArray>() ?? Enumerable.Empty<JArray>())
                if (row.Count > dist && D(row[dist]) is double d) row[dist] = Math.Round(d, MidpointRounding.AwayFromZero);
            return new JObject { ["key"] = key, ["updated"] = at, ["snap"] = snapOut, ["cars"] = carsOut, ["ours"] = oursOut };
        }
    }

    static class LastExtension
    {
        // The last five of a list (Enumerable.TakeLast is not in .NET Framework 4.8).
        public static List<T> Last5<T>(this IEnumerable<T> list) { var all = list.ToList(); return all.Skip(Math.Max(0, all.Count - 5)).ToList(); }
    }
}
