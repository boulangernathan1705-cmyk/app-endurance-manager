// Profils de réglages : chaque pilote garde, voiture par voiture, ses réglages de black box (Sec, Inter, Pluie…). Un
// bouton du volant par profil : appui court, le plugin remet la voiture dans ce profil ; appui de 2 s, il mémorise l'état
// actuel dans ce profil.
//
// En roulant (TC, coupure, slip, ABS, répartition, migration, carto, barres) : LMU ne laisse pas écrire ces réglages, le
// plugin appuie donc sur les commandes du jeu par les rôles du Control Mapper de SimHub (sa sortie vJoy ou bridge USB, comme
// les boutons du volant), et relit la valeur dans la mémoire du jeu après chaque appui jusqu'à la bonne.
// Au stand : les lignes du menu des stands sont écrites par l'API locale du jeu (lu, modifié, renvoyé entier, relu).
//
// Rien n'est automatique : deux rappels seulement, publiés en propriétés pour les dashs (profil plus actif, piste hors de
// la plage d'humidité du profil). Les profils restent sur le PC du pilote (profils.json).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SimHub.Plugins;

namespace EnduranceManager.SimHub
{
    public class Profile
    {
        public string Name = "";
        // The track wetness range it is meant for (% of the racing line, LMU's path wetness): from WetMin to below WetMax.
        public double WetMin, WetMax = 100;
        // The in-car settings memorised (the game's levels; brake bias as % at the front), by Setting key.
        public Dictionary<string, double> Drive = new Dictionary<string, double>();
        // The pit menu lines memorised (line name → choice text), and the ones it applies (damage and driver left out by default).
        public Dictionary<string, string> Pit = new Dictionary<string, string>();
        public List<string> PitApplied = new List<string>();
    }

    public class ProfileFile
    {
        // Car model → its profiles, in button order (button 1 = the first).
        public Dictionary<string, List<Profile>> Cars = new Dictionary<string, List<Profile>>();
        // Command (Setting key + "+" or "-") → a role kept from older versions (chosen by hand). Roles are found by themselves now.
        public Dictionary<string, string> Roles = new Dictionary<string, string>();
    }

    // One setting changed with a pair of LMU commands.
    public class Setting
    {
        public string Key, Label;
        public Func<Sample, double?> Read;
        // How close counts as reached (brake bias moves in fractions of a percent).
        public double Tolerance = 0.5;
        // Words that find the pilot's own Control Mapper roles for it (« TC + », « ABS - », « BB + »…).
        public string[] Words;

        public static readonly Setting[] All =
        {
            new Setting { Key = "TC", Label = "TC", Words = new[] { "tc" }, Read = s => s.TCMax > 0 ? s.TC : (double?)null },
            new Setting { Key = "TCCut", Label = "Coupure TC", Words = new[] { "tc cut", "tc2", "coupure" }, Read = s => s.TCCutMax > 0 ? s.TCCut : (double?)null },
            new Setting { Key = "TCSlip", Label = "TC slip", Words = new[] { "tc angle", "tc slip", "tcslip", "slip" }, Read = s => s.TCSlipMax > 0 ? s.TCSlip : (double?)null },
            new Setting { Key = "ABS", Label = "ABS", Words = new[] { "abs" }, Read = s => s.ABSMax > 0 ? s.ABS : (double?)null },
            new Setting { Key = "Bias", Label = "Répartition", Words = new[] { "bb", "bias", "répartition", "repartition" }, Tolerance = 0.05,
                Read = s => s.RearBrakeBias > 0 && s.RearBrakeBias < 1 ? Math.Round((1 - s.RearBrakeBias) * 100, 1) : (double?)null },
            new Setting { Key = "Migration", Label = "Migration", Words = new[] { "migration" }, Read = s => s.MigrationMax > 0 ? s.Migration : (double?)null },
            new Setting { Key = "MotorMap", Label = "Carto moteur", Words = new[] { "carto", "motor map", "motormap", "map" }, Read = s => s.MotorMapMax > 0 ? s.MotorMap : (double?)null },
            new Setting { Key = "ArbFront", Label = "Barre avant", Words = new[] { "arb av", "arb front", "front arb", "frontarb", "barre av" }, Read = s => s.AntiSwayFrontMax > 0 ? s.AntiSwayFront : (double?)null },
            new Setting { Key = "ArbRear", Label = "Barre arrière", Words = new[] { "arb arr", "arb rear", "rear arb", "reararb", "barre arr" }, Read = s => s.AntiSwayRearMax > 0 ? s.AntiSwayRear : (double?)null },
        };
    }

    public class Profiles
    {
        // The wheel buttons: one SimHub action per place in the list (« Profil1 » … « Profil6 »).
        public const int Slots = 6;
        // A press held this long memorises instead of applying.
        const int HoldMs = 2000;
        const string MenuUrl = "http://localhost:6397/rest/garage/PitMenu/receivePitMenu";
        const string LoadUrl = "http://localhost:6397/rest/garage/PitMenu/loadPitMenu";
        static readonly string[] PitOffByDefault = { "DAMAGE", "DRIVER" };

        readonly string path;
        readonly Func<Sample?> latest;
        readonly Func<PluginManager> manager;
        readonly Func<bool> enabled;
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        readonly object gate = new object();
        readonly DateTime[] pressedAt = new DateTime[Slots];
        readonly Timer[] holds = new Timer[Slots];
        int busy;

        public ProfileFile File = new ProfileFile();
        // The car being driven (or the last one), whose profiles the screen and the buttons use.
        public volatile string Car;
        // The profile last applied by the plugin, and what the last button did (shown on the screen and the dashs).
        public volatile string Applied;
        public volatile string Message = "";

        public Profiles(string folder, Func<Sample?> latest, Func<PluginManager> manager, Func<bool> enabled)
        {
            path = Path.Combine(folder, "profils.json");
            this.latest = latest;
            this.manager = manager;
            this.enabled = enabled;
            try { if (System.IO.File.Exists(path)) File = JsonConvert.DeserializeObject<ProfileFile>(System.IO.File.ReadAllText(path)) ?? new ProfileFile(); } catch { }
            if (File.Cars == null) File.Cars = new Dictionary<string, List<Profile>>();
            if (File.Roles == null) File.Roles = new Dictionary<string, string>();
        }

        public void Save()
        {
            lock (gate)
                try { System.IO.File.WriteAllText(path, JsonConvert.SerializeObject(File, Formatting.Indented)); } catch { }
        }

        // The car's profiles, made on first sight: Sec, Inter and Pluie with the usual wetness ranges, values empty until
        // memorised. Renamed, removed or added to on the plugin's screen.
        public List<Profile> For(string car)
        {
            if (string.IsNullOrEmpty(car)) return new List<Profile>();
            lock (gate)
            {
                if (!File.Cars.TryGetValue(car, out var list))
                {
                    list = new List<Profile>
                    {
                        new Profile { Name = "Sec", WetMin = 0, WetMax = 5 },
                        new Profile { Name = "Inter", WetMin = 5, WetMax = 12 },
                        new Profile { Name = "Pluie", WetMin = 12, WetMax = 100 },
                    };
                    File.Cars[car] = list;
                    Save();
                }
                return list;
            }
        }

        public List<Profile> Current => For(Car);

        // Each reading of the game: the car driven, for the buttons and the screen.
        // Also in the garage and the menus with a car loaded: its profiles are made and can be memorised from there.
        public void Seen(Sample s)
        {
            if (string.IsNullOrEmpty(s.Car)) return;
            seen = s;
            if (s.Car != Car) { Car = s.Car; Applied = null; }
        }
        volatile object seen;
        // The car as last read, on track or not: what « Mémoriser » takes.
        Sample? Last => latest() ?? (seen is Sample s ? s : (Sample?)null);

        // ── The wheel buttons ────────────────────────────────────────────────────────────────────────────────────────
        // Pressed: a timer starts; still held after 2 s, the profile memorises the car's state. Released before: applied.
        public void Press(int slot)
        {
            if (!enabled() || slot < 0 || slot >= Slots) return;
            Report.Log("bouton", "Profil" + (slot + 1) + " appuyé");
            pressedAt[slot] = DateTime.UtcNow;
            holds[slot]?.Dispose();
            holds[slot] = new Timer(_ => { pressedAt[slot] = DateTime.MinValue; Memorise(slot); }, null, HoldMs, Timeout.Infinite);
        }

        public void Release(int slot)
        {
            if (!enabled() || slot < 0 || slot >= Slots) return;
            holds[slot]?.Dispose();
            holds[slot] = null;
            if (pressedAt[slot] == DateTime.MinValue) { Report.Log("bouton", "Profil" + (slot + 1) + " relâché après 2 s : mémorisé"); return; }
            pressedAt[slot] = DateTime.MinValue;
            Report.Log("bouton", "Profil" + (slot + 1) + " relâché : appliqué");
            Apply(slot);
        }

        // ── Memorise ─────────────────────────────────────────────────────────────────────────────────────────────────
        // The car's settings as they are now, and the pit menu as it is set, into the profile at this place.
        public void Memorise(int slot)
        {
            var list = Current;
            if (slot >= list.Count) { Message = "Pas de profil n° " + (slot + 1) + " pour cette voiture."; return; }
            if (!(Last is Sample s)) { Message = "Mémorisation impossible : lance une séance avec la voiture."; return; }
            var profile = list[slot];
            var drive = new Dictionary<string, double>();
            foreach (var setting in Setting.All)
                if (setting.Read(s) is double value) drive[setting.Key] = value;
            var pit = ReadMenuTexts();
            lock (gate)
            {
                profile.Drive = drive;
                if (pit != null)
                {
                    bool first = profile.Pit.Count == 0;
                    profile.Pit = pit;
                    // The first time, every line applies except the damage and the driver; later, the pilot's own choice stays.
                    if (first) profile.PitApplied = pit.Keys.Where(name => !PitOffByDefault.Contains(name)).ToList();
                }
            }
            Save();
            Applied = profile.Name;
            Message = $"« {profile.Name} » mémorisé" + (pit == null ? " (menu des stands non lu)." : ".");
        }

        // ── Apply ────────────────────────────────────────────────────────────────────────────────────────────────────
        // One at a time, on its own thread: a press waits for the game to show the new value before the next.
        public void Apply(int slot)
        {
            var list = Current;
            if (slot >= list.Count) { Message = "Pas de profil n° " + (slot + 1) + " pour cette voiture."; return; }
            var profile = list[slot];
            if (profile.Drive.Count == 0 && profile.PitApplied.Count == 0) { Message = $"« {profile.Name} » est vide : maintiens le bouton 2 s pour le mémoriser."; return; }
            if (Interlocked.Exchange(ref busy, 1) == 1) return;
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    Message = $"« {profile.Name} » en cours…";
                    var problems = new List<string>();
                    foreach (var setting in Setting.All)
                        if (profile.Drive.TryGetValue(setting.Key, out double target)) { string problem = Reach(setting, target); if (problem != null) problems.Add(problem); }
                    if (profile.PitApplied.Count > 0) { string problem = WriteMenu(profile); if (problem != null) problems.Add(problem); }
                    Applied = profile.Name;
                    Message = problems.Count == 0 ? $"« {profile.Name} » appliqué." : $"« {profile.Name} » appliqué sauf : " + string.Join(" · ", problems);
                }
                catch { Message = $"« {profile.Name} » : erreur, rien de plus n'a été changé."; }
                finally { busy = 0; }
            });
        }

        // Presses « + » or « − » until the game shows the value aimed at. A role that moves nothing (not mapped in the Control
        // Mapper or not bound in LMU) stops it, said in the message.
        string Reach(Setting setting, double target)
        {
            // A pilot's « + » can lower the game's level (TC counted the other way on some cars): seen once, then swapped.
            bool swapped = false;
            for (int presses = 0, still = 0; presses < 40; presses++)
            {
                if (!(latest() is Sample s)) return setting.Label + " (voiture plus en piste)";
                if (!(setting.Read(s) is double now)) return null;
                if (Math.Abs(now - target) < setting.Tolerance) return null;
                string command = setting.Key + ((target > now) != swapped ? "+" : "-");
                string role = Role(command);
                if (string.IsNullOrEmpty(role)) return setting.Label + " (bouton « " + Command(command) + " » introuvable : clique « Préparer LMU » dans FMT companion)";
                if (!PressRole(manager(), role)) return setting.Label + " (rôle « " + role + " » introuvable)";
                // The game takes a moment to show the new level: a few readings at most, then the next press.
                double? after = now;
                for (int wait = 0; wait < 6 && after == now; wait++) { Thread.Sleep(60); after = latest() is Sample t ? setting.Read(t) : null; }
                still = after == now ? still + 1 : 0;
                if (after is double moved && Math.Abs(moved - target) > Math.Abs(now - target)) swapped = !swapped;
                if (still >= 2) return setting.Label + " (rien ne bouge avec « " + role + " »)";
            }
            return setting.Label + " (pas atteint)";
        }

        // Alone in its method: should SimHub's Control Mapper differ from the facade (reference/), only the profiles' presses
        // stop, caught by the caller, not the whole plugin (.NET fails the method that calls a missing member).
        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        internal static IControlMapperInterface ControlMapper(PluginManager manager) => manager?.GetControlMapperInterface();

        static bool PressRole(PluginManager manager, string role)
        {
            try { return StartStop(manager, role); } catch { return false; }
        }

        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        static bool StartStop(PluginManager manager, string role) => ControlMapper(manager)?.StartStopRole(role, 60) == true;

        [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        internal static List<string> ButtonRoles(PluginManager manager) => ControlMapper(manager)?.GetAvailableButtonRoles();

        // The Control Mapper role that presses a command in LMU, found by itself: FMT companion's first (« FMT - … », made by
        // its « Préparer LMU »), else one the pilot named (« TC + »), else one chosen by hand in an older version.
        public string Role(string command)
        {
            var setting = Setting.All.FirstOrDefault(x => command.StartsWith(x.Key) && command.Length == x.Key.Length + 1);
            if (setting == null) return null;
            return Find(setting, command.EndsWith("+") ? "+" : "-", Available())
                ?? (File.Roles.TryGetValue(command, out string kept) && !string.IsNullOrEmpty(kept) ? kept : null);
        }

        public bool AnyRole => Available().Count > 0;

        List<string> available = new List<string>();
        DateTime availableAt;
        // The Control Mapper's button roles, read again every 5 s at most.
        List<string> Available()
        {
            if (DateTime.UtcNow - availableAt < TimeSpan.FromSeconds(5)) return available;
            availableAt = DateTime.UtcNow;
            try { available = (ButtonRoles(manager()) ?? new List<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList(); }
            catch { available = new List<string>(); }
            return available;
        }

        static readonly string[] Up = { "+", "plus", "next", "suivant", "increase", "up" }, Down = { "-", "−", "moins", "previous", "prev", "précédent", "decrease", "down" };

        // The role for a setting and a sign: its last part (« FMT - Voiture - TC Next » → « tc next »), the sign at the end,
        // what is left is the setting's name. « TC + » is TC, not « TC cut + »: short names must be the whole name.
        internal static string Find(Setting setting, string sign, List<string> roles)
        {
            var ordered = roles.OrderBy(x => x.TrimStart().StartsWith("FMT", StringComparison.OrdinalIgnoreCase) ? 0 : 1);
            foreach (string word in setting.Words)
                foreach (string role in ordered)
                {
                    string text = role.ToLowerInvariant().Trim();
                    int cut = text.LastIndexOf(" - ", StringComparison.Ordinal);
                    if (cut >= 0 && text.StartsWith("fmt")) text = text.Substring(cut + 3).Trim();
                    string stem = null;
                    foreach (string end in sign == "+" ? Up : Down)
                        if (text.EndsWith(end) && (end.Length == 1 || text.Length == end.Length || !char.IsLetter(text[text.Length - end.Length - 1])))
                        { stem = text.Substring(0, text.Length - end.Length).Trim(' ', '-', '_'); break; }
                    if (stem == null) continue;
                    if (stem == word || (word.Length > 3 && stem.Contains(word))) return role;
                }
            return null;
        }

        public static string Command(string command)
        {
            var setting = Setting.All.FirstOrDefault(x => command.StartsWith(x.Key) && command.Length == x.Key.Length + 1);
            return (setting?.Label ?? command) + " " + (command.EndsWith("+") ? "+" : "−");
        }

        // The pit menu as the game sends it: name of each line → text of its choice. Null when the game does not answer.
        Dictionary<string, string> ReadMenuTexts()
        {
            try
            {
                var lines = JArray.Parse(Tape.Get(client, MenuUrl));
                var texts = new Dictionary<string, string>();
                foreach (var line in lines.OfType<JObject>())
                {
                    string name = Name(line), text = Choice(line, (int?)line["currentSetting"] ?? -1);
                    if (name != "" && text != null) texts[name] = text;
                }
                return texts;
            }
            catch { return null; }
        }

        // The menu is read, the chosen lines set to the profile's choice (found by its text: the game's indexes change with
        // the car), sent back whole, then read again to check.
        string WriteMenu(Profile profile)
        {
            try
            {
                var lines = JArray.Parse(Tape.Get(client, MenuUrl));
                var wanted = new Dictionary<string, int>();
                var missing = new List<string>();
                foreach (var line in lines.OfType<JObject>())
                {
                    string name = Name(line);
                    if (!profile.PitApplied.Contains(name) || !profile.Pit.TryGetValue(name, out string text)) continue;
                    var settings = line["settings"] as JArray;
                    int index = -1;
                    for (int i = 0; settings != null && i < settings.Count; i++) if (Choice(line, i) == text) { index = i; break; }
                    if (index < 0) { missing.Add(name); continue; }
                    if (((int?)line["currentSetting"] ?? -1) != index) { line["currentSetting"] = index; wanted[name] = index; }
                }
                if (wanted.Count > 0)
                {
                    var body = new StringContent(lines.ToString(Formatting.None), Encoding.UTF8, "application/json");
                    client.PostAsync(LoadUrl, body).GetAwaiter().GetResult().EnsureSuccessStatusCode();
                    for (int check = 0; check < 4 && wanted.Count > 0; check++)
                    {
                        Thread.Sleep(250);
                        foreach (var line in JArray.Parse(Tape.Get(client, MenuUrl)).OfType<JObject>())
                            if (wanted.TryGetValue(Name(line), out int index) && ((int?)line["currentSetting"] ?? -1) == index) wanted.Remove(Name(line));
                    }
                }
                missing.AddRange(wanted.Keys);
                return missing.Count == 0 ? null : "stand : " + string.Join(", ", missing.Select(x => x.ToLowerInvariant()));
            }
            catch { return "menu des stands (le jeu ne répond pas)"; }
        }

        static string Name(JObject line) => ((string)line["name"] ?? "").Replace(":", "").Trim().ToUpperInvariant();

        static string Choice(JObject line, int index)
        {
            var settings = line["settings"] as JArray;
            return settings != null && index >= 0 && index < settings.Count ? ((string)settings[index]?["text"] ?? "").Trim() : null;
        }

        // ── Reminders, for the dashs ─────────────────────────────────────────────────────────────────────────────────
        // The profile whose in-car settings are all what the car has now: the one applied first, else the first that fits.
        public string Active
        {
            get
            {
                if (!(latest() is Sample s)) return null;
                var list = Current;
                bool Fits(Profile p) => p.Drive.Count > 0 && Setting.All.All(x => !p.Drive.TryGetValue(x.Key, out double v) || !(x.Read(s) is double now) || Math.Abs(now - v) < x.Tolerance);
                var applied = list.FirstOrDefault(p => p.Name == Applied);
                if (applied != null && Fits(applied)) return applied.Name;
                return list.FirstOrDefault(Fits)?.Name;
            }
        }

        // A profile was applied and the car no longer matches it (a setting changed by hand since).
        public bool NotActive => Applied != null && Active != Applied;

        // The track's wetness now (%), and the profile whose range holds it.
        public double? Wetness => latest() is Sample s && s.Wet >= 0 && s.Wet <= 1 ? Math.Round(s.Wet * 100, 0) : (double?)null;

        public string ForWeather
        {
            get
            {
                if (!(Wetness is double wet)) return null;
                return Current.FirstOrDefault(p => wet >= p.WetMin && (wet < p.WetMax || p.WetMax >= 100))?.Name;
            }
        }

        // The track no longer fits the active profile's range: time to change.
        public bool ToChange
        {
            get { string active = Active ?? Applied, weather = ForWeather; return active != null && weather != null && active != weather; }
        }

        public string NameAt(int slot) { var list = Current; return slot < list.Count ? list[slot].Name : ""; }
    }
}
