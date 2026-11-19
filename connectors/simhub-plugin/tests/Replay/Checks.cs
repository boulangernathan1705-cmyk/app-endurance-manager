// Les tests : pour chaque séance de fixtures/, la mémoire de LMU refaite (Synth), rejouée dans le plugin (Replayer),
// puis comparée à ce que le plugin avait vraiment envoyé ce jour-là : mêmes tours, mêmes arrêts, mêmes chiffres.
// Ensuite le mur : les messages du plugin passent par le salon (room-bridge.mjs, le code du site) et arrivent au mur
// dans SimHub (Wall), dont on vérifie les cases.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub.Replay
{
    public static class Checks
    {
        static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");

        class Report
        {
            public readonly List<string> Failures = new List<string>();
            public int Passed;
            public void Is(bool ok, string what) { if (ok) Passed++; else Failures.Add(what); }
            public void Near(double? expected, double? actual, double tolerance, string what)
            {
                bool ok = expected.HasValue == actual.HasValue && (!expected.HasValue || Math.Abs(expected.Value - actual.Value) <= tolerance);
                Is(ok, $"{what} : attendu {Show(expected)}, obtenu {Show(actual)}");
            }
            static string Show(double? x) => x.HasValue ? x.Value.ToString("0.###", CultureInfo.InvariantCulture) : "rien";
        }

        public static bool RunAll(List<string> fixtures, string outDir)
        {
            bool allOk = Recorder();
            foreach (var file in fixtures)
            {
                var f = Fixture.Load(file);
                var report = new Report();
                var watch = Stopwatch.StartNew();
                string tape = Path.Combine(outDir, f.File + ".emrec");
                Synth.Write(f, tape);
                var service = f.Service?.ToObject<ServiceTimes>();
                var run = Replayer.Run(tape, service, outDir, f.File);
                foreach (var e in run.Errors) report.Is(false, "Erreur dans le plugin : " + e);
                Session(f, run, report);
                Computed(f, run, report);
                Wall(f, run, outDir, report);
                Console.WriteLine($"{(report.Failures.Count == 0 ? "OK   " : "ÉCHEC")} {f.Name} : {report.Passed} vérifications, {report.Failures.Count} écart(s), {run.Frames} lectures, {watch.Elapsed.TotalSeconds:0.0} s");
                foreach (var failure in report.Failures.Take(40)) Console.WriteLine("      " + failure);
                if (report.Failures.Count > 40) Console.WriteLine($"      … et {report.Failures.Count - 40} autres");
                allOk &= report.Failures.Count == 0;
            }
            return allOk;
        }

        // The recorder's format (Tape.cs): each copy rebuilt exactly from the one before and its changes.
        static bool Recorder()
        {
            var random = new Random(7);
            byte[] before = null, now = new byte[4096], copy = new byte[4096];
            for (int round = 0; round < 200; round++)
            {
                now = (byte[])now.Clone();
                for (int k = random.Next(0, 60); k > 0; k--) now[random.Next(now.Length)] = (byte)random.Next(256);
                Tape.Apply(copy, Tape.Delta(before, now));
                if (!copy.SequenceEqual(now)) { Console.WriteLine($"ÉCHEC Enregistreur : copie {round} mal refaite"); return false; }
                before = now;
            }
            Console.WriteLine("OK    Enregistreur : 200 copies refaites à l'identique");
            return true;
        }

        // What the plugin sends to the fiches combo: the same laps and stops as the day the session was driven.
        static void Session(Fixture f, Run run, Report r)
        {
            r.Is(run.Sessions.Count == 1, $"Une séance attendue, {run.Sessions.Count} obtenue(s)");
            var s = run.Sessions.FirstOrDefault();
            if (s == null) return;
            r.Is(s.Track == f.Track && s.Car == f.Car && s.Class == f.Class, $"Circuit, voiture, catégorie : {s.Track} · {s.Car} · {s.Class}");
            r.Is(s.Laps.Count == f.Laps.Count, $"Tours : attendu {f.Laps.Count}, obtenu {s.Laps.Count}");
            foreach (var (want, got) in f.Laps.Zip(s.Laps, (a, b) => (a, b)))
            {
                string at = $"Tour {want.N}";
                r.Is(got.N == want.N, $"{at} : numéro {got.N}");
                r.Near(want.T ?? 0, got.Time, 0.002, at + " temps");
                r.Near(want.S1, got.S1, 0.002, at + " S1");
                r.Near(want.S2, got.S2, 0.002, at + " S2");
                r.Near(want.S3, got.S3, 0.002, at + " S3");
                r.Is(got.Pit == want.Pit, $"{at} : stands {got.Pit}");
                r.Near(want.Fuel, got.Fuel, 0.01, at + " carburant");
                r.Near(want.Ve, got.Energy, 0.01, at + " énergie");
                // A lap ends between two readings (ten a second): up to a tenth of a second of the lap before or after falls in it.
                int index = f.Laps.IndexOf(want);
                double Neighbour(int i) => Math.Max(want.Wear[i], Math.Max(index > 0 ? f.Laps[index - 1].Wear[i] : 0, index + 1 < f.Laps.Count ? f.Laps[index + 1].Wear[i] : 0));
                for (int i = 0; i < 4; i++) r.Near(want.Wear[i], got.Wear[i], 0.01 + 0.001 * Neighbour(i), at + " usure " + "AVG AVD ARG ARD".Split(' ')[i]);
                if (!want.Pit || got.Temp[0] > 0) r.Near(want.Temp, got.Temp[0], 0.05, at + " température pneu");
                r.Near(want.Kpa, got.Pressure[0], 0.05, at + " pression");
                r.Is(got.Compound == want.Compound, $"{at} : gomme {got.Compound}");
                r.Near(want.TrackTemp, got.TrackTemp, 0.05, at + " piste °C");
                r.Near(want.Rain, got.Rain, 0.005, at + " pluie");
                r.Near(want.Wet, got.Wet, 0.01, at + " humidité");
                r.Near(want.Top, got.Top, 0.15, at + " vitesse max");
            }
            r.Is(s.Stops.Count == f.Stops.Count, $"Arrêts : attendu {f.Stops.Count}, obtenu {s.Stops.Count}");
            foreach (var (want, got) in f.Stops.Zip(s.Stops, (a, b) => (a, b)))
            {
                string at = $"Arrêt du tour {want.Lap}";
                r.Is(got.Lap == want.Lap, $"{at} : noté au tour {got.Lap}");
                r.Near(want.Lane, got.Lane, 0.25, at + " voie");
                r.Near(want.Stopped, got.Stationary, 0.25, at + " arrêté");
                r.Near(want.Fuel, got.Fuel, 0.1, at + " carburant mis");
                r.Near(want.Ve, got.Energy, 0.1, at + " énergie mise");
                r.Is(got.Tyres == want.Tyres, $"{at} : {got.Tyres} pneus changés au lieu de {want.Tyres}");
            }
            r.Is(s.Trace?.N == f.TraceLap, $"Trace du meilleur tour : tour {s.Trace?.N} au lieu de {f.TraceLap}");
            r.Is(s.Expert != null, "Chiffres expert de la séance absents");
        }

        // Our own calculations (Computed.cs): optimal lap, micro-sectors, rejoin after a stop.
        static void Computed(Fixture f, Run run, Report r)
        {
            var clean = f.Laps.Where(l => l.S1 > 0 && l.S2 > 0 && l.S3 > 0 && !l.Invalid).ToList();
            double optimal = Math.Round(clean.Min(l => l.S1.Value) + clean.Min(l => l.S2.Value) + clean.Min(l => l.S3.Value), 3);
            r.Near(optimal, run.Optimal, 0.002, "Tour optimal (meilleurs secteurs)");
            double best = f.Laps.Where(l => l.T > 0 && !l.Pit).Min(l => l.T.Value);
            r.Is(run.MicroOptimal.HasValue && Math.Abs(run.MicroOptimal.Value - best) < 3, $"Micro-secteurs : optimal {run.MicroOptimal} pour un meilleur tour de {best}");
            if (f.Stops.Count > 0)
            {
                var stop = f.Stops[0];
                r.Is(run.RejoinLoss > stop.Stopped && run.RejoinLoss < stop.Lane + stop.Stopped + 10, $"Sortie des stands : temps perdu {run.RejoinLoss} (arrêt {stop.Stopped} s, voie {stop.Lane} s)");
                r.Is(run.RejoinPlace >= 1 && run.RejoinPlace <= 4, $"Sortie des stands : place {run.RejoinPlace} sur 4");
            }
            var c = run.LastCourse;
            r.Is(c != null && c.Track == f.Track && c.Car == f.Car, "Chiffres de course : circuit et voiture");
        }

        // The mur: the plugin's messages through the room (the site's code), then into the dash in SimHub.
        static void Wall(Fixture f, Run run, string outDir, Report r)
        {
            r.Is(run.Messages.Count > 0, "Aucun message pour le mur");
            if (run.Messages.Count == 0) return;
            string plugin = Path.Combine(outDir, f.File + ".plugin.jsonl"), room = Path.Combine(outDir, f.File + ".room.jsonl");
            string bridge = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "room-bridge.mjs"));
            if (!File.Exists(bridge)) bridge = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "room-bridge.mjs"));
            var p = Process.Start(new ProcessStartInfo("node", $"\"{bridge}\" \"{plugin}\" \"{room}\"") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false });
            string err = p.StandardError.ReadToEnd();
            p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            r.Is(p.ExitCode == 0, "Salon (room-bridge.mjs) : " + err.Trim());
            if (p.ExitCode != 0) return;

            var wall = new Wall(() => null, () => false);
            long now = 0;
            Tape.Clock = () => DateTimeOffset.FromUnixTimeMilliseconds(now).LocalDateTime;
            int errors = 0;
            try
            {
                var lines = File.ReadAllLines(room);
                int index = 0;
                foreach (var line in lines)
                {
                    // The wall halfway through the session too, car on track (for the picture, dash-render.mjs).
                    if (index++ == lines.Length / 2)
                        File.WriteAllText(Path.Combine(outDir, f.File + ".mur-milieu.json"), JsonConvert.SerializeObject(WallProperties.All.ToDictionary(x => x.Name, x => x.Get(wall.View)), Formatting.Indented));
                    var item = JObject.Parse(line);
                    now = (long)item["at"];
                    bool whole = wall.Hear((string)item["message"]);
                    if (!whole) r.Is(false, $"Mur : changement sans base à {now}");
                    if (wall.LastError != null && errors++ < 5) r.Is(false, "Mur : " + wall.LastError.GetType().Name + " " + wall.LastError.Message + " " + wall.LastError.StackTrace?.Split('\n').FirstOrDefault()?.Trim());
                }
                var v = wall.View;
                File.WriteAllText(Path.Combine(outDir, f.File + ".mur.json"), JsonConvert.SerializeObject(WallProperties.All.ToDictionary(x => x.Name, x => x.Get(v)), Formatting.Indented));
                r.Is(v.Live, $"Mur : pas « en direct » ({v.Status})");
                r.Is(v.Track == f.Track, $"Mur : circuit « {v.Track} »");
                r.Is(v.Class != null, "Mur : catégorie vide");
                var last = f.Laps.Last(l => l.T > 0);
                string lap = (int)(last.T.Value / 60) + ":" + (last.T.Value - (int)(last.T.Value / 60) * 60).ToString("00.000", Fr);
                r.Is(v.LastLap == lap, $"Mur : dernier tour « {v.LastLap} » au lieu de « {lap} »");
                r.Is(v.Standing.Count(x => x.Visible) == 4, $"Mur : {v.Standing.Count(x => x.Visible)} lignes au classement de la catégorie au lieu de 4");
                r.Is(v.Standing.Count(x => x.Visible && x.Us) == 1, "Mur : notre voiture absente du classement");
            }
            finally { Tape.Clock = null; wall.Stop(); }
        }
    }
}
