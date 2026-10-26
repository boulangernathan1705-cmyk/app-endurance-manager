// Overlay des essais et de la course : le dernier tour du pilote (temps, énergie ou carburant, usure moyenne des quatre
// pneus) face à ce qu'il vise, et sous chaque chiffre « Moi · Équipe · Meilleur » (moyennes de tous les tours comptés).
// Les chiffres de l'équipe viennent de la fiche combo du site (GET /api/combos/plugin/sheet, server/combos.mjs), relue
// au début de chaque séance puis toutes les 3 minutes (le site la garde en cache) ; ceux de la séance en cours sont
// comptés ici, tour par tour, avec les règles de la fiche (shared/combos.mjs). Des chiffres bruts, aucun conseil.
// Le plugin ne dessine rien : il publie ces chiffres en propriétés SimHub (Plugin.cs), que les overlays de Dash Studio
// affichent (Dashes.cs).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // One pilot of the team on this combo, in one track condition: his counted laps and their averages (seconds,
    // percent of energy, litres, percent of tyre per lap).
    public class Mate
    {
        public string Id, Name, Color;
        public bool Me;
        public int Laps;
        public double? Avg, Best, Ve, Fuel, Wear;
    }

    // What the overlays show, built once a second on the reading thread and published whole. Colours are #AARRGGBB, as
    // Dash Studio reads them.
    public class PracticeView
    {
        public class Block
        {
            public string Title, Value = "—", Delta = "", DeltaColor = Practice.White, Target = "";
            // Moi · Équipe · Meilleur: « Moi 3:29,536 », « Équipe 3:28,856 », « McFly 3:28,705 » (empty when I am the best).
            public string Me = "Moi —", MeColor = Practice.White, Team = "Équipe —", Best = "";
            public double? Number, TargetNumber;
        }
        public string Color = Practice.Argb(Practice.Colors[0]);
        public bool NotCounted;
        public Block Lap = new Block { Title = "DERNIER TOUR" }, Energy = new Block { Title = "ÉNERGIE DU TOUR" }, Wear = new Block { Title = "USURE DU TOUR (4 PNEUS)" };
    }

    public class Practice
    {
        // The site's colours (shared/combos.mjs, COLORS) without the violet, which marks the best on the fiches: a pilot who
        // has not chosen gets one by his place on the sheet.
        public static readonly string[] Colors = { "#ff9a3d", "#45d4d0", "#ff6ad5", "#f2e35c", "#ff5d5d", "#9be15d", "#c9a27a", "#8fa8ff", "#e0e0e0" };
        public const string Violet = "#FFC084FC", White = "#FFFFFFFF", Amber = "#FFF2A64E", Blue = "#FF6FB6FF";
        const string OldViolet = "#b98cff";
        // The fiche's rules (shared/combos.mjs): conditions, clean ratio, shortest stint.
        const double DampFrom = 0.1, RainFrom = 0.5, CleanRatio = 1.07;
        const int StintMin = 3;
        static readonly CultureInfo French = CultureInfo.GetCultureInfo("fr-FR");

        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        // The team's sheet for the combo being driven: per condition, every pilot.
        volatile Dictionary<string, List<Mate>> team;
        string teamFor, wanted;
        DateTime fetchAt;
        int fetching;
        string energyCar;
        bool hasEnergy;

        // The latest figures, kept when the car stops so a dashboard still shows them.
        public volatile PracticeView View = new PracticeView();
        // On track out of the garage, in practice (and warm-up) or in a race: the overlays show then.
        public volatile bool OnTrack, InPractice, InRace;

        public static string Condition(double rain, double wet)
        {
            double level = Math.Max(rain, wet >= 0 && wet <= 1 ? wet : 0);
            return level >= RainFrom ? "rain" : level >= DampFrom ? "damp" : "dry";
        }

        // #rrggbb from the site → #FFRRGGBB for Dash Studio.
        public static string Argb(string color) => "#FF" + color.TrimStart('#').ToUpperInvariant();

        public void Hide() { OnTrack = false; InPractice = false; InRace = false; }

        // Once a second while the pilot drives, whatever the session (rF2 sessions: 0 to 4 practice, 9 warm-up, 10 to 13 race).
        public void Update(Sample s, LiveSession session, LinkCode code, int stint)
        {
            Fetch(code, s.Track, s.Car, session?.At ?? 0);
            if (energyCar != s.Car) { energyCar = s.Car; hasEnergy = false; }
            if (s.Energy > 0.01) hasEnergy = true;
            View = Build(s, session, Math.Max(1, stint));
            OnTrack = !s.Garage;
            InPractice = OnTrack && (s.Session <= 4 || s.Session == 9);
            InRace = OnTrack && s.Session >= 10 && s.Session <= 13;
        }

        // The sheet again at the start of each session, then every 3 minutes, one read at a time.
        void Fetch(LinkCode code, string track, string car, long at)
        {
            if (code == null) return;
            string key = track + "\n" + car;
            string run = key + "\n" + at;
            if (key != teamFor) team = null;
            if ((run == wanted && DateTime.Now < fetchAt) || Interlocked.Exchange(ref fetching, 1) == 1) return;
            wanted = run;
            fetchAt = DateTime.Now.AddMinutes(3);
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    string url = $"{code.Origin}/api/combos/plugin/sheet?track={Uri.EscapeDataString(track)}&car={Uri.EscapeDataString(car)}";
                    var request = new HttpRequestMessage(HttpMethod.Get, url);
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", code.Token);
                    using (var response = client.SendAsync(request).GetAwaiter().GetResult())
                    {
                        if (!response.IsSuccessStatusCode) { fetchAt = DateTime.Now.AddSeconds(30); return; }
                        team = Parse(JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult()));
                        teamFor = key;
                    }
                }
                // No network: tried again in 30 s, the overlays show the session's own laps meanwhile.
                catch { fetchAt = DateTime.Now.AddSeconds(30); }
                finally { fetching = 0; }
            });
        }

        static double? Num(JToken token) => token == null || token.Type == JTokenType.Null ? (double?)null : (double)token;

        static Dictionary<string, List<Mate>> Parse(JObject sheet)
        {
            var people = new Dictionary<string, Mate>();
            int place = 0;
            foreach (var row in sheet["drivers"] ?? new JArray())
            {
                // The old violet is no longer offered: it counts as no colour chosen.
                string color = (string)row["color"];
                if (string.Equals(color, OldViolet, StringComparison.OrdinalIgnoreCase)) color = null;
                people[(string)row["id"]] = new Mate { Id = (string)row["id"], Name = (string)row["name"], Me = (bool?)row["me"] == true, Color = string.IsNullOrEmpty(color) ? Colors[place % Colors.Length] : color };
                place++;
            }
            var result = new Dictionary<string, List<Mate>>();
            foreach (string cond in new[] { "dry", "damp", "rain" })
            {
                var list = new List<Mate>();
                foreach (var row in sheet["conditions"]?[cond]?["drivers"] ?? new JArray())
                {
                    if (!people.TryGetValue((string)row["id"], out var who)) continue;
                    list.Add(new Mate { Id = who.Id, Name = who.Name, Color = who.Color, Me = who.Me, Laps = (int?)row["laps"] ?? 0,
                        Avg = Num(row["avg"]), Best = Num(row["best"]), Ve = Num(row["ve"]), Fuel = Num(row["fuel"]), Wear = Num(row["wear"]) });
                }
                result[cond] = list;
            }
            // My colour comes from the drivers list even on a condition where I have no lap yet.
            var me = people.Values.FirstOrDefault(mate => mate.Me);
            if (me != null) result["me"] = new List<Mate> { me };
            return result;
        }

        static double? WearOf(LiveLap lap) => lap.Wear.All(value => value >= 0) && lap.Wear.Sum() > 0 ? lap.Wear.Average() : (double?)null;

        // The session's laps that count, as the fiche counts them: timed, valid, away from the pits, within CleanRatio
        // of the pilot's best in that condition, in a stint of at least StintMin timed laps (a shorter one keeps only his
        // best lap). The stint being driven counts already: it is not over.
        static HashSet<LiveLap> Counted(List<LiveLap> laps, string cond, double? siteBest)
        {
            var stintOf = new Dictionary<LiveLap, int>();
            var runs = new Dictionary<int, int>();
            int stint = 0;
            for (int i = 0; i < laps.Count; i++)
            {
                if (i > 0 && (laps[i].Pit || laps[i].N - laps[i - 1].N != 1)) stint++;
                stintOf[laps[i]] = stint;
                if (!laps[i].Pit && laps[i].Time > 0) runs[stint] = (runs.TryGetValue(stint, out int run) ? run : 0) + 1;
            }
            var timed = laps.Where(lap => lap.Time > 0 && !lap.Invalid && !lap.Pit && Condition(lap.Rain, lap.Wet) == cond).ToList();
            double best = timed.Select(lap => lap.Time).Concat(siteBest is double b ? new[] { b } : new double[0]).DefaultIfEmpty(0).Min();
            return new HashSet<LiveLap>(timed.Where(lap => lap.Time <= best * CleanRatio
                && (stintOf[lap] == stint || (runs.TryGetValue(stintOf[lap], out int run) ? run : 0) >= StintMin || lap.Time == best)));
        }

        // Averages over every counted lap: the site's per pilot (weighted by his laps) and the session's.
        static double? Mean(IEnumerable<(double? value, int laps)> parts)
        {
            double sum = 0; int count = 0;
            foreach (var (value, laps) in parts) if (value is double v && v > 0 && laps > 0) { sum += v * laps; count += laps; }
            return count > 0 ? sum / count : (double?)null;
        }

        PracticeView Build(Sample s, LiveSession session, int stint)
        {
            string cond = Condition(s.Rain, s.Wet);
            var sheet = team;
            var mates = sheet != null && sheet.TryGetValue(cond, out var list) ? list : new List<Mate>();
            var me = mates.FirstOrDefault(mate => mate.Me);
            var others = mates.Where(mate => !mate.Me && mate.Laps > 0).ToList();
            string myColor = me?.Color ?? (sheet != null && sheet.TryGetValue("me", out var mine0) ? mine0[0].Color : Colors[0]);
            var laps = session?.Laps ?? new List<LiveLap>();
            var counted = Counted(laps, cond, me?.Best);
            var mine = laps.Where(counted.Contains).ToList();
            Func<LiveLap, double?> energy = lap => { double value = hasEnergy ? lap.Energy : lap.Fuel; return value > 0 ? value : (double?)null; };
            Func<Mate, double?> mateEnergy = mate => hasEnergy ? mate.Ve : mate.Fuel;

            // The live laps as one more part of the average, beside each pilot's from the site.
            (double?, int) Live(Func<LiveLap, double?> pick)
            {
                var values = mine.Select(pick).Where(value => value > 0).Select(value => value.Value).ToList();
                return (values.Count > 0 ? values.Average() : (double?)null, values.Count);
            }
            // Two stints of counted laps make the pilot's own average the whole target; before, the team's counts too.
            int myLaps = (me?.Laps ?? 0) + mine.Count;
            double w = Math.Min(myLaps, 2 * stint) / (2.0 * stint);
            var last = laps.LastOrDefault();
            string unit = hasEnergy ? " %" : " L";

            // One block: the last lap against the target, then Moi · Équipe · Meilleur (the lowest average).
            PracticeView.Block Make(PracticeView.Block block, double? value, Func<LiveLap, double?> pickLap, Func<Mate, double?> pickMate,
                Func<double, string> format, bool targetFromAverages, double? fixedTarget, string targetSuffix)
            {
                var live = Live(pickLap);
                double? myAvg = Mean((me != null ? new[] { (pickMate(me), me.Laps) } : new (double?, int)[0]).Append(live));
                double? crew = Mean(mates.Select(mate => (pickMate(mate), mate.Laps)).Append(live));
                double? target = targetFromAverages ? (myAvg is double o && crew is double c ? w * o + (1 - w) * c : myAvg ?? crew) : fixedTarget;
                block.Value = value is double v ? format(v) : "—";
                block.Number = value;
                block.TargetNumber = target;
                block.Target = target is double t ? "vs " + format(t) + targetSuffix : "";
                if (value is double val && target is double tt)
                {
                    block.Delta = (val > tt ? "+" : val < tt ? "−" : "±") + Number(Math.Abs(val - tt));
                    block.DeltaColor = val > tt ? Amber : Blue;
                }
                block.Me = "Moi " + (myAvg is double m ? format(m) : "—");
                block.Team = "Équipe " + (crew is double cr ? format(cr) : "—");
                var best = others.Where(mate => pickMate(mate) > 0).OrderBy(mate => pickMate(mate)).FirstOrDefault();
                bool meBest = myAvg != null && (best == null || myAvg <= pickMate(best));
                block.MeColor = meBest ? Violet : Argb(myColor);
                block.Best = !meBest && best != null ? best.Name + " " + format(pickMate(best).Value) : "";
                return block;
            }

            var view = new PracticeView { Color = Argb(myColor), NotCounted = last != null && !counted.Contains(last) };
            view.Energy.Title = hasEnergy ? "ÉNERGIE DU TOUR" : "CARBURANT DU TOUR";
            double energyTarget = hasEnergy ? 100.0 / stint : s.FuelCapacity / stint;
            Make(view.Lap, last?.Time > 0 ? last.Time : (double?)null, lap => lap.Time, mate => mate.Avg, LapTime, true, null, "");
            Make(view.Energy, last != null ? energy(last) : null, energy, mateEnergy, v => Number(v) + unit, false,
                energyTarget > 0 ? energyTarget : (double?)null, $" ({stint} t.)");
            Make(view.Wear, last != null ? WearOf(last) : null, WearOf, mate => mate.Wear, v => Number(v) + " %", true, null, "");
            return view;
        }

        public static string Number(double value) => value.ToString("0.00", French);

        // 3:29,884
        public static string LapTime(double seconds)
        {
            int minutes = (int)(seconds / 60);
            return minutes + ":" + (seconds - minutes * 60).ToString("00.000", French);
        }
    }
}
