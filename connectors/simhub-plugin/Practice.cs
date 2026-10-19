// Bandeau des essais : pendant les essais, le dernier tour du pilote (temps, énergie ou carburant, usure moyenne des
// quatre pneus) face à ce qu'il vise, avec la moyenne de l'équipe et celle de chaque coéquipier. Les chiffres de
// l'équipe viennent de la fiche combo du site (GET /api/combos/plugin/sheet, server/combos.mjs), relue au début de
// chaque séance puis toutes les 15 minutes (ils ne changent que quand un coéquipier rentre et que sa séance part) ; ceux de la séance en cours sont comptés ici, tour par tour, avec les règles
// de la fiche (shared/combos.mjs). Des chiffres bruts, aucun conseil. La fenêtre est dans Banner.cs.
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

    // What the banner shows, built once a second on the reading thread and handed whole to the window.
    public class BannerView
    {
        public class Line { public string Name, Color, Value; }
        public class Block
        {
            public string Label, Value, Delta = "", Ref = "", Team = "—";
            // + (slower, more used) or − (faster, less used): amber or blue.
            public bool Up;
            public bool NotCounted;
            public List<Line> Mates = new List<Line>();
        }
        public string Color = Practice.Colors[0];
        public Block[] Blocks;

        // Before any lap: the labels alone, for placing the banner.
        public static BannerView Empty(int stint) => new BannerView
        {
            Blocks = new[]
            {
                new Block { Label = "Dernier tour", Value = "—" },
                new Block { Label = "Énergie du tour", Value = "—", Ref = $"vs {Practice.Number(100.0 / stint)} % ({stint} t.)" },
                new Block { Label = "Usure du tour (4 pneus)", Value = "—" }
            }
        };
    }

    public class Practice
    {
        // The site's colours (shared/combos.mjs, COLORS): a pilot who has not chosen gets one by his place on the sheet.
        public static readonly string[] Colors = { "#b98cff", "#ff9a3d", "#45d4d0", "#ff6ad5", "#f2e35c", "#ff5d5d", "#9be15d", "#c9a27a", "#8fa8ff", "#e0e0e0" };
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

        // Shown now (null: hidden), and the last one shown, for placing the banner from the plugin's screen.
        public volatile BannerView View;
        public volatile BannerView Last;

        public static string Condition(double rain, double wet)
        {
            double level = Math.Max(rain, wet >= 0 && wet <= 1 ? wet : 0);
            return level >= RainFrom ? "rain" : level >= DampFrom ? "damp" : "dry";
        }

        public void Hide() => View = null;

        // Once a second while the pilot drives a practice session.
        public void Update(Sample s, LiveSession session, LinkCode code, int stint)
        {
            Fetch(code, s.Track, s.Car, session?.At ?? 0);
            if (energyCar != s.Car) { energyCar = s.Car; hasEnergy = false; }
            if (s.Energy > 0.01) hasEnergy = true;
            var view = Build(s, session, Math.Max(1, stint));
            View = view;
            Last = view;
        }

        // The sheet again at the start of each session, then every 15 minutes, one read at a time: a sheet reads every
        // lap of the combo several times, the site's daily database reads stay well under the free plan's.
        void Fetch(LinkCode code, string track, string car, long at)
        {
            if (code == null) return;
            string key = track + "\n" + car;
            string run = key + "\n" + at;
            if (key != teamFor) team = null;
            if ((run == wanted && DateTime.Now < fetchAt) || Interlocked.Exchange(ref fetching, 1) == 1) return;
            wanted = run;
            fetchAt = DateTime.Now.AddMinutes(15);
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
                // No network: tried again in 30 s, the banner shows the session's own laps meanwhile.
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
                string color = (string)row["color"];
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

        BannerView Build(Sample s, LiveSession session, int stint)
        {
            string cond = Condition(s.Rain, s.Wet);
            var mates = team != null && team.TryGetValue(cond, out var list) ? list : new List<Mate>();
            var me = mates.FirstOrDefault(mate => mate.Me);
            var laps = session?.Laps ?? new List<LiveLap>();
            var counted = Counted(laps, cond, me?.Best);
            var mine = laps.Where(counted.Contains).ToList();
            Func<LiveLap, double?> energy = lap => { double value = hasEnergy ? lap.Energy : lap.Fuel; return value > 0 ? value : (double?)null; };

            // The live laps as one more part of the average, beside each pilot's from the site.
            (double?, int) Live(Func<LiveLap, double?> pick)
            {
                var values = mine.Select(pick).Where(value => value > 0).Select(value => value.Value).ToList();
                return (values.Count > 0 ? values.Average() : (double?)null, values.Count);
            }
            var liveTime = Live(lap => lap.Time);
            var liveEnergy = Live(energy);
            var liveWear = Live(WearOf);
            Func<Mate, double?> mateEnergy = mate => hasEnergy ? mate.Ve : mate.Fuel;

            double? crewTime = Mean(mates.Select(mate => (mate.Avg, mate.Laps)).Append(liveTime));
            double? crewEnergy = Mean(mates.Select(mate => (mateEnergy(mate), mate.Laps)).Append(liveEnergy));
            double? crewWear = Mean(mates.Select(mate => (mate.Wear, mate.Laps)).Append(liveWear));
            var site = me != null ? new[] { (me.Avg, me.Laps) } : new (double?, int)[0];
            double? myTime = Mean(site.Append(liveTime));
            double? myWear = Mean((me != null ? new[] { (me.Wear, me.Laps) } : new (double?, int)[0]).Append(liveWear));
            // Two stints of counted laps make the pilot's own average the whole target; before, the team's counts too.
            int myLaps = (me?.Laps ?? 0) + mine.Count;
            double w = Math.Min(myLaps, 2 * stint) / (2.0 * stint);
            double? Target(double? own, double? crew) => own is double o && crew is double c ? w * o + (1 - w) * c : own ?? crew;
            double? timeTarget = Target(myTime, crewTime), wearTarget = Target(myWear, crewWear);
            double energyTarget = hasEnergy ? 100.0 / stint : s.FuelCapacity / stint;

            var last = laps.LastOrDefault();
            bool notCounted = last != null && !counted.Contains(last);
            var others = mates.Where(mate => !mate.Me && mate.Laps > 0).ToList();
            string unit = hasEnergy ? " %" : " L";

            BannerView.Block Make(string label, double? value, double? target, string targetText, Func<double, string> format, Func<double, string> delta,
                double? crew, Func<Mate, double?> pick)
            {
                var block = new BannerView.Block { Label = label, Value = value is double v ? format(v) : "—", NotCounted = notCounted && value != null,
                    Team = crew is double c ? format(c) : "—", Ref = target != null ? "vs " + targetText : "" };
                if (value is double val && target is double t)
                {
                    block.Up = val > t;
                    block.Delta = (val > t ? "+" : val < t ? "−" : "±") + delta(Math.Abs(val - t));
                }
                foreach (var mate in others)
                    block.Mates.Add(new BannerView.Line { Name = mate.Name, Color = mate.Color, Value = pick(mate) is double m ? format(m) : "—" });
                return block;
            }

            return new BannerView
            {
                Color = me?.Color ?? Colors[0],
                Blocks = new[]
                {
                    Make("Dernier tour", last?.Time > 0 ? last.Time : (double?)null, timeTarget, timeTarget is double tt ? LapTime(tt) : "", LapTime,
                        d => Number(d), crewTime, mate => mate.Avg),
                    Make(hasEnergy ? "Énergie du tour" : "Carburant du tour", last != null ? energy(last) : null, energyTarget > 0 ? energyTarget : (double?)null,
                        $"{Number(energyTarget)}{unit} ({stint} t.)", v => Number(v) + unit, d => Number(d), crewEnergy, mateEnergy),
                    Make("Usure du tour (4 pneus)", last != null ? WearOf(last) : null, wearTarget, wearTarget is double wt ? Number(wt) + " %" : "", v => Number(v) + " %",
                        d => Number(d), crewWear, mate => mate.Wear)
                }
            };
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
