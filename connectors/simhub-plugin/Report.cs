// Module « Retours de test » : ce que fait le plugin chez un pilote qui l'essaie, pour continuer le développement.
// Un journal léger (erreurs du plugin, appuis sur les boutons de profil et leur résultat, états des modules quand ils
// changent, chiffres du dash toutes les 5 minutes), écrit à la fin de chaque séance, et « Signaler un problème » : une
// phrase du pilote avec le journal du moment. Les fichiers vont dans Documents\Endurance Manager\Retours ; avec le module
// Site, ils partent tout seuls sur le site (POST /api/combos/plugin/report), hors piste. Coupé, rien n'est noté.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

namespace EnduranceManager.SimHub
{
    public static class Report
    {
        // Set by the plugin from its switch.
        public static volatile bool On;
        public static string Version = "";
        const int Kept = 3000, SignalLines = 400, MaxBytes = 240 * 1024;
        static readonly object gate = new object();
        static List<object[]> lines = new List<object[]>();
        static readonly Dictionary<string, string> states = new Dictionary<string, string>();
        static readonly Dictionary<string, int> errors = new Dictionary<string, int>();
        static readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        static DateTime opened = DateTime.Now;

        public static string Folder => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Endurance Manager", "Retours");
        static string Waiting => Path.Combine(Folder, "a envoyer");
        static string Sent => Path.Combine(Folder, "envoyes");
        public static string LastSent { get; private set; }

        static double Clock => Math.Round((DateTime.Now - opened).TotalSeconds, 1);

        // One line: when (seconds since the journal opened), what, and the text.
        public static void Log(string what, string text)
        {
            if (!On) return;
            lock (gate)
            {
                lines.Add(new object[] { Clock, DateTime.Now.ToString("HH:mm:ss"), what, text });
                if (lines.Count > Kept) lines.RemoveRange(0, lines.Count - Kept);
            }
        }

        // An error the plugin went past: each kind once in full, then only counted.
        public static void Error(string where, Exception e)
        {
            if (!On || e == null) return;
            string key = where + ":" + e.GetType().Name + ":" + e.Message;
            int seen;
            lock (gate) { errors.TryGetValue(key, out seen); errors[key] = seen + 1; }
            if (seen == 0) Log("erreur", where + " : " + e.GetType().Name + " " + e.Message + " " + e.StackTrace?.Split('\n').FirstOrDefault()?.Trim());
        }

        // A state written when it changes (game, link, modules, mur, profiles, FMT companion).
        public static void State(string name, string value)
        {
            if (!On) return;
            value = value ?? "";
            lock (gate)
            {
                if (states.TryGetValue(name, out var before) && before == value) return;
                states[name] = value;
            }
            Log(name, value);
        }

        // The dash's figures at one moment, as the dash reads them.
        public static void Figures(IEnumerable<KeyValuePair<string, object>> values)
        {
            if (!On) return;
            Log("chiffres", JsonConvert.SerializeObject(values.Where(x => x.Value != null && !(x.Value is string text && text == "")).ToDictionary(x => x.Key, x => x.Value)));
        }

        // The session's journal to a file, then a fresh journal. Nothing new since the last one: nothing written.
        public static void Close(string why, object modules)
        {
            if (!On) return;
            List<object[]> taken;
            Dictionary<string, int> counted;
            lock (gate)
            {
                if (lines.Count == 0) return;
                taken = lines; lines = new List<object[]>();
                counted = new Dictionary<string, int>(errors); errors.Clear();
                opened = DateTime.Now;
            }
            Write("journal", why, new { modules, errors = counted, lines = Fit(taken) });
        }

        // « Signaler un problème »: the pilot's sentence with the latest lines, sent at once when the site is there.
        public static void Signal(string note, object modules)
        {
            List<object[]> taken;
            lock (gate) taken = lines.Skip(Math.Max(0, lines.Count - SignalLines)).ToList();
            Write("signal", note, new { modules, states = Copy(), lines = Fit(taken) });
        }

        static Dictionary<string, string> Copy() { lock (gate) return new Dictionary<string, string>(states); }

        // Under the site's size limit: the oldest lines go first.
        static List<object[]> Fit(List<object[]> taken)
        {
            while (taken.Count > 1 && Encoding.UTF8.GetByteCount(JsonConvert.SerializeObject(taken)) > MaxBytes) taken = taken.Skip(taken.Count / 4).ToList();
            return taken;
        }

        static void Write(string kind, string note, object data)
        {
            try
            {
                Directory.CreateDirectory(Waiting);
                string file = Path.Combine(Waiting, $"{DateTime.Now:yyyy-MM-dd HH-mm-ss} {kind}.json");
                File.WriteAllText(file, JsonConvert.SerializeObject(new { kind, version = Version, note = note ?? "", data }, Formatting.Indented));
            }
            catch { }
        }

        public static int WaitingCount
        {
            get { try { return Directory.Exists(Waiting) ? Directory.GetFiles(Waiting, "*.json").Length : 0; } catch { return 0; } }
        }

        // The files waiting, to the site (module Site on and linked), oldest first; sent ones kept aside a month.
        public static void SendAll(LinkCode code)
        {
            if (code == null || !Directory.Exists(Waiting)) return;
            foreach (var file in Directory.GetFiles(Waiting, "*.json").OrderBy(x => x))
            {
                try
                {
                    var request = new HttpRequestMessage(HttpMethod.Post, code.Origin + "/api/combos/plugin/report")
                    { Content = new StringContent(File.ReadAllText(file), Encoding.UTF8, "application/json") };
                    request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", code.Token);
                    using (var response = client.SendAsync(request).GetAwaiter().GetResult())
                    {
                        if ((int)response.StatusCode == 400 || (int)response.StatusCode == 413) { File.Delete(file); continue; }
                        if (!response.IsSuccessStatusCode) return;
                    }
                    Directory.CreateDirectory(Sent);
                    File.Move(file, Path.Combine(Sent, Path.GetFileName(file)));
                    LastSent = DateTime.Now.ToString("HH:mm");
                }
                catch { return; }
            }
            try { foreach (var old in Directory.GetFiles(Sent, "*.json").Where(x => File.GetCreationTime(x) < DateTime.Now.AddDays(-30))) File.Delete(old); } catch { }
        }
    }
}
