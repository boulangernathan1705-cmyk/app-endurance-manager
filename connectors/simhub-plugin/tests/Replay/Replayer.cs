// Rejoue un enregistrement (Tape.cs) dans le code du plugin, au rythme de sa boucle de lecture (Plugin.ReadGame) :
// chaque lecture de la mémoire va à l'enregistreur des tours, aux calculs (Computed), une fois par seconde aux
// chiffres de course (Course), aux propriétés de télémétrie et au message du mur des stands (LiveShare). Les réponses
// de l'API du jeu viennent de l'enregistrement (Tape.Get), l'heure aussi (Tape.Now). Aucune erreur n'est avalée : le
// plugin les ignore en piste, les tests les comptent.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub.Replay
{
    public class Run
    {
        public int Frames;
        public List<LiveSession> Sessions = new List<LiveSession>();
        public List<string> Errors = new List<string>();
        public Computed Computed = new Computed();
        public Course Course = new Course();
        public CourseView LastCourse;
        // What the plugin would have sent to the team's room, with the recording's clock (ms).
        public List<(long At, string Message)> Messages = new List<(long, string)>();
        public List<(long At, string Message)> Room = new List<(long, string)>();
        // The dash's figures once a minute: property name → value, for reading in out/ (and in the CI's files).
        public List<Dictionary<string, object>> Dash = new List<Dictionary<string, object>>();
        public string DashFile;
        // Computed's values seen during the replay (after the first stop, the rejoin figures).
        public double? RejoinLoss, MicroOptimal, Optimal;
        public int? RejoinPlace;
    }

    public static class Replayer
    {
        public static Run Run(string path, ServiceTimes service, string outDir, string name = null)
        {
            var run = new Run();
            name = name ?? Path.GetFileNameWithoutExtension(path);
            var answers = new Dictionary<string, string>();
            DateTime started = DateTime.Now;
            double clock = 0;
            Tape.Clock = () => started.AddSeconds(clock);
            Tape.Answer = url => answers.TryGetValue(url, out var body) ? body : null;
            var api = new LmuApi();
            var live = new LiveShare(() => null);
            var recorder = new Recorder(() => Tape.Now, session => run.Sessions.Add(session), () => api.Setup, api.CurrentLight);
            var menu = new PitMenu();
            var game = new GameApi();
            var buffer = new byte[LmuMemory.Size];
            double lastEt = -1;
            int frozen = 0, tick = 0;
            void Guard(string what, Action action)
            {
                try { action(); }
                catch (Exception e) { if (run.Errors.Count < 200) run.Errors.Add($"{clock:0.0} s · {what} : {e.GetType().Name} {e.Message} {e.StackTrace?.Split('\n').FirstOrDefault()?.Trim()}"); }
            }
            try
            {
                foreach (var record in Tape.Read(path))
                {
                    clock = record.Time;
                    if (record.Kind == Tape.Http)
                    {
                        string text = record.Text;
                        int cut = text.IndexOf('\n');
                        if (cut > 0) answers[text.Substring(0, cut)] = text.Substring(cut + 1);
                        continue;
                    }
                    if (record.Kind == Tape.Room) { run.Room.Add((Tape.NowMs, record.Text)); continue; }
                    if (record.Kind != Tape.Memory) continue;
                    Tape.Apply(buffer, record.Payload);
                    run.Frames++;
                    bool ok = LmuMemory.Read(buffer, out var s);
                    frozen = ok && s.Realtime && s.ET == lastEt ? frozen + 1 : 0;
                    lastEt = s.ET;
                    bool driving = ok && s.Realtime && frozen < 50;
                    Guard("Recorder.Feed", () => recorder.Feed(s, driving));
                    if (driving) Guard("Computed.Update", () => run.Computed.Update(buffer, s, recorder.Current));
                    if (driving && tick % 10 == 0)
                    {
                        Guard("Course.Update", () => run.Course.Update(buffer, s, recorder.Current, service ?? api.Service, menu, game, api.Refuel, null, null));
                        Guard("LiveShare", () =>
                        {
                            string message = live.Message(buffer, s, recorder, api, run.Computed);
                            if (message != null) run.Messages.Add((Tape.NowMs, message));
                        });
                        Guard("Telemetry", () => { foreach (var (_, get) in Telemetry.Properties) get(s); });
                        Guard("Course.Properties", () => { foreach (var (_, get) in Course.Properties) get(run.Course.View); });
                        if (run.Computed.RejoinLoss.HasValue) { run.RejoinLoss = run.Computed.RejoinLoss; run.RejoinPlace = run.Computed.RejoinPlace; }
                        if (run.Computed.MicroOptimal.HasValue) run.MicroOptimal = run.Computed.MicroOptimal;
                        if (run.Computed.Optimal.HasValue) run.Optimal = run.Computed.Optimal;
                    }
                    // The game's API, read when the plugin would read it (here at once, from the recording).
                    if (driving && s.InPits && s.Speed < 1 && tick % 300 == 0) Guard("LmuApi.Read", () => api.Read(s.FrontCompound));
                    if (driving && tick % 20 == 5) Guard("PitMenu.Read", () => menu.Read());
                    if (driving && tick % 10 == 7) Guard("GameApi.Read", () => game.Read(s.InPits && s.Speed < 1));
                    if (driving && tick % 600 == 0) Guard("Dash", () => run.Dash.Add(Snapshot(clock, s, run.Course.View, run.Computed)));
                    tick++;
                }
                Guard("Recorder.Flush", () => recorder.Flush());
                run.LastCourse = run.Course.View;
            }
            finally
            {
                live.Stop();
                Tape.Clock = null;
                Tape.Answer = null;
            }
            run.DashFile = Path.Combine(outDir, name + ".dash.json");
            File.WriteAllText(run.DashFile, JsonConvert.SerializeObject(run.Dash, Formatting.Indented));
            File.WriteAllText(Path.Combine(outDir, name + ".sessions.json"), JsonConvert.SerializeObject(run.Sessions.Select(x => { var copy = JObject.FromObject(x); copy.Remove("trace"); return copy; }), Formatting.Indented));
            File.WriteAllLines(Path.Combine(outDir, name + ".plugin.jsonl"), run.Messages.Select(m => JsonConvert.SerializeObject(new { at = m.At, message = m.Message })));
            return run;
        }

        // Every property the dashes read, at one moment of the replay.
        static Dictionary<string, object> Snapshot(double clock, Sample s, CourseView course, Computed computed)
        {
            var d = new Dictionary<string, object> { ["_temps"] = Math.Round(clock, 1) };
            foreach (var (name, get) in Course.Properties) d[name] = Plain(get(course));
            foreach (var (name, get) in Telemetry.Properties) d[name] = Plain(get(s));
            d["Voiture.TourOptimal"] = computed.Optimal; d["Voiture.TourPrevu"] = computed.Predicted; d["Voiture.PlacePrevue"] = computed.PredictedPlace;
            d["Voiture.Sortie.TempsPerdu"] = computed.RejoinLoss; d["Voiture.Sortie.Place"] = computed.RejoinPlace;
            d["Voiture.Sortie.EcartDevant"] = computed.RejoinAhead; d["Voiture.Sortie.EcartDerriere"] = computed.RejoinBehind;
            d["Voiture.MicroSecteurs.Optimal"] = computed.MicroOptimal;
            return d;
        }

        static object Plain(object value) => value is double x && (double.IsNaN(x) || double.IsInfinity(x)) ? null : value;
    }
}
