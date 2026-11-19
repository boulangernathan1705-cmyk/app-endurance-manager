// Le mur des stands dans SimHub (plugin 2.5) : le plugin suit le salon de l'équipe comme une page du site (même salon,
// mêmes données, GET /api/combos/plugin/live/watch avec la clé du pilote) et en tire les chiffres du dash « Endurance
// Manager · Mur » (Dashes.cs) : classement de notre catégorie, piste à plat centrée sur notre voiture, relatif, pneus et
// dégâts, énergie et carburant, chrono, réglages, entrées. Le pilote au volant et ses coéquipiers lisent le même mur.
// Rien n'est inventé : chaque case est une valeur du salon ou un calcul simple dessus, vide quand elle manque.
//
// Activé par l'interrupteur « Mur dans SimHub » de l'écran du plugin (coupé par défaut) : tant qu'il est coupé, aucune
// connexion. Le salon envoie le flux complet une fois, puis seulement ce qui change (patch, shared/live.mjs diff).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    // What the dash shows, made once per message from the room: one value per property of the dash (Wall.Make).
    public class WallView
    {
        readonly System.Collections.Concurrent.ConcurrentDictionary<string, object> values = new System.Collections.Concurrent.ConcurrentDictionary<string, object>();
        public object this[string name] { get => values.TryGetValue(name, out var value) ? value : null; set => values[name] = value; }
    }

    public class Wall
    {
        readonly Func<LinkCode> code;
        readonly Func<bool> enabled;
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        readonly Dictionary<string, JToken> feeds = new Dictionary<string, JToken>();
        readonly Thread thread;
        volatile bool running = true;
        readonly List<JToken> frames = new List<JToken>();
        public volatile WallView View = new WallView();
        public string Status { get; private set; } = "Coupé";

        public Wall(Func<LinkCode> code, Func<bool> enabled)
        {
            this.code = code;
            this.enabled = enabled;
            thread = new Thread(Loop) { IsBackground = true, Name = "EnduranceManager.Wall", Priority = ThreadPriority.Lowest };
            thread.Start();
        }

        public void Stop() => running = false;

        // ---------- Connection ----------

        void Loop()
        {
            int backoff = 5;
            while (running)
            {
                var link = code();
                if (!enabled() || link == null)
                {
                    Status = link == null ? "Colle ton code de liaison" : "Coupé";
                    View = new WallView();
                    Thread.Sleep(2000);
                    continue;
                }
                try
                {
                    using (var socket = new ClientWebSocket())
                    {
                        socket.Options.SetRequestHeader("Authorization", "Bearer " + link.Token);
                        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
                        var uri = new Uri(Pass(link) ?? Regex.Replace(link.Origin, "^https://", "wss://") + "/api/combos/plugin/live/watch");
                        if (!socket.ConnectAsync(uri, CancellationToken.None).Wait(10000) || socket.State != WebSocketState.Open) throw new TimeoutException();
                        Status = "Connecté au mur de l'équipe";
                        backoff = 5;
                        feeds.Clear();
                        Send(socket, "{\"type\":\"view\",\"watch\":true,\"map\":false}");
                        var buffer = new byte[65536];
                        while (running && enabled() && socket.State == WebSocketState.Open)
                        {
                            using (var text = new System.IO.MemoryStream())
                            {
                                WebSocketReceiveResult part;
                                do
                                {
                                    var task = socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                                    // Nothing for 30 s: the room went quiet, the connection is opened again.
                                    if (!task.Wait(30000)) throw new TimeoutException();
                                    part = task.Result;
                                    if (part.MessageType == WebSocketMessageType.Close) throw new WebSocketException();
                                    text.Write(buffer, 0, part.Count);
                                } while (!part.EndOfMessage && text.Length < 4_000_000);
                                Heard(Encoding.UTF8.GetString(text.ToArray()), socket);
                            }
                        }
                        try { socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(2000); } catch { }
                    }
                }
                catch
                {
                    Status = "Coupé, nouvel essai dans " + backoff + " s";
                    View["EnDirect"] = false;
                    Thread.Sleep(backoff * 1000);
                    backoff = Math.Min(backoff * 2, 60);
                }
            }
        }

        static void Send(ClientWebSocket socket, string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait(5000);
        }

        // The relay's address with a pass from the site, null when the site has no relay.
        string Pass(LinkCode link)
        {
            try
            {
                using (var request = new HttpRequestMessage(HttpMethod.Get, link.Origin + "/api/combos/plugin/live/watch/pass"))
                {
                    request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", link.Token);
                    var response = client.SendAsync(request).GetAwaiter().GetResult();
                    if (!response.IsSuccessStatusCode) return null;
                    string url = (string)JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult())["url"];
                    return url != null && url.StartsWith("wss://") ? url : null;
                }
            }
            catch { return null; }
        }

        // hello: every feed; feed: one complete; patch: what changed in one; fast: our car's last frames.
        void Heard(string text, ClientWebSocket socket)
        {
            JObject message;
            try { message = JObject.Parse(text); } catch { return; }
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
                if (key == null || !feeds.TryGetValue(key, out var before)) { Send(socket, "{\"type\":\"view\",\"watch\":true,\"map\":false,\"again\":true}"); return; }
                feeds[key] = Patch(before, message["patch"]);
            }
            else if (type != "fast") return;
            // Our car's frames, kept for the pedal trace (the last Trace ones).
            if (message["tm"] is JArray tm) { frames.AddRange(tm); if (frames.Count > Trace) frames.RemoveRange(0, frames.Count - Trace); }
            try { View = Make(feeds.Values, frames); } catch { }
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
        // One value per property of the dash (dash/mur.html names them): texts ready to print, colours #AARRGGBB,
        // fractions 0..1, true/false. A value not set shows nothing.

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
        // A gap in seconds as the site writes it: +4,8, +1:14,9.
        static string Gap(double seconds) => seconds >= 60 ? "+" + (int)(seconds / 60) + ":" + (seconds % 60).ToString("00.0", Fr) : "+" + seconds.ToString("0.0", Fr);
        static string Clock(double seconds)
        {
            if (seconds < 0) seconds = 0;
            var t = TimeSpan.FromSeconds(seconds);
            return t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes}:{t.Seconds:00}";
        }

        // The site's pit wall colours (styles/pit-wall.css).
        public const string Text = "#FFF0F3FA", Text2 = "#FF9AA5C4", Muted = "#FF6E7A99", Red = "#FFFF3366", Green = "#FF00E676", Blue = "#FF00B0FF",
            Yellow = "#FFFFEA00", Purple = "#FFD500F9", Cyan = "#FF00E5FF", Orange = "#FFFF9100", Dark = "#FF111111", White = "#FFFFFFFF";

        public static string ClassColor(string cls)
        {
            string c = (cls ?? "").ToLowerInvariant();
            return c.Contains("hyper") ? "#FFFF3366" : c.Contains("lmp2") ? "#FF2F8CFF" : c.Contains("gt3") ? "#FFFFAB00" : c.Contains("lmp3") ? "#FFB07AFF" : Text2;
        }
        static string ClassName(string cls)
        {
            string c = (cls ?? "").ToLowerInvariant();
            return c.Contains("hyper") ? "Hypercar" : c.Contains("lmp2") ? "LMP2" : c.Contains("gt3") ? "LMGT3" : c.Contains("lmp3") ? "LMP3" : cls ?? "";
        }
        // A colour with another opacity (alpha 0..1), or mixed with black (k of the colour, as CSS color-mix with #000).
        static string Alpha(string argb, double alpha) => "#" + ((int)Math.Round(alpha * 255)).ToString("X2") + argb.Substring(3);
        static string Dim(string argb, double k)
        {
            int c(int at) => (int)Math.Round(Convert.ToInt32(argb.Substring(at, 2), 16) * k);
            return "#FF" + c(3).ToString("X2") + c(5).ToString("X2") + c(7).ToString("X2");
        }
        // The mockup's scales: tyre tread °C, brakes °C.
        static string TreadColor(double t) => t < 60 ? Blue : t < 75 ? Cyan : t <= 100 ? Green : t <= 110 ? Yellow : Red;
        static string BrakeColor(double t) => t < 250 ? Blue : t <= 650 ? Green : Orange;
        static string CompoundColor(string letter) => letter == "S" ? Red : letter == "M" ? Yellow : letter == "H" ? Text : letter == "W" ? Blue : Text2;

        // A compound's letter as the site writes it (S M H W), from the game's name.
        static string Letter(string name)
        {
            if (string.IsNullOrEmpty(name)) return "";
            string n = name.ToLowerInvariant();
            return n.Contains("wet") || n.Contains("rain") ? "W" : n.Contains("soft") ? "S" : n.Contains("hard") ? "H" : n.Contains("med") ? "M" : name.Substring(0, 1).ToUpperInvariant();
        }

        static readonly string[] Field = { "id", "place", "cls", "driver", "vehicle", "num", "laps", "dist", "pit", "stops", "pen", "last", "best",
            "ls1", "ls2", "bs1", "bs2", "cs1", "cs2", "behind", "lapsBehind", "next", "lapsNext", "finish", "x", "z", "tank", "cmp", "dmg", "veLap",
            "wcmp", "pst", "flag", "yellow", "outLaps", "lane", "box" };
        static int F(string name) => Array.IndexOf(Field, name);
        static JToken V(JToken row, string name) { int k = F(name); return row is JArray a && k >= 0 && k < a.Count ? a[k] : null; }
        static int Id(JArray row) => (int)(D(V(row, "id")) ?? -2);

        public const int Rows = 10, Dots = 40, Trace = 100;
        static readonly string[] Corners = { "AVG", "AVD", "ARG", "ARD" };
        static readonly string[] Sides = { "AVANT", "AVANT GAUCHE", "GAUCHE", "ARRIÈRE GAUCHE", "ARRIÈRE", "ARRIÈRE DROIT", "DROIT", "AVANT DROIT" };

        // The feed shown: the one of ours updated last (the car on track now). frames: our car's last frames, oldest first.
        public static WallView Make(IEnumerable<JToken> feedList, IList<JToken> frames)
        {
            var v = new WallView();
            var feed = feedList.OrderByDescending(f => D(f["updated"]) ?? 0).FirstOrDefault();
            if (feed == null) { v["Pilote"] = "Personne de l'équipe en piste"; return v; }
            var snap = feed["snap"] as JObject;
            var me = snap?["me"] as JObject;
            var rows = (snap?["field"] as JArray)?.OfType<JArray>().ToList();
            if (snap == null || me == null || rows == null) return v;
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            v["EnDirect"] = now - (D(feed["updated"]) ?? 0) < 20000;
            int myId = (int)(D(me["id"]) ?? -1);
            var mine = rows.FirstOrDefault(r => Id(r) == myId);
            var cars = feed["cars"] as JObject ?? new JObject();
            var ours = feed["ours"] as JObject ?? new JObject();
            var myInfo = cars[myId.ToString()] as JObject ?? new JObject();
            int session = (int)(D(snap["session"]) ?? 0);
            bool race = session >= 10 && session <= 13;
            double length = D(snap["length"]) ?? 0, et = D(snap["et"]) ?? 0;
            string myClass = S(me["cls"]);

            // ----- The band: who, pace, place, time, weather -----
            v["Numero"] = mine != null ? "#" + S(V(mine, "num")) : "";
            v["Pilote"] = S(me["driver"]); v["Voiture"] = S(me["vehicle"]);
            double? delta = D(me["delta"]);
            v["Chrono.Delta"] = Signed(delta, 3); v["Chrono.DeltaCouleur"] = delta < 0 ? Green : delta > 0 ? Red : Text;
            var lastSectors = myInfo["lastSectors"] as JArray;
            var bestSectors = ours["bestSectors"] as JArray;
            for (int k = 0; k < 3; k++)
            {
                double? last = D(lastSectors?[k]), best = D(bestSectors?[k]);
                v["Chrono.S" + (k + 1)] = N(last, 3);
                v["Chrono.S" + (k + 1) + "Couleur"] = last > 0 && best > 0 && Math.Abs(last.Value - best.Value) < 0.0005 ? Green : Text;
            }
            v["Chrono.Dernier"] = Lap(D(V(mine, "last"))); v["Chrono.Meilleur"] = Lap(D(V(mine, "best")));
            var cls = rows.Where(r => S(V(r, "cls")) == myClass).OrderBy(r => D(V(r, "place")) ?? 999).ToList();
            double classBest = cls.Select(r => D(V(r, "best")) ?? 0).Where(t => t > 0).DefaultIfEmpty(0).Min();
            v["Chrono.MeilleurCategorie"] = Lap(classBest);
            int myPlace = cls.FindIndex(r => Id(r) == myId) + 1;
            v["PlaceCourte"] = myPlace > 0 ? "P" + myPlace : "—"; v["PlaceSur"] = myPlace > 0 ? "/ " + cls.Count : "";
            v["PlaceNumero"] = myPlace > 0 ? myPlace.ToString() : "";
            double? end = D(snap["end"]);
            v["TempsRestant"] = end.HasValue && end > et && end < 1e6 ? Clock(end.Value - et) : "—";
            int lap = (int)(D(V(mine, "laps")) ?? 0) + 1;
            v["Tour"] = mine != null ? lap.ToString() : "—";
            double? pace = D(ours["avg5"]) ?? D(V(mine, "last")) ?? D(V(mine, "best"));
            double? lapsToGo = race && mine != null ? LapsLeft(snap, rows, mine, pace) : null;
            v["ToursRestants"] = lapsToGo.HasValue ? "· " + Math.Floor(lapsToGo.Value) + " restants" : "";
            double? rain = D(snap["rain"]);
            v["Meteo"] = rain > 0.05 ? "Pluie" : "Sec"; v["Pluie"] = U(rain * 100, 0, "%");
            v["TempPiste"] = D(snap["trackTemp"]) is double tt ? tt.ToString("0", Fr) + "°" : "—";
            v["TempAir"] = D(snap["air"]) is double air ? "/ " + air.ToString("0", Fr) + "°" : "";
            string sessionName = race ? "Course" : session >= 5 && session <= 8 ? "Qualifications" : session == 9 ? "Warm-up" : "Essais";
            v["PisteSeance"] = (S(snap["track"]) ?? "") + " · " + sessionName;

            // ----- Class standings: the rows around ours -----
            v["Classement.Titre"] = "🏆 CLASSEMENT " + ClassName(myClass).ToUpperInvariant();
            v["Classement.Nombre"] = cls.Count + " voitures";
            int first = Math.Max(0, Math.Min(myPlace - 1 - Rows / 2, cls.Count - Rows));
            for (int i = 0; i < Rows; i++)
            {
                string at = "Classement." + (i + 1) + ".";
                int index = first + i;
                v[at + "Visible"] = index < cls.Count;
                if (index >= cls.Count) continue;
                var car = cls[index];
                int id = Id(car);
                var info = cars[id.ToString()] as JObject ?? new JObject();
                bool us = id == myId;
                v[at + "Nous"] = us; v[at + "Pos"] = "P" + (index + 1); v[at + "Num"] = "#" + S(V(car, "num"));
                v[at + "Pilote"] = S(V(car, "driver")); v[at + "PiloteCouleur"] = Text;
                v[at + "Voiture"] = S(V(car, "vehicle")); v[at + "VoitureCouleur"] = us ? Text : Text2;
                string leader, ahead;
                if (index == 0) { leader = race ? "LEADER" : "—"; ahead = "—"; }
                else if (race)
                {
                    leader = D(info["leadLaps"]) is double ll && ll > 0 ? "+" + ll + " T" : D(info["lead"]) is double l ? Gap(l) : "—";
                    ahead = D(info["aheadLaps"]) is double al && al > 0 ? "+" + al + " T" : D(info["ahead"]) is double a ? Gap(a) : "—";
                }
                else
                {
                    double? best = D(V(car, "best")), leaderBest = D(V(cls[0], "best")), aheadBest = D(V(cls[index - 1], "best"));
                    leader = best > 0 && leaderBest > 0 ? Signed(best - leaderBest, 3) : "—";
                    ahead = best > 0 && aheadBest > 0 ? Signed(best - aheadBest, 3) : "—";
                }
                v[at + "Leader"] = leader; v[at + "LeaderCouleur"] = index == 0 && race ? Green : Text; v[at + "Devant"] = ahead;
                v[at + "Dernier"] = Lap(D(V(car, "last")));
                double? b = D(V(car, "best"));
                v[at + "Meilleur"] = Lap(b); v[at + "MeilleurCouleur"] = b > 0 && Math.Abs(b.Value - classBest) < 0.0005 ? Purple : Green;
                int pit = (int)(D(V(car, "pit")) ?? 0);
                v[at + "Relais"] = pit > 0 ? "—" : D(info["sinceStop"]) is double since ? since.ToString(Fr) + " t" : "—";
                string[] letters = Tyres(car, us ? S(me["compound"]) : null);
                for (int k = 0; k < 4; k++) { v[at + "Pneu" + (k + 1)] = letters[k]; v[at + "Pneu" + (k + 1) + "Couleur"] = CompoundColor(letters[k]); }
                double? outLaps = D(V(car, "outLaps"));
                v[at + "AuxStands"] = pit > 0;
                v[at + "Sortie"] = pit == 0 && outLaps.HasValue && outLaps < 3;
                v[at + "SortieTexte"] = outLaps.HasValue ? "SORTIE · " + (outLaps + 1) + "/3" : "";
            }

            // ----- Flat track: our car in the middle, the others where they are around it -----
            double Frac(JArray car) => length > 0 ? ((D(V(car, "dist")) ?? 0) / length % 1 + 1) % 1 : 0;
            double Run(JArray car) => (D(V(car, "laps")) ?? 0) + (length > 0 ? Math.Max(0, D(V(car, "dist")) ?? 0) / length : 0);
            double myFrac = mine != null ? Frac(mine) : 0;
            double Centre(double fraction) => ((fraction - myFrac + 0.5) % 1 + 1) % 1;
            var shown = rows.Where(r => (D(V(r, "pit")) ?? 0) != 2 && (D(V(r, "finish")) ?? 0) == 0 && Id(r) != myId).Take(Dots).ToList();
            for (int i = 0; i < Dots; i++)
            {
                string at = "Piste." + (i + 1) + ".";
                v[at + "Visible"] = i < shown.Count && length > 0 && mine != null;
                if (i >= shown.Count) continue;
                var car = shown[i];
                string carClass = S(V(car, "cls"));
                int place = rows.Where(r => S(V(r, "cls")) == carClass).OrderBy(r => D(V(r, "place")) ?? 999).ToList().FindIndex(r => Id(r) == Id(car)) + 1;
                double x = Centre(Frac(car));
                int laps = mine != null ? (int)Math.Round(Run(car) - Run(mine) - (x - 0.5)) : 0;
                bool inPit = (D(V(car, "pit")) ?? 0) == 1, sameClass = carClass == myClass;
                double alpha = laps < 0 ? 0.55 : 1;
                string colour = ClassColor(carClass);
                v[at + "X"] = Math.Round(x, 4); v[at + "Pos"] = place.ToString();
                v[at + "Couleur"] = Alpha(colour, alpha);
                v[at + "TexteCouleur"] = Alpha(inPit ? colour : carClass != null && carClass.ToLowerInvariant().Contains("gt3") ? Dark : White, alpha);
                v[at + "Leader"] = sameClass && place == 1; v[at + "Stand"] = inPit;
                v[at + "Badge"] = inPit ? "STAND" : sameClass && laps != 0 ? (laps > 0 ? "+" : "") + laps + "T" : "";
                v[at + "BadgeCouleur"] = inPit ? Orange : Text2;
            }
            // The line in its three sectors (fixed colours), from our best lap's sectors on our lap profile.
            double? s1 = null, s2 = null;
            var profile = me["profile"] as JArray;
            if (length > 0 && mine != null)
            {
                double? bs1 = D(V(mine, "bs1")), bs2 = D(V(mine, "bs2")), best = D(V(mine, "best"));
                if (profile != null && profile.Count == 101 && bs1 > 0 && bs2 > bs1 && best > bs2)
                {
                    s1 = FractionAt(profile, bs1.Value / best.Value * D(profile[100]).Value);
                    s2 = FractionAt(profile, bs2.Value / best.Value * D(profile[100]).Value);
                }
            }
            var sectors = s1.HasValue
                ? new[] { (0.0, s1.Value, "#FFC6FF00", "S1"), (s1.Value, s2.Value, White, "S2"), (s2.Value, 1.0, "#FF1DE9B6", "S3") }
                : new[] { (0.0, 1.0, White, "") };
            int piece = 0;
            for (int k = 0; k < 3; k++)
            {
                string name = "Piste.Nom" + (k + 1) + ".";
                v[name + "Visible"] = false;
                for (int copy = 0; copy < 2; copy++) v["Piste.Morceau" + (piece + copy + 1) + ".Visible"] = false;
                if (k >= sectors.Length || length <= 0 || mine == null) { piece += 2; continue; }
                var (from, to, colour, label) = sectors[k];
                int made = 0;
                foreach (int shift in new[] { -1, 0, 1 })
                {
                    double left = Math.Max(0, from + shift - myFrac + 0.5), right = Math.Min(1, to + shift - myFrac + 0.5);
                    if (right > left && made < 2)
                    {
                        string at = "Piste.Morceau" + (piece + made + 1) + ".";
                        v[at + "Visible"] = true; v[at + "X"] = Math.Round(left, 4); v[at + "Largeur"] = Math.Round(right - left, 4); v[at + "Couleur"] = colour;
                        made++;
                    }
                    double mid = (from + to) / 2 + shift - myFrac + 0.5;
                    if (label != "" && mid > 0.02 && mid < 0.98) { v[name + "Visible"] = true; v[name + "X"] = Math.Round(mid, 4); v[name + "Texte"] = label; v[name + "Couleur"] = colour; }
                }
                piece += 2;
            }
            v["Piste.ArriveeVisible"] = length > 0 && mine != null; v["Piste.Arrivee"] = Math.Round(Centre(0), 4);
            v["Piste.FinS1Visible"] = s1.HasValue; v["Piste.FinS1"] = s1.HasValue ? Math.Round(Centre(s1.Value), 4) : 0;
            v["Piste.FinS2Visible"] = s2.HasValue; v["Piste.FinS2"] = s2.HasValue ? Math.Round(Centre(s2.Value), 4) : 0;
            // How far ahead our class leader is on track (nothing when we lead).
            v["Piste.Leader"] = cls.Count > 0 && mine != null && Id(cls[0]) != myId && length > 0
                ? "LEADER " + ClassName(myClass).ToUpperInvariant() + " " + (((Frac(cls[0]) - myFrac) % 1 + 1) % 1 * length / 1000).ToString("0.0", Fr) + " KM DEVANT" : "";

            // ----- Relative: seconds on track at our pace, three ahead, us, three behind -----
            for (int i = 0; i < 7; i++) v["Relatif." + (i + 1) + ".Visible"] = false;
            if (mine != null)
            {
                Relative(v, 4, mine, myPlace, myClass, "", 0, false);
                v["Relatif.4.Dernier"] = Lap(D(V(mine, "last")));
            }
            if (pace > 0 && length > 0 && profile != null && profile.Count == 101 && mine != null)
            {
                double lapTime = pace.Value;
                double At(JArray car) => TimeAt(profile, Frac(car), lapTime);
                double mineAt = At(mine);
                var list = rows.Where(r => (D(V(r, "pit")) ?? 0) != 2 && Id(r) != myId).Select(r =>
                {
                    double gap = At(r) - mineAt;
                    gap = ((gap % lapTime) + lapTime * 1.5) % lapTime - lapTime / 2;
                    return (row: r, gap, laps: (int)Math.Round(Run(r) - Run(mine) - gap / lapTime));
                }).ToList();
                var ahead = list.Where(x => x.gap > 0).OrderBy(x => x.gap).Take(3).ToList();
                var behind = list.Where(x => x.gap <= 0).OrderByDescending(x => x.gap).Take(3).ToList();
                for (int i = 0; i < 3; i++)
                {
                    if (i < ahead.Count) Relative(v, 3 - i, ahead[i].row, Place(rows, ahead[i].row), S(V(ahead[i].row, "cls")), Signed(ahead[i].gap, 1), ahead[i].laps, true);
                    if (i < behind.Count) Relative(v, 5 + i, behind[i].row, Place(rows, behind[i].row), S(V(behind[i].row, "cls")), Signed(behind[i].gap, 1), behind[i].laps, true);
                }
            }

            // ----- Tyres and damage -----
            var wheels = me["wheels"] as JArray;
            var wear5 = ours["wear5"] as JArray;
            var lastWear = ours["lastWear"] as JArray;
            for (int i = 0; i < 4; i++)
            {
                string at = "Pneus." + Corners[i] + ".";
                var w = wheels?[i] as JObject;
                if (w == null) continue;
                double? left = D(w["left"]);
                double? used = left.HasValue ? 100 - left : null;
                string wearColour = used > 85 ? Red : used > 70 ? Orange : Green;
                bool flat = w["flat"]?.Type == JTokenType.Boolean && (bool)w["flat"];
                v[at + "Usure"] = used.HasValue ? used.Value.ToString("0.0", Fr) + "%" : "—"; v[at + "UsureCouleur"] = wearColour;
                v[at + "UsureFraction"] = used.HasValue ? Math.Max(0, Math.Min(1, used.Value / 100)) : 0;
                v[at + "Use"] = used > 70; v[at + "Alerte"] = flat || used > 85;
                var tread = (w["tread"] as JArray)?.Select(D).ToArray();
                string[] keys = { "Interieur", "Milieu", "Exterieur" };
                for (int k = 0; k < 3; k++)
                {
                    double? t = tread != null && tread.Length > k ? tread[k] : null;
                    v[at + keys[k]] = N(t, 0); v[at + keys[k] + "Couleur"] = t.HasValue ? Dim(TreadColor(t.Value), 0.7) : Dim(Text2, 0.5);
                }
                double? mean = tread != null && tread.All(t => t.HasValue) && tread.Length == 3 ? tread.Average() : null;
                v[at + "Bande"] = mean.HasValue ? mean.Value.ToString("0", Fr) + "°C" : "—";
                v[at + "BandeCouleur"] = mean.HasValue ? Dim(TreadColor(mean.Value), 0.65) : Dim(Text2, 0.4);
                double? brake = D(w["brake"]);
                v[at + "Frein"] = brake.HasValue ? brake.Value.ToString("0", Fr) + "°C" : "—";
                v[at + "FreinCouleur"] = brake.HasValue ? Dim(BrakeColor(brake.Value), 0.7) : Dim(Text2, 0.5);
                v[at + "Pression"] = N(D(w["kpa"]), 0);
                v[at + "UsureMoy5"] = U(D(wear5?[i]), 2, "%");
                v[at + "UsureDernier"] = U(D(lastWear?[i]), 2, "%");
            }
            var dents = me["dents"] as JArray;
            var hit = new List<string>();
            for (int z = 0; z < 8; z++)
            {
                int level = (int)(D(dents?[z]) ?? 0);
                v["Degats.Zone" + z] = level >= 2 ? Red : level >= 1 ? Orange : Text2;
                if (level > 0) hit.Add(Sides[z]);
            }
            bool wingOff = me["detached"]?.Type == JTokenType.Boolean && (bool)me["detached"];
            bool anyFlat = wheels != null && wheels.OfType<JObject>().Any(w => w["flat"]?.Type == JTokenType.Boolean && (bool)w["flat"]);
            v["Degats.Aileron"] = wingOff ? "Arraché" : "En place"; v["Degats.AileronCouleur"] = wingOff ? Red : Green;
            double damage = D(me["damage"]) ?? 0;
            double? repair = D((me["service"] as JObject)?["repair"]);
            v["Degats.Reparation"] = damage <= 0 ? "0 s" : repair.HasValue ? repair.Value.ToString("0", Fr) + " s" : "—";
            v["Degats.ReparationCouleur"] = damage <= 0 ? Green : Red;
            bool damaged = hit.Count > 0 || wingOff || anyFlat;
            v["Degats.Alerte"] = damaged;
            v["Degats.Texte"] = anyFlat ? "CREVAISON" : wingOff ? "AILERON ARRACHÉ" : hit.Count == 1 ? "DÉGÂTS " + hit[0] : hit.Count > 1 ? "DÉGÂTS · " + hit.Count + " ZONES" : "";
            string stint = D(myInfo["sinceStop"]) is double st ? st.ToString(Fr) : "—";
            v["PneusBandeau"] = ((S(me["compound"]) ?? "—") + " · " + stint + " tours").ToUpperInvariant();
            v["RelaisTexte"] = "RELAIS : TOUR " + stint;

            // ----- Energy and fuel -----
            double? ve = D(me["ve"]), fuel = D(me["fuel"]), capacity = D(me["capacity"]);
            double? ve5 = D(ours["ve5"]), fuel5 = D(ours["fuel5"]);
            if (ve < 0) ve = null;
            v["Energie.Valeur"] = U(ve, 1, "%"); v["Energie.Remplissage"] = ve.HasValue ? ve.Value / 100 : 0;
            v["Energie.DernierTour"] = U(D(ours["lastVe"]), 2, "%"); v["Energie.Moy5"] = U(ve5, 2, "%"); v["Energie.Relais"] = U(D(ours["stintVe"]), 2, "%");
            double? veLaps = ve.HasValue && ve5 > 0 ? ve / ve5 : null;
            v["Energie.ToursRestants"] = U(veLaps, 1, "t"); v["Energie.Alerte"] = veLaps < 2;
            v["Carburant.Valeur"] = U(fuel, 1, "L"); v["Carburant.Remplissage"] = fuel.HasValue && capacity > 0 ? Math.Min(1, fuel.Value / capacity.Value) : 0;
            v["Carburant.DernierTour"] = U(D(ours["lastFuel"]), 2, "L"); v["Carburant.Moy5"] = U(fuel5, 2, "L"); v["Carburant.Relais"] = U(D(ours["stintFuel"]), 2, "L");
            double? fuelLaps = fuel.HasValue && fuel5 > 0 ? fuel / fuel5 : null;
            v["Carburant.ToursRestants"] = U(fuelLaps, 1, "t"); v["Carburant.Alerte"] = fuelLaps < 2;
            v["Ratio"] = ve5 > 0 && fuel5 > 0 ? N(fuel5 / ve5, 2) : "—";
            // The stop: where the energy (or the fuel, the one that ends first) runs out at the 5-lap use; the target: what a lap
            // may use to reach that lap.
            double? limit = veLaps.HasValue && fuelLaps.HasValue ? Math.Min(veLaps.Value, fuelLaps.Value) : veLaps ?? fuelLaps;
            int whole = limit.HasValue ? (int)Math.Floor(limit.Value) : 0;
            v["ArretPrevu"] = limit.HasValue && mine != null ? "T" + (lap + whole) : "—";
            v["Cible"] = whole >= 1 ? (ve.HasValue ? U(ve / whole, 2, "%") : U(fuel / whole, 2, "L")) : "—";

            // ----- Settings (the advised column waits for the setting profiles) -----
            var control = me["control"] as JObject;
            v["Reglages.TC"] = N(D(control?["tc"]), 0); v["Reglages.Coupure"] = N(D(control?["cut"]), 0); v["Reglages.ABS"] = N(D(control?["abs"]), 0);
            v["Reglages.Carto"] = N(D(control?["map"]), 0); v["Reglages.Repartition"] = D(control?["bias"]) is double bias ? bias.ToString("0.0", Fr) + "%" : "—";
            v["Reglages.Regen"] = N(D(me["regen"]), 0); v["Reglages.Batterie"] = D(me["battery"]) is double bat ? bat.ToString("0", Fr) + "%" : "—";
            v["Preco.Visible"] = false; v["Preco.Profil"] = ""; v["Preco.Titre"] = ""; v["Preco.Texte"] = "";
            foreach (var key in new[] { "TC", "Coupure", "ABS", "Repartition", "Carto", "Regen" }) { v["Preco." + key] = ""; v["Preco." + key + "Couleur"] = Muted; }

            // ----- Inputs: the last frame (dist, km/h, throttle %, brake %, steer %, gear) and the last ones as a trace -----
            var list2 = frames?.OfType<JArray>().Where(f => f.Count >= 6).ToList() ?? new List<JArray>();
            var frame = list2.LastOrDefault();
            if (frame != null)
            {
                double throttle = D(frame[2]) ?? 0, brakeIn = D(frame[3]) ?? 0, steer = D(frame[4]) ?? 0;
                int gear = (int)(D(frame[5]) ?? 0);
                v["Entrees.Vitesse"] = N(D(frame[1]), 0); v["Entrees.Rapport"] = gear < 0 ? "R" : gear == 0 ? "N" : gear.ToString();
                v["Entrees.Gaz"] = Math.Max(0, Math.Min(1, throttle / 100)); v["Entrees.Frein"] = Math.Max(0, Math.Min(1, brakeIn / 100));
                v["Entrees.GazTexte"] = throttle.ToString("0", Fr) + "%"; v["Entrees.FreinTexte"] = brakeIn.ToString("0", Fr) + "%";
                v["Entrees.Volant"] = Math.Max(0, Math.Min(1, 0.5 + steer / 200));
                v["Entrees.VolantTexte"] = (steer > 0 ? "+" : "") + steer.ToString("0", Fr) + "%";
            }
            for (int k = 0; k < Trace; k++)
            {
                var f = k - (Trace - list2.Count) is int j && j >= 0 ? list2[j] : null;
                v["Entrees.Trace.Gaz." + k] = f != null ? Math.Max(0, Math.Min(1, (D(f[2]) ?? 0) / 100)) : 0;
                v["Entrees.Trace.Frein." + k] = f != null ? Math.Max(0, Math.Min(1, (D(f[3]) ?? 0) / 100)) : 0;
            }
            return v;
        }

        // A car's four compound letters: the game's per-wheel compounds when sent (« i.t » each), else front / rear names.
        static string[] Tyres(JArray car, string ownCompound)
        {
            string cmp = S(V(car, "cmp")) ?? ownCompound;
            if (cmp == null) return new[] { "", "", "", "" };
            var parts = cmp.Split('/');
            string front = Letter(parts[0].Trim()), rear = Letter(parts.Length > 1 ? parts[1].Trim() : parts[0].Trim());
            return new[] { front, front, rear, rear };
        }

        static int Place(List<JArray> rows, JArray car)
        {
            string cls = S(V(car, "cls"));
            return rows.Where(r => S(V(r, "cls")) == cls).OrderBy(r => D(V(r, "place")) ?? 999).ToList().FindIndex(r => Id(r) == Id(car)) + 1;
        }

        static void Relative(WallView v, int row, JArray car, int place, string cls, string gap, int laps, bool other)
        {
            string at = "Relatif." + row + ".", colour = ClassColor(cls);
            v[at + "Visible"] = true; v[at + "Pos"] = "P" + place; v[at + "Num"] = "#" + S(V(car, "num"));
            v[at + "Cat"] = ClassName(cls).ToUpperInvariant(); v[at + "CatCouleur"] = colour; v[at + "CatFond"] = Alpha(colour, 0.12); v[at + "CatBord"] = Alpha(colour, 0.6);
            v[at + "Pilote"] = S(V(car, "driver")); v[at + "Ecart"] = gap;
            v[at + "Tours"] = laps == 0 ? "" : (laps > 0 ? "+" : "−") + Math.Abs(laps) + " T";
            v[at + "TexteCouleur"] = laps < 0 ? Blue : laps > 0 ? Orange : Text;
            v[at + "Dernier"] = Lap(D(V(car, "last")));
            v[at + "Stands"] = other && (D(V(car, "pit")) ?? 0) == 1;
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
