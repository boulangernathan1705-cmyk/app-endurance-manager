// Le mur des stands dans SimHub, en solo (plugin 2.6) : le dash « Endurance Manager · Mur » (Dashes.cs) montre notre
// voiture avec ce que le plugin lit sur ce PC, sans le site. Une fois par seconde en piste, la photo du jeu que le site
// recevrait (LiveShare.Local) passe par le salon refait ici (LocalRoom.cs, les règles de shared/live.mjs), et le dash en
// tire ses chiffres : classement de notre catégorie, piste à plat centrée sur notre voiture, relatif, pneus et dégâts,
// énergie et carburant, chrono, réglages, entrées. Rien n'est inventé : chaque case est une valeur du jeu ou un calcul
// simple dessus, vide quand elle manque.
//
// Module « Mur des stands » de l'écran du plugin (coupé par défaut). Partager sa voiture avec l'équipe, c'est le module
// « Mur des stands équipages » (LiveShare.cs) : les coéquipiers suivent sur le site.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // What the dash shows, made once per message from the room. Strings are ready to print; null shows nothing.
    public class WallView
    {
        public bool Live;
        public string Track, Session, TimeLeft, LapsLeft, Weather, TrackTemp, AirTemp, Driver, Car, Class, ClassColor, Place, Status = "";
        // Ready-made texts for the dash (its formulas only read properties): « P4 », « 4 », « Medium · 7 tours »,
        // « Relais : tour 7 », « Sec · piste 0 %  31° / 22° », « GAZ 100 % », « FREIN 0 % ».
        public string PlaceShort, PlaceNumber, TyreBand, StintText, Conditions, ThrottleText, BrakeText;
        // The class standings (our class only), up to Rows lines.
        public const int Rows = 12;
        public Row[] Standing = Enumerable.Range(0, Rows).Select(_ => new Row()).ToArray();
        // The flat track: every car on track, x from 0 to 1 with our car at 0.5.
        public const int Dots = 40;
        public Dot[] Track2 = Enumerable.Range(0, Dots).Select(_ => new Dot()).ToArray();
        public double? Sector1At, Sector2At, LineAt;
        // Relative: three ahead (1-3) and three behind (4-6) on track, whatever their class.
        public Row[] Relative = Enumerable.Range(0, 6).Select(_ => new Row()).ToArray();
        public Tyre[] Tyres = Enumerable.Range(0, 4).Select(_ => new Tyre()).ToArray();
        public int[] Dents = new int[8];
        public bool WingOff, DamageAlert;
        // Energy (VE, or fuel for a car without) and fuel.
        public string EnergyLabel, Energy, EnergyLast, EnergyAvg5, EnergyStint, EnergyLapsLeft, Fuel, FuelLast, FuelAvg5, FuelLapsLeft, Ratio;
        public double? EnergyFill;
        public bool EnergyAlert;
        // Pace: last, best, 5-lap average, delta to best, sectors (last and best), optimal and predicted.
        public string LastLap, BestLap, Avg5, Delta, DeltaColor, Optimal, Predicted, StintLaps, Stops;
        public string[] LastSectors = new string[3], BestSectors = new string[3];
        // Settings in the car.
        public string TC, TCCut, TCSlip, ABS, Map, Migration, Bias, Battery, Regen, Compound;
        // Inputs (0-100, steer -100 to 100), gear, km/h.
        public double Throttle, Brake, Steer;
        public string Gear, Speed;

        public class Row
        {
            public bool Visible, Us, Best, Down, Up;
            public string Pos, Num, Name, Car, Ahead, Leader, Last, BestLap, Stint, Tyres, Pit, PitColor, Gap, ClassColor;
        }

        public class Dot
        {
            public bool Visible, Us, Pit;
            public double X;
            public string Pos, Color;
        }

        public class Tyre
        {
            public string Left, In, Mid, Out, Tread, Carcass, Brake, Pressure, Wear5, Compound;
            public double? LeftValue;
            public bool Worn, VeryWorn, Flat;
        }
    }

    public class Wall
    {
        readonly Dictionary<string, JToken> feeds = new Dictionary<string, JToken>();
        readonly LocalRoom room = new LocalRoom();
        List<JToken> lastFrames;
        public volatile WallView View = new WallView();
        public string Status { get; private set; } = "Coupé";

        // The last error making the dash's view (shown by the tests; in SimHub the previous view stays).
        internal Exception LastError;

        // Once a second while driving: our own snapshot (LiveShare.Local) through the room made on this PC, and our car
        // now for the inputs ([metres, km/h, throttle %, brake %, steering %, gear]).
        public void Local(JObject snap, object[] frame)
        {
            try
            {
                var feed = room.Add(snap, Tape.NowMs);
                View = Make(new[] { feed }, frame == null ? null : new List<JToken> { JArray.FromObject(frame) });
                Status = "En piste";
                LastError = null;
            }
            catch (Exception e) { LastError = e; Status = "Erreur : " + e.Message; }
        }

        // Off the track: the dash says it is no longer live.
        public void Pause()
        {
            if (View.Live) { var view = View; view.Live = false; view.Status = "Pas en piste"; }
            Status = "Pas en piste";
        }

        public void Clear() { View = new WallView(); Status = "Coupé"; }

        // hello: every feed; feed: one complete; patch: what changed in one; fast: our car's last frames. The room's
        // messages as the site sends them to a page: kept for the tests (tests/Replay), which check the same wall made
        // both ways.
        // One message from the room applied to the feeds held and the dash's view; false when everything is needed again
        // (a patch for a feed not held). Also what the tests feed (tests/Replay).
        internal bool Hear(string text)
        {
            JObject message;
            try { message = JObject.Parse(text); } catch { return true; }
            string type = (string)message["type"];
            if (type == "hello")
            {
                feeds.Clear();
                foreach (var feed in message["feeds"] as JArray ?? new JArray()) if (feed["key"] != null) feeds[(string)feed["key"]] = feed;
            }
            else if (type == "feed" && message["feed"]?["key"] != null) feeds[(string)message["feed"]["key"]] = message["feed"];
            else if (type == "patch")
            {
                string key = (string)message["key"];
                // A patch for a feed not held: everything again.
                if (key == null || !feeds.TryGetValue(key, out var before)) return false;
                feeds[key] = Patch(before, message["patch"]);
            }
            else if (type != "fast") return true;
            if (message["tm"] is JArray frames && frames.Count > 0) lastFrames = frames.ToList();
            try { View = Make(feeds.Values, lastFrames); LastError = null; } catch (Exception e) { LastError = e; }
            return true;
        }

        const string Size = "\u0001n", Gone = "\u0001d", Whole = "\u0001w";

        // shared/live.mjs patch(), the same rules: arrays by index with their new size, objects by key with the keys gone.
        public static JToken Patch(JToken before, JToken change)
        {
            if (!(change is JObject obj)) return change?.DeepClone();
            if (obj.TryGetValue(Whole, out var whole)) return whole.DeepClone();
            if (before is JArray array)
            {
                int size = obj.TryGetValue(Size, out var n) ? (int)n : array.Count;
                var after = new JArray(array.Take(size).Select(t => t.DeepClone()));
                while (after.Count < size) after.Add(JValue.CreateNull());
                foreach (var p in obj.Properties()) if (p.Name != Size && int.TryParse(p.Name, out int k) && k >= 0 && k < after.Count) after[k] = Patch(array.Count > k ? array[k] : null, p.Value);
                return after;
            }
            if (before is JObject old)
            {
                var after = (JObject)old.DeepClone();
                if (obj[Gone] is JArray gone) foreach (var key in gone) after.Remove((string)key);
                foreach (var p in obj.Properties()) if (p.Name != Gone) after[p.Name] = Patch(old[p.Name], p.Value);
                return after;
            }
            return before;
        }

        // ---------- What the dash shows ----------

        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");
        static double? D(JToken t) => t != null && (t.Type == JTokenType.Float || t.Type == JTokenType.Integer) ? (double)t : (double?)null;
        static string S(JToken t) => t == null || t.Type == JTokenType.Null ? null : (string)t;
        static string N(double? value, int digits) => value.HasValue ? value.Value.ToString("F" + digits, Fr) : "—";
        // A figure with its unit, or only « — » when missing.
        static string U(double? value, int digits, string unit) => value.HasValue ? value.Value.ToString("F" + digits, Fr) + " " + unit : "—";
        static string Lap(double? seconds)
        {
            if (!seconds.HasValue || seconds <= 0) return "—";
            int minutes = (int)(seconds.Value / 60);
            return minutes > 0 ? minutes + ":" + (seconds.Value - minutes * 60).ToString("00.000", Fr) : seconds.Value.ToString("0.000", Fr);
        }
        static string Signed(double? value, int digits) => value.HasValue ? (value.Value > 0 ? "+" : value.Value < 0 ? "−" : "") + Math.Abs(value.Value).ToString("F" + digits, Fr) : "—";
        static string Clock(double seconds)
        {
            if (seconds < 0) seconds = 0;
            var t = TimeSpan.FromSeconds(seconds);
            return t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes}:{t.Seconds:00}";
        }

        public static string ClassColor(string cls)
        {
            string c = (cls ?? "").ToLowerInvariant();
            return c.Contains("hyper") ? "#FFFF3366" : c.Contains("lmp2") ? "#FF2F8CFF" : c.Contains("gt3") || c.Contains("lmgt3") ? "#FFFFAB00" : c.Contains("lmp3") ? "#FFB07AFF" : "#FFFFFFFF";
        }

        // A compound's letter as the site writes it (S M H W), from the game's name.
        static string Letter(string name)
        {
            if (string.IsNullOrEmpty(name)) return "";
            string n = name.ToLowerInvariant();
            return n.Contains("wet") || n.Contains("rain") ? "W" : n.Contains("soft") ? "S" : n.Contains("hard") ? "H" : n.Contains("med") ? "M" : name.Substring(0, 1).ToUpperInvariant();
        }

        internal static readonly string[] Field = { "id", "place", "cls", "driver", "vehicle", "num", "laps", "dist", "pit", "stops", "pen", "last", "best",
            "ls1", "ls2", "bs1", "bs2", "cs1", "cs2", "behind", "lapsBehind", "next", "lapsNext", "finish", "x", "z", "tank", "cmp", "dmg", "veLap",
            "wcmp", "pst", "flag", "yellow", "outLaps", "lane", "box" };
        static int F(string name) => Array.IndexOf(Field, name);
        static JToken V(JToken row, string name) { int k = F(name); return row is JArray a && k >= 0 && k < a.Count ? a[k] : null; }

        // The feed shown: the one of ours updated last (the car on track now).
        public static WallView Make(IEnumerable<JToken> feedList, List<JToken> lastFrames)
        {
            var feed = feedList.OrderByDescending(f => D(f["updated"]) ?? 0).FirstOrDefault();
            var v = new WallView();
            if (feed == null) { v.Status = "Personne de l'équipe en piste"; return v; }
            var snap = feed["snap"] as JObject;
            var me = snap?["me"] as JObject;
            var rows = (snap?["field"] as JArray)?.OfType<JArray>().ToList();
            if (snap == null || me == null || rows == null) return v;
            long now = Tape.NowMs;
            v.Live = now - (D(feed["updated"]) ?? 0) < 20000;
            v.Status = v.Live ? "" : "Plus de données depuis " + Clock((now - (D(feed["updated"]) ?? now)) / 1000.0);
            int myId = (int)(D(me["id"]) ?? -1);
            var mine = rows.FirstOrDefault(r => (int)(D(V(r, "id")) ?? -2) == myId);
            var cars = feed["cars"] as JObject ?? new JObject();
            var ours = feed["ours"] as JObject ?? new JObject();
            int session = (int)(D(snap["session"]) ?? 0);
            bool race = session >= 10 && session <= 13;
            double length = D(snap["length"]) ?? 0, et = D(snap["et"]) ?? 0;

            v.Track = S(snap["track"]);
            v.Session = race ? "Course" : session >= 5 && session <= 8 ? "Qualifications" : session == 9 ? "Warm-up" : "Essais";
            double? end = D(snap["end"]);
            v.TimeLeft = end.HasValue && end > et && end < 1e6 ? Clock(end.Value - et) : "—";
            v.Driver = S(me["driver"]); v.Car = S(me["vehicle"]); v.Class = S(me["cls"]); v.ClassColor = ClassColor(v.Class);
            double? rain = D(snap["rain"]), wet = D(snap["wet"]);
            v.Weather = (rain > 0.05 ? "Pluie " + U(rain * 100, 0, "%") : "Sec") + (wet.HasValue ? " · piste " + U(wet * 100, 0, "%") : "");
            v.TrackTemp = U(D(snap["trackTemp"]), 0, "°").Replace(" °", "°"); v.AirTemp = U(D(snap["air"]), 0, "°").Replace(" °", "°");

            // ----- Class standings -----
            var cls = rows.Where(r => S(V(r, "cls")) == v.Class).OrderBy(r => D(V(r, "place")) ?? 999).ToList();
            double classBest = cls.Select(r => D(V(r, "best")) ?? 0).Where(t => t > 0).DefaultIfEmpty(0).Min();
            int myClassPlace = cls.FindIndex(r => (int)(D(V(r, "id")) ?? -2) == myId) + 1;
            v.Place = myClassPlace > 0 ? "P" + myClassPlace + " / " + cls.Count : "—";
            int first = Math.Max(0, Math.Min(myClassPlace - 1 - WallView.Rows / 2, cls.Count - WallView.Rows));
            for (int i = 0; i < WallView.Rows; i++)
            {
                var row = v.Standing[i];
                int index = first + i;
                if (index >= cls.Count) continue;
                var car = cls[index];
                int id = (int)(D(V(car, "id")) ?? -2);
                var info = cars[id.ToString()] as JObject ?? new JObject();
                row.Visible = true; row.Us = id == myId; row.Pos = "P" + (index + 1); row.Num = "#" + S(V(car, "num"));
                row.Name = S(V(car, "driver")); row.Car = S(V(car, "vehicle"));
                if (index == 0) { row.Leader = race ? "Leader" : "—"; row.Ahead = "—"; }
                else if (race)
                {
                    row.Leader = D(info["leadLaps"]) is double ll && ll > 0 ? "+" + ll + " T" : D(info["lead"]) is double l ? "+" + N(l, 1) : "—";
                    row.Ahead = D(info["aheadLaps"]) is double al && al > 0 ? "+" + al + " T" : D(info["ahead"]) is double a ? "+" + N(a, 1) : "—";
                }
                else
                {
                    double? best = D(V(car, "best")), leaderBest = D(V(cls[0], "best")), aheadBest = D(V(cls[index - 1], "best"));
                    row.Leader = best > 0 && leaderBest > 0 ? Signed(best - leaderBest, 3) : "—";
                    row.Ahead = best > 0 && aheadBest > 0 ? Signed(best - aheadBest, 3) : "—";
                }
                row.Last = Lap(D(V(car, "last")));
                double? b = D(V(car, "best"));
                row.BestLap = Lap(b); row.Best = b > 0 && Math.Abs(b.Value - classBest) < 0.0005;
                row.Stint = D(info["sinceStop"]) is double since ? since.ToString(Fr) : "—";
                string cmp = S(V(car, "cmp")) ?? (row.Us ? S(me["compound"]) : null);
                if (cmp != null)
                {
                    var parts = cmp.Split('/');
                    string front = Letter(parts[0].Trim()), rear = Letter(parts.Length > 1 ? parts[1].Trim() : parts[0].Trim());
                    row.Tyres = front + front + rear + rear;
                }
                row.Pit = PitText(car, out row.PitColor);
                row.ClassColor = ClassColor(v.Class);
            }

            // ----- Flat track: our car in the middle, the others where they are around it -----
            double myFrac = mine != null && length > 0 ? ((D(V(mine, "dist")) ?? 0) / length % 1 + 1) % 1 : 0;
            double Centre(double fraction) => ((fraction - myFrac + 0.5) % 1 + 1) % 1;
            var shown = rows.Where(r => (D(V(r, "pit")) ?? 0) != 2 && (D(V(r, "finish")) ?? 0) == 0).Take(WallView.Dots).ToList();
            for (int i = 0; i < shown.Count; i++)
            {
                var car = shown[i];
                int id = (int)(D(V(car, "id")) ?? -2);
                string carClass = S(V(car, "cls"));
                var order = rows.Where(r => S(V(r, "cls")) == carClass).OrderBy(r => D(V(r, "place")) ?? 999).ToList();
                var dot = v.Track2[i];
                dot.Visible = length > 0; dot.Us = id == myId; dot.Pit = (D(V(car, "pit")) ?? 0) == 1;
                dot.X = Math.Round(Centre(((D(V(car, "dist")) ?? 0) / length % 1 + 1) % 1), 4);
                dot.Pos = (order.FindIndex(r => (int)(D(V(r, "id")) ?? -2) == id) + 1).ToString();
                dot.Color = ClassColor(carClass);
            }
            // The line and the sector ends move along the bar (the game's sector ends, from our best lap's sectors).
            if (length > 0)
            {
                v.LineAt = Math.Round(Centre(0), 4);
                var profile = me["profile"] as JArray;
                double? bs1 = D(V(mine, "bs1")), bs2 = D(V(mine, "bs2")), best = D(V(mine, "best"));
                if (profile != null && profile.Count == 101 && bs1 > 0 && bs2 > bs1 && best > bs2)
                {
                    v.Sector1At = Math.Round(Centre(FractionAt(profile, bs1.Value / best.Value * D(profile[100]).Value)), 4);
                    v.Sector2At = Math.Round(Centre(FractionAt(profile, bs2.Value / best.Value * D(profile[100]).Value)), 4);
                }
            }

            // ----- Relative: seconds on track at our pace, three ahead and three behind -----
            double? pace = D(ours["avg5"]) ?? D(V(mine, "last")) ?? D(V(mine, "best"));
            var prof = me["profile"] as JArray;
            if (pace > 0 && length > 0 && prof != null && prof.Count == 101 && mine != null)
            {
                double lap = pace.Value;
                double At(JArray car) => TimeAt(prof, (((D(V(car, "dist")) ?? 0) / length) % 1 + 1) % 1, lap);
                double Run(JArray car) => (D(V(car, "laps")) ?? 0) + Math.Max(0, D(V(car, "dist")) ?? 0) / length;
                double mineAt = At(mine);
                var list = rows.Where(r => (D(V(r, "pit")) ?? 0) != 2 && (int)(D(V(r, "id")) ?? -2) != myId).Select(r =>
                {
                    double gap = At(r) - mineAt;
                    gap = ((gap % lap) + lap * 1.5) % lap - lap / 2;
                    return (row: r, gap, laps: (int)Math.Round(Run(r) - Run(mine) - gap / lap));
                }).ToList();
                var ahead = list.Where(x => x.gap > 0).OrderBy(x => x.gap).Take(3).ToList();
                var behind = list.Where(x => x.gap <= 0).OrderByDescending(x => x.gap).Take(3).ToList();
                for (int i = 0; i < 3; i++)
                {
                    if (i < ahead.Count) FillRelative(v.Relative[2 - i], ahead[i], rows);
                    if (i < behind.Count) FillRelative(v.Relative[3 + i], behind[i], rows);
                }
            }

            // ----- Tyres and damage -----
            var wheels = me["wheels"] as JArray;
            var wear5 = ours["wear5"] as JArray;
            string[] compounds = (S(me["compound"]) ?? "").Split('/').Select(x => x.Trim()).ToArray();
            for (int i = 0; i < 4; i++)
            {
                var w = wheels?[i] as JObject;
                var t = v.Tyres[i];
                if (w == null) continue;
                double? left = D(w["left"]);
                t.LeftValue = left; t.Left = U(left, 0, "%"); t.Worn = left < 30; t.VeryWorn = left < 15;
                var tread = w["tread"] as JArray;
                t.In = N(D(tread?[0]), 0); t.Mid = N(D(tread?[1]), 0); t.Out = N(D(tread?[2]), 0);
                t.Carcass = U(D(w["carcass"]), 0, "°").Replace(" °", "°"); t.Brake = U(D(w["brake"]), 0, "°").Replace(" °", "°"); t.Pressure = U(D(w["kpa"]), 0, "kPa");
                t.Tread = t.In + "  " + t.Mid + "  " + t.Out;
                t.Wear5 = D(wear5?[i]) is double per ? U(per, 2, "%") : "—";
                t.Flat = w["flat"]?.Type == JTokenType.Boolean && (bool)w["flat"];
                t.Compound = Letter(compounds.Length > 1 && i >= 2 ? compounds[1] : compounds[0]);
            }
            if (me["dents"] is JArray dents && dents.Count == 8) for (int i = 0; i < 8; i++) v.Dents[i] = (int)(D(dents[i]) ?? 0);
            v.WingOff = me["detached"]?.Type == JTokenType.Boolean && (bool)me["detached"];
            v.DamageAlert = v.Dents.Any(x => x > 0) || v.WingOff || v.Tyres.Any(t => t.Flat);

            // ----- Energy and fuel -----
            double? ve = D(me["ve"]), fuel = D(me["fuel"]);
            double? ve5 = D(ours["ve5"]), fuel5 = D(ours["fuel5"]);
            v.EnergyLabel = ve.HasValue ? "ÉNERGIE VIRTUELLE" : "CARBURANT";
            v.Energy = ve.HasValue ? U(ve, 1, "%") : U(fuel, 1, "L");
            v.EnergyFill = ve.HasValue ? ve / 100 : fuel.HasValue && D(me["capacity"]) > 0 ? fuel / D(me["capacity"]) : null;
            v.EnergyLast = ve.HasValue ? U(D(ours["lastVe"]), 2, "%") : U(D(ours["lastFuel"]), 2, "L");
            v.EnergyAvg5 = ve.HasValue ? U(ve5, 2, "%") : U(fuel5, 2, "L");
            v.EnergyStint = ve.HasValue ? U(D(ours["stintVe"]), 2, "%") : U(D(ours["stintFuel"]), 2, "L");
            double? lapsLeft = ve.HasValue && ve5 > 0 ? ve / ve5 : !ve.HasValue && fuel5 > 0 ? fuel / fuel5 : null;
            v.EnergyLapsLeft = N(lapsLeft, 1);
            v.EnergyAlert = lapsLeft.HasValue && lapsLeft < 2;
            v.Fuel = U(fuel, 1, "L"); v.FuelLast = U(D(ours["lastFuel"]), 2, "L"); v.FuelAvg5 = U(fuel5, 2, "L");
            v.FuelLapsLeft = N(fuel5 > 0 ? fuel / fuel5 : null, 1);
            v.Ratio = ve5 > 0 && fuel5 > 0 ? N(fuel5 / ve5, 3) : "—";

            // ----- Pace -----
            v.LastLap = Lap(D(V(mine, "last"))); v.BestLap = Lap(D(V(mine, "best"))); v.Avg5 = Lap(D(ours["avg5"]));
            double? delta = D(me["delta"]);
            v.Delta = Signed(delta, 2); v.DeltaColor = delta < 0 ? "#FF00E676" : delta > 0 ? "#FFFF5252" : "#FFFFFFFF";
            v.Optimal = Lap(D(me["optimal"])); v.Predicted = Lap(D(me["predicted"]));
            var lastSectors = cars[myId.ToString()]?["lastSectors"] as JArray;
            var bestSectors = ours["bestSectors"] as JArray;
            for (int k = 0; k < 3; k++) { v.LastSectors[k] = N(D(lastSectors?[k]), 3); v.BestSectors[k] = N(D(bestSectors?[k]), 3); }
            v.StintLaps = D(cars[myId.ToString()]?["sinceStop"]) is double st ? st.ToString(Fr) : "—";
            v.Stops = N(D(V(mine, "stops")), 0);
            double? lapsToGo = race && mine != null ? LapsLeft(snap, rows, mine, pace) : null;
            v.LapsLeft = N(lapsToGo, 1);

            // ----- Settings -----
            var control = me["control"] as JObject;
            v.TC = N(D(control?["tc"]), 0); v.TCCut = N(D(control?["cut"]), 0); v.TCSlip = N(D(control?["slip"]), 0); v.ABS = N(D(control?["abs"]), 0);
            v.Map = N(D(control?["map"]), 0); v.Migration = N(D(control?["mig"]), 0); v.Bias = N(D(control?["bias"]), 1);
            v.Battery = D(me["battery"]) is double bat ? U(bat, 0, "%") : "—"; v.Regen = N(D(me["regen"]), 0);
            v.Compound = S(me["compound"]);
            v.PlaceShort = myClassPlace > 0 ? "P" + myClassPlace : "—"; v.PlaceNumber = myClassPlace > 0 ? myClassPlace.ToString() : "";
            v.TyreBand = (v.Compound ?? "—") + " · " + v.StintLaps + " tours"; v.StintText = "Relais : tour " + v.StintLaps;
            v.Conditions = v.Weather + "  " + v.TrackTemp + " / " + v.AirTemp;

            // ----- Inputs (the last frame: dist, km/h, throttle, brake, steer, gear) -----
            var frame = lastFrames?.LastOrDefault() as JArray;
            if (frame != null && frame.Count >= 6)
            {
                v.Speed = N(D(frame[1]), 0); v.Throttle = D(frame[2]) ?? 0; v.Brake = D(frame[3]) ?? 0; v.Steer = D(frame[4]) ?? 0;
                int gear = (int)(D(frame[5]) ?? 0);
                v.Gear = gear < 0 ? "R" : gear == 0 ? "N" : gear.ToString();
                v.ThrottleText = "GAZ " + N(v.Throttle, 0) + " %"; v.BrakeText = "FREIN " + N(v.Brake, 0) + " %";
            }
            return v;
        }

        static string PitText(JArray car, out string color)
        {
            color = "#FFFFAB00";
            if ((D(V(car, "pit")) ?? 0) == 2) return "GARAGE";
            if ((D(V(car, "pit")) ?? 0) == 1) return "AUX STANDS";
            double? outLaps = D(V(car, "outLaps"));
            if (outLaps.HasValue && outLaps < 3) { color = "#FF00E5FF"; return "SORTIE " + (outLaps + 1) + "/3"; }
            color = "#FFFFFFFF";
            return "";
        }

        static void FillRelative(WallView.Row row, (JArray row, double gap, int laps) item, List<JArray> rows)
        {
            var car = item.row;
            string cls = S(V(car, "cls"));
            var order = rows.Where(r => S(V(r, "cls")) == cls).OrderBy(r => D(V(r, "place")) ?? 999).ToList();
            row.Visible = true; row.Num = "#" + S(V(car, "num")); row.Name = S(V(car, "driver")); row.Car = S(V(car, "vehicle"));
            row.Pos = "P" + (order.IndexOf(car) + 1); row.ClassColor = ClassColor(cls);
            row.Gap = Signed(item.gap, 1); row.Down = item.laps < 0; row.Up = item.laps > 0;
            row.Pit = (D(V(car, "pit")) ?? 0) == 1 ? "STANDS" : "";
        }

        // Seconds from the line at a fraction of the lap on our profile, scaled to `lap`.
        static double TimeAt(JArray profile, double fraction, double lap)
        {
            double x = Math.Max(0, Math.Min(0.99999, fraction)) * 100;
            int k = (int)x;
            double a = D(profile[k]) ?? 0, b = D(profile[k + 1]) ?? a, total = D(profile[100]) ?? 1;
            return (a + (b - a) * (x - k)) / total * lap;
        }

        // The fraction of the lap where the profile reaches `seconds`.
        static double FractionAt(JArray profile, double seconds)
        {
            for (int k = 0; k < 100; k++)
            {
                double a = D(profile[k]) ?? 0, b = D(profile[k + 1]) ?? a;
                if (seconds <= b) return (k + (b > a ? (seconds - a) / (b - a) : 0)) / 100;
            }
            return 1;
        }

        // shared/live.mjs lapsLeft: laps to the flag at our pace.
        static double? LapsLeft(JObject snap, List<JArray> rows, JArray mine, double? lap)
        {
            double maxLaps = D(snap["maxLaps"]) ?? 0;
            if (maxLaps > 0 && maxLaps < 10000) return Math.Max(0, maxLaps - rows.Max(r => D(V(r, "laps")) ?? 0));
            double? end = D(snap["end"]), et = D(snap["et"]), length = D(snap["length"]);
            if (!end.HasValue || !lap.HasValue || lap <= 0 || !et.HasValue) return null;
            double left = end.Value - et.Value, rest = 1 - (length > 0 ? Math.Min(1, (D(V(mine, "dist")) ?? 0) / length.Value) : 0);
            if (left <= 0) return Math.Round(rest, 1);
            return Math.Round(rest + Math.Ceiling(Math.Max(0, left - rest * lap.Value) / lap.Value), 1);
        }
    }
}
