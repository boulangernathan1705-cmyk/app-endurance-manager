// Mur des stands : pendant que le pilote roule, le plugin partage sa voiture et tout le classement avec son équipe,
// une fois par seconde, par une connexion WebSocket au site (GET /api/combos/plugin/live, server/live.mjs). Les
// coéquipiers le suivent sur la page « Mur des stands ». Le format est celui de shared/live.mjs (FIELD pour les lignes
// du classement, mergeSnapshot pour les changements). Activé par défaut, un interrupteur de l'écran du plugin le coupe.
//
// Quand une page regarde, la voiture est aussi lue trente fois par seconde (vitesse, pédales, volant, rapport ; dix
// avant la 2.4.0). Ces instants partent dix fois par seconde : avec l'envoi de chaque seconde, et entre deux dans un
// petit message rapide (Fast) qui porte aussi la position des voitures quand une page montre la carte. Le reste
// (classement, énergie, pneus…) part toujours une fois par seconde. Dix messages par seconde, seulement quand on regarde.
//
// Pour envoyer le moins possible : tout à l'ouverture de la connexion, puis seulement ce qui a changé. Le site dit si
// quelqu'un regarde (message « mode ») : personne, seulement ce que l'historique demande (tours, arrêts, pilotes…), et
// les positions des voitures seulement quand une page montre la carte.
//
// Tout vient de la même copie de la mémoire du jeu que l'enregistrement des séances (lue dix fois par seconde) ; en
// plus, l'API locale du jeu est lue toutes les 20 s pour les numéros des voitures, et une fois par circuit pour le
// tracé. L'envoi a son propre fil, en priorité minimale : une connexion lente ne retient jamais la lecture du jeu.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class LiveShare
    {
        const int ScoringInfo = 1632, VehScoring = 2192, VehSize = 584, MaxVehicles = 104,
            TelemetryOff = 128464, TelemInfo = 128468, TelemSize = 1888;
        const string Api = "http://localhost:6397/rest/";

        readonly Func<LinkCode> code;
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        // The track's map is big (250 Ko at Le Mans) and the game is slow to give it while driving: more time, and it is
        // asked again 20 s later when it did not come.
        readonly HttpClient mapClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        readonly AutoResetEvent wake = new AutoResetEvent(false);
        readonly object gate = new object();
        Snapshot pending;
        // The quick message between two snapshots (2.4.0): our car's last frames and, map shown, where the cars are.
        Dictionary<string, object> fastPending;
        // Our car thirty times a second while someone watches, sent with the next message (snapshot or quick one).
        // Each: metres into the lap, km/h, throttle %, brake %, steering %, gear.
        List<object[]> frames = new List<object[]>();
        DateTime offeredAt, retryAt;
        int backoff = 5;
        ClientWebSocket socket;
        volatile bool running = true, needMap;
        Thread sender;
        // What the site asks for: someone watching, someone on the map, everything again (it lost what it had).
        volatile bool watching = true, mapShown = true, needFull = true;
        // What the site has, on the sending thread: the changes are worked out against it.
        Dictionary<string, string> sentTop, sentMe;
        Dictionary<int, object[]> sentRows;
        DateTime sentFullAt, lastSentAt;

        // For the settings screen.
        public string Status { get; private set; } = "Pas encore partagé";
        public DateTime? SentAt { get; private set; }

        // Car numbers from the game's standings (slot → number), refreshed aside every 20 s.
        Dictionary<int, string> numbers = new Dictionary<int, string>();
        // Each driver's energy (or fuel) used on his last lap, % of the tank, from the game's strategy screen
        // (strategy/usage keeps every driver's level lap by lap, the other cars' too), read with the numbers.
        Dictionary<string, double> usage = new Dictionary<string, double>();
        DateTime numbersAt;
        int reading;
        // The track's outline from the game (watch/trackmap), once per track, kept when it matches the car's position.
        string mapTrack;
        List<double[]> mapPoints, mapRaw;
        // The time at each percent of the lap from the best lap driven, kept per car and track while SimHub runs:
        // the qualifying lap still serves in the race, and after a driver swap.
        readonly Dictionary<string, double[]> profiles = new Dictionary<string, double[]>();
        string veCar;
        bool hasEnergy;

        public LiveShare(Func<LinkCode> code)
        {
            this.code = code;
            sender = new Thread(SendLoop) { IsBackground = true, Name = "EnduranceManager.Live", Priority = ThreadPriority.Lowest };
            sender.Start();
        }

        public void Stop()
        {
            running = false;
            wake.Set();
        }

        static double F64(byte[] b, int at) => BitConverter.ToDouble(b, at);
        static int I32(byte[] b, int at) => BitConverter.ToInt32(b, at);
        static short I16(byte[] b, int at) => BitConverter.ToInt16(b, at);
        static string Text(byte[] b, int at, int size)
        {
            int end = Array.IndexOf(b, (byte)0, at, size);
            return Encoding.UTF8.GetString(b, at, (end < 0 ? at + size : end) - at).Trim();
        }
        static double? R(double value, int digits) => double.IsNaN(value) || double.IsInfinity(value) ? (double?)null : Math.Round(value, digits, MidpointRounding.AwayFromZero);
        // A lap or sector time, null when the game has none (-1 or 0).
        static double? T(double value) => value > 0 && value < 3600 ? R(value, 3) : null;

        // One snapshot of the game: the session (Top), our car (Me) and the field's rows (FIELD order, id first).
        class Snapshot
        {
            public Dictionary<string, object> Top, Me;
            public List<object[]> Field;
        }

        public bool Watching => watching;

        // Called on every reading of the game (thirty a second while watched, 2.4.0): kept only while a page watches,
        // at most 2 s of them.
        public void Frame(Sample s)
        {
            if (!watching) return;
            var frame = new object[] { R(s.LapDist, 0), R(s.Speed, 1), R(s.Throttle * 100, 0), R(s.BrakePedal * 100, 0), R(s.Steer * 100, 0), s.Gear };
            lock (gate) { frames.Add(frame); if (frames.Count > 60) frames.RemoveAt(0); }
        }

        // Nine times a second between two snapshots, while a page watches: the frames read since the last message and,
        // when a page shows the map, every car's position ([id, x, z] to the metre). Replaced if not sent yet.
        public void Fast(byte[] b)
        {
            if (!watching) return;
            List<object[]> positions = null;
            if (mapShown)
            {
                int count = Math.Min(I32(b, ScoringInfo + 104), MaxVehicles);
                positions = new List<object[]>(count);
                for (int i = 0; i < count; i++)
                {
                    int at = VehScoring + i * VehSize;
                    double x = F64(b, at + 264), z = F64(b, at + 280);
                    if (!double.IsNaN(x) && !double.IsNaN(z)) positions.Add(new object[] { I32(b, at), Math.Round(x), Math.Round(z) });
                }
            }
            lock (gate)
            {
                var message = new Dictionary<string, object> { ["v"] = 2, ["f"] = 1, ["et"] = R(F64(b, ScoringInfo + 68), 2) };
                if (frames.Count > 0) { message["tm"] = frames; frames = new List<object[]>(); }
                if (positions != null) message["pos"] = positions;
                if (fastPending != null && fastPending.TryGetValue("tm", out var older) && message.TryGetValue("tm", out var newer))
                    message["tm"] = ((List<object[]>)older).Concat((List<object[]>)newer).ToList();
                else if (fastPending != null && fastPending.ContainsKey("tm") && !message.ContainsKey("tm")) message["tm"] = fastPending["tm"];
                fastPending = message;
            }
            wake.Set();
        }

        // One snapshot from the copy of the game's memory, handed to the sending thread; the previous one, if not
        // sent yet, is replaced (only the latest state matters).
        public void Offer(byte[] b, Sample s, Recorder recorder, LmuApi api)
        {
            if (s.Control < 0 || s.Control > 1) return;
            Snapshot message;
            try { message = Build(b, s, recorder, api); } catch { return; }
            lock (gate) { pending = message; offeredAt = DateTime.Now; }
            wake.Set();
            if (DateTime.Now - numbersAt > TimeSpan.FromSeconds(20) && Interlocked.Exchange(ref reading, 1) == 0)
            {
                numbersAt = DateTime.Now;
                string track = s.Track;
                double x = s.X, z = s.Z;
                bool onTrack = !s.InPits && s.Speed > 50;
                ThreadPool.QueueUserWorkItem(_ => { try { ReadGame(track, x, z, onTrack); } catch { } finally { reading = 0; } });
            }
        }

        Snapshot Build(byte[] b, Sample s, Recorder recorder, LmuApi api)
        {
            int count = Math.Min(I32(b, ScoringInfo + 104), MaxVehicles);
            double length = F64(b, ScoringInfo + 88);
            bool positions = mapShown;
            var field = new List<object[]>(count);
            // Each car's telemetry slot, by id: the compound it runs and its body damage (8 zones, 0 to 2 each), as the
            // game shows them on track. To check online: whether LMU fills them for the other drivers' cars.
            var telemetry = new Dictionary<int, int>();
            for (int k = 0, active = Math.Min((int)b[TelemetryOff], MaxVehicles); k < active; k++) telemetry[I32(b, TelemInfo + k * TelemSize)] = TelemInfo + k * TelemSize;
            var used = usage;
            for (int i = 0; i < count; i++)
            {
                int at = VehScoring + i * VehSize, id = I32(b, at);
                string vehicle = Text(b, at + 36, 64), driver = Text(b, at + 4, 32);
                string compound = null;
                double? damage = null;
                if (telemetry.TryGetValue(id, out int t))
                {
                    string front = Text(b, t + 620, 18), rear = Text(b, t + 638, 18);
                    compound = front == "" ? null : rear == "" || rear == front ? front : front + " / " + rear;
                    int dents = 0;
                    for (int d = 0; d < 8; d++) dents += b[t + 544 + d];
                    damage = R(dents / 16.0 * 100, 0);
                }
                field.Add(new object[]
                {
                    id, b[at + 199], Text(b, at + 200, 32), Text(b, at + 4, 32), vehicle, Number(id, vehicle), I16(b, at + 100), R(F64(b, at + 104), 1),
                    b[at + 507] != 0 ? 2 : b[at + 198] != 0 ? 1 : 0, I16(b, at + 192), I16(b, at + 194), T(F64(b, at + 168)), T(F64(b, at + 144)),
                    T(F64(b, at + 152)), T(F64(b, at + 160)), T(F64(b, at + 128)), T(F64(b, at + 136)), T(F64(b, at + 176)), T(F64(b, at + 184)),
                    // The game's gaps are not sent: the site measures them on track (0 for a lapped car in LMU).
                    null, null, null, null, (sbyte)b[at + 103], positions ? R(F64(b, at + 264), 1) : null, positions ? R(F64(b, at + 280), 1) : null,
                    // What the game says the car has left in its tank (or of its virtual energy), 0 to 255.
                    R(b[at + 578] / 2.55, 1),
                    compound, damage, used.TryGetValue(DriverKey(driver), out double lap) ? R(lap, 2) : null
                });
            }
            // A car without virtual energy (LMP2) shows its fuel instead: energy counts once the game gave some.
            if (veCar != s.Car) { veCar = s.Car; hasEnergy = false; }
            if (s.Energy > 0.01) hasEnergy = true;
            var session = recorder.Current;
            string profileKey = s.Track + "|" + s.Car;
            if (session?.Trace != null && length > 100)
            {
                var made = Profile(session.Trace, length);
                if (made != null && (!profiles.TryGetValue(profileKey, out var known) || made[100] < known[100])) profiles[profileKey] = made;
            }
            profiles.TryGetValue(profileKey, out var profile);
            var service = api.Service;
            var top = new Dictionary<string, object>
            {
                ["track"] = s.Track, ["session"] = s.Session, ["et"] = R(F64(b, ScoringInfo + 68), 2), ["end"] = R(F64(b, ScoringInfo + 76), 1),
                ["maxLaps"] = I32(b, ScoringInfo + 84), ["length"] = R(length, 1), ["phase"] = b[ScoringInfo + 108], ["yellow"] = (sbyte)b[ScoringInfo + 109],
                ["air"] = R(s.AirTemp, 1), ["trackTemp"] = R(s.TrackTemp, 1), ["rain"] = R(s.Rain, 2), ["wet"] = s.Wet >= 0 && s.Wet <= 1 ? R(s.Wet, 2) : null,
                ["light"] = api.CurrentLight()
            };
            var me = new Dictionary<string, object>
            {
                ["id"] = s.Id, ["driver"] = s.Driver, ["car"] = s.Car, ["vehicle"] = s.Vehicle, ["cls"] = s.Class,
                ["compound"] = string.IsNullOrEmpty(s.RearCompound) || s.RearCompound == s.FrontCompound ? s.FrontCompound : s.FrontCompound + " / " + s.RearCompound,
                ["cur"] = R(s.IntoLap, 2), ["pit"] = s.Garage ? 2 : s.InPits ? 1 : 0, ["ve"] = hasEnergy ? R(s.Energy, 2) : null,
                ["fuel"] = R(s.Fuel, 2), ["capacity"] = R(s.FuelCapacity, 1),
                // Per wheel: wear, carcass, pressure, brake and (2.4.0) the tread's inner, middle and outer temperatures.
                ["wheels"] = s.Wheels.Select(w => new object[] { R(w.Wear * 100, 1), R(w.Temp, 0), R(w.Pressure, 1), R(w.Brake, 0),
                    new[] { R(w.TreadIn, 0), R(w.TreadMid, 0), R(w.TreadOut, 0) } }).ToArray(),
                // The eight dent zones, 0 to 2 each.
                ["damage"] = R(s.Damage / 16.0 * 100, 0),
                ["stops"] = (session?.Stops ?? new List<LiveStop>()).Select(stop => new Dictionary<string, object>
                {
                    ["lap"] = stop.Lap, ["lane"] = stop.Lane, ["stopped"] = stop.Stationary, ["ve"] = stop.Energy, ["fuel"] = stop.Fuel,
                    ["tyres"] = stop.Tyres, ["drive"] = Drive(stop, profile, length), ["driver"] = stop.Driver
                }).ToArray(),
                ["service"] = service == null ? null : new Dictionary<string, object>
                {
                    ["connect"] = service.Connect, ["energyRate"] = service.EnergyRate, ["fuelRate"] = service.FuelRate, ["tyres4"] = service.Tyres4,
                    ["tyresAlong"] = service.TyresAlong, ["driver"] = service.Driver, ["driverAlong"] = service.DriverAlong
                },
                ["profile"] = profile,
                // The settings in the car (levels, 0 steps: the car has none), the hybrid and the track limits.
                ["control"] = new Dictionary<string, object>
                {
                    ["tc"] = Level(s.TC, s.TCMax), ["cut"] = Level(s.TCCut, s.TCCutMax), ["slip"] = Level(s.TCSlip, s.TCSlipMax), ["abs"] = Level(s.ABS, s.ABSMax),
                    ["map"] = Level(s.MotorMap, s.MotorMapMax), ["mig"] = Level(s.Migration, s.MigrationMax),
                    ["arbF"] = Level(s.AntiSwayFront, s.AntiSwayFrontMax), ["arbR"] = Level(s.AntiSwayRear, s.AntiSwayRearMax),
                    ["bias"] = s.RearBrakeBias > 0 && s.RearBrakeBias < 1 ? R((1 - s.RearBrakeBias) * 100, 1) : null
                },
                ["limits"] = b[ScoringInfo + 352] > 0 ? R((double)s.TrackLimitsSteps / b[ScoringInfo + 352], 2) : null,
                ["battery"] = s.Battery > 0 ? R(s.Battery * 100, 1) : null, ["regen"] = R(s.Regen, 1), ["delta"] = R(s.DeltaBest, 2),
                ["water"] = R(s.Water, 1), ["oil"] = R(s.Oil, 1)
            };
            // The outline once per connection (the room keeps it).
            if (needMap && mapPoints != null && mapTrack == s.Track) { top["map"] = mapPoints; needMap = false; }
            return new Snapshot { Top = top, Me = me, Field = field };
        }

        static int? Level(int level, int max) => max > 0 ? level : (int?)null;

        // ---------- Only what changed ----------

        // While nobody watches: the field's values the history needs (place, names, laps, pit, stops, penalties, lap
        // and sector times, finish), not where the cars are; our car's in full only when its lap or pit state changes.
        static readonly HashSet<int> HistoryValues = new HashSet<int> { 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 23, 27, 28, 29 };
        static readonly HashSet<string> SteadyMe = new HashSet<string> { "id", "driver", "car", "vehicle", "cls", "compound", "pit", "stops", "service", "profile" };

        // The message for the site: everything (version 2, full), or only what changed since the last one (null when
        // nothing worth sending changed: then a sign of life every 15 s). Our car's last second goes with it while watched.
        string Encode(Snapshot snap, List<object[]> moments)
        {
            bool withFrames = moments != null && moments.Count > 0;
            var now = DateTime.Now;
            if (needFull || sentRows == null || now - sentFullAt > TimeSpan.FromMinutes(5))
            {
                needFull = false;
                sentFullAt = lastSentAt = now;
                sentTop = snap.Top.ToDictionary(kv => kv.Key, kv => JsonConvert.SerializeObject(kv.Value));
                sentMe = snap.Me.ToDictionary(kv => kv.Key, kv => JsonConvert.SerializeObject(kv.Value));
                sentRows = snap.Field.ToDictionary(row => (int)row[0], row => (object[])row.Clone());
                var all = new Dictionary<string, object>(snap.Top) { ["v"] = 2, ["full"] = true, ["me"] = snap.Me, ["field"] = snap.Field };
                if (withFrames) all["tm"] = moments;
                return JsonConvert.SerializeObject(all);
            }
            bool watched = watching, changed = false;
            var message = new Dictionary<string, object> { ["v"] = 2, ["et"] = snap.Top["et"] };
            foreach (var kv in snap.Top)
            {
                if (kv.Key == "et") continue;
                string json = JsonConvert.SerializeObject(kv.Value);
                if (sentTop.TryGetValue(kv.Key, out var known) && known == json) continue;
                sentTop[kv.Key] = json;
                message[kv.Key] = kv.Value;
                changed = true;
            }
            // The field: again in full when its cars changed, else per car [id, index, value, index, value…].
            int ourId = Convert.ToInt32(snap.Me["id"]);
            bool ourHistory = false;
            if (snap.Field.Count != sentRows.Count || snap.Field.Any(row => !sentRows.ContainsKey((int)row[0])))
            {
                sentRows = snap.Field.ToDictionary(row => (int)row[0], row => (object[])row.Clone());
                message["field"] = snap.Field;
                changed = ourHistory = true;
            }
            else
            {
                var changes = new List<object[]>();
                foreach (var row in snap.Field)
                {
                    int id = (int)row[0];
                    var sent = sentRows[id];
                    List<object> change = null;
                    for (int k = 1; k < row.Length; k++)
                    {
                        if (Equals(row[k], sent[k]) || (!watched && !HistoryValues.Contains(k))) continue;
                        if (change == null) change = new List<object> { id };
                        change.Add(k);
                        change.Add(row[k]);
                        sent[k] = row[k];
                        if (id == ourId && HistoryValues.Contains(k)) ourHistory = true;
                    }
                    if (change != null) changes.Add(change.ToArray());
                }
                if (changes.Count > 0) { message["fd"] = changes; changed = true; }
            }
            var me = new Dictionary<string, object>();
            foreach (var kv in snap.Me)
            {
                if (!watched && !ourHistory && !SteadyMe.Contains(kv.Key)) continue;
                string json = JsonConvert.SerializeObject(kv.Value);
                if (sentMe.TryGetValue(kv.Key, out var known) && known == json) continue;
                sentMe[kv.Key] = json;
                me[kv.Key] = kv.Value;
            }
            if (me.Count > 0) { message["me"] = me; changed = true; }
            // Watched: every second (the game's clock moves the page's). Else only when something changed.
            if (withFrames) message["tm"] = moments;
            if (!watched && !changed && now - lastSentAt < TimeSpan.FromSeconds(15)) return null;
            lastSentAt = now;
            return JsonConvert.SerializeObject(message);
        }

        // What the site says: {type:'mode', watch, map} or {type:'full'}.
        void Heard(string text)
        {
            JObject said;
            try { said = JObject.Parse(text); } catch { return; }
            var type = said["type"]?.ToString();
            if (type == "full") needFull = true;
            else if (type == "mode")
            {
                watching = said["watch"]?.Type == JTokenType.Boolean ? (bool)said["watch"] : true;
                mapShown = said["map"]?.Type == JTokenType.Boolean ? (bool)said["map"] : true;
            }
            else return;
            wake.Set();
        }

        // Seconds from the line at each percent of the lap, from the best lap's points (time and distance).
        static double[] Profile(LapTrace trace, double length)
        {
            if (trace.Dist.Count < 50 || trace.Time <= 0) return null;
            var times = new double[101];
            int j = 0;
            for (int k = 0; k < 100; k++)
            {
                double target = k / 100.0 * length;
                while (j < trace.Dist.Count - 1 && trace.Dist[j + 1] < target) j++;
                if (j >= trace.Dist.Count - 1) return null;
                double d0 = trace.Dist[j], d1 = trace.Dist[j + 1];
                double f = d1 > d0 ? Math.Max(0, Math.Min(1, (target - d0) / (d1 - d0))) : 0;
                times[k] = trace.Clock[j] + (trace.Clock[j + 1] - trace.Clock[j]) * f;
            }
            times[0] = 0;
            times[100] = trace.Time;
            for (int k = 1; k <= 100; k++) if (times[k] < times[k - 1]) return null;
            return times.Select(t => Math.Round(t, 2)).ToArray();
        }

        // What the lane costs on top of the same stretch at racing speed (the stretch from our best lap), without the
        // time stopped: the part of a stop that does not depend on the service.
        static double? Drive(LiveStop stop, double[] profile, double length)
        {
            if (profile == null || length <= 100) return null;
            double At(double dist) { double x = Math.Max(0, Math.Min(0.99999, dist / length)) * 100; int k = (int)x; return profile[k] + (profile[k + 1] - profile[k]) * (x - k); }
            double stretch = At(stop.ExitDist) - At(stop.EntryDist);
            if (stretch < 0) stretch += profile[100];
            double drive = stop.Lane - stop.Stationary - stretch;
            return drive > -30 && drive < 300 ? Math.Round(drive, 2) : (double?)null;
        }

        static readonly Regex HashNumber = new Regex(@"#\s*(\d{1,4})");
        string Number(int id, string vehicle)
        {
            var known = numbers;
            if (known.TryGetValue(id, out var number)) return number;
            var match = HashNumber.Match(vehicle ?? "");
            return match.Success ? match.Groups[1].Value : "";
        }

        static JToken Get(HttpClient client, string path)
        {
            try { return JToken.Parse(client.GetStringAsync(Api + path).GetAwaiter().GetResult()); }
            catch { return null; }
        }

        static double? Value(JToken token) => token != null && (token.Type == JTokenType.Float || token.Type == JTokenType.Integer) ? (double)token : (double?)null;

        // A driver's name as both the scoring and the strategy screen give it (« Lewis Evans#2652 » there).
        static string DriverKey(string name)
        {
            int hash = (name ?? "").IndexOf('#');
            return (hash < 0 ? name ?? "" : name.Substring(0, hash)).Trim().ToLowerInvariant();
        }

        // The game's standings for the car numbers, every driver's last lap from the strategy screen, and its map of the track once per track.
        void ReadGame(string track, double x, double z, bool onTrack)
        {
            var standings = Get(client, "watch/standings");
            var list = standings as JArray ?? standings?.Children<JProperty>().Select(p => p.Value).OfType<JArray>().FirstOrDefault();
            if (list != null)
            {
                var found = new Dictionary<int, string>();
                foreach (var car in list.OfType<JObject>())
                {
                    var slot = Value(car["slotID"] ?? car["slotId"] ?? car["id"]);
                    var number = car["carNumber"] ?? car["vehicleNumber"] ?? car["number"];
                    if (slot.HasValue && number != null && number.Type != JTokenType.Null && number.ToString().Trim() != "") found[(int)slot.Value] = number.ToString().Trim();
                }
                if (found.Count > 0) numbers = found;
            }
            var levels = Get(client, "strategy/usage") as JObject;
            if (levels != null)
            {
                var found = new Dictionary<string, double>();
                foreach (var driver in levels.Properties())
                {
                    // The last two laps in a row, the second away from the pits: the drop of the level between them.
                    var laps = (driver.Value as JArray)?.OfType<JObject>().Where(l => Value(l["lap"]).HasValue && Value(l["ve"]).HasValue)
                        .OrderBy(l => Value(l["lap"]).Value).ToList();
                    if (laps == null || laps.Count < 2) continue;
                    JObject before = laps[laps.Count - 2], last = laps[laps.Count - 1];
                    double drop = (Value(before["ve"]).Value - Value(last["ve"]).Value) * 100;
                    if (Value(last["lap"]) - Value(before["lap"]) == 1 && (bool?)last["pit"] != true && drop > 0 && drop < 50) found[DriverKey(driver.Name)] = drop;
                }
                usage = found;
            }
            if (mapTrack != track) { mapTrack = track; mapRaw = null; mapPoints = null; }
            if (mapRaw == null && mapPoints == null)
            {
                var answer = Get(mapClient, "watch/trackmap");
                var points = answer as JArray ?? answer?.Children<JProperty>().Select(p => p.Value).OfType<JArray>().FirstOrDefault();
                var items = points?.OfType<JObject>().Where(p => Value(p["x"]).HasValue && Value(p["z"]).HasValue).ToList();
                if (items != null && items.Count >= 100)
                {
                    // The track itself: the most frequent kind of point (the others are the pit lane and such).
                    var main = items.GroupBy(p => p["type"]?.ToString() ?? "").OrderByDescending(g => g.Count()).First().ToList();
                    mapRaw = main.Select(p => new[] { Value(p["x"]).Value, Value(p["y"]) ?? 0, Value(p["z"]).Value }).ToList();
                }
                // No answer (too slow, game busy): asked again at the next read. A game that answers without points has no map.
                else if (answer != null) mapRaw = new List<double[]>();
            }
            // Which of the map's axes match the car's (x, z) seen from above: the one passing within 25 m of the car.
            if (mapPoints == null && mapRaw != null && mapRaw.Count >= 100 && onTrack)
            {
                var variants = new Func<double[], double[]>[] { p => new[] { p[0], p[2] }, p => new[] { p[0], p[1] }, p => new[] { p[0], -p[2] }, p => new[] { p[0], -p[1] } };
                foreach (var variant in variants)
                {
                    double best = mapRaw.Min(p => { var q = variant(p); return (q[0] - x) * (q[0] - x) + (q[1] - z) * (q[1] - z); });
                    if (best > 25 * 25) continue;
                    int step = Math.Max(1, mapRaw.Count / 600);
                    mapPoints = mapRaw.Where((p, i) => i % step == 0).Select(p => variant(p).Select(v => Math.Round(v, 1)).ToArray()).ToList();
                    needMap = true;
                    break;
                }
            }
        }

        // ---------- Sending ----------

        void SendLoop()
        {
            while (running)
            {
                wake.WaitOne(2000);
                Snapshot snap;
                List<object[]> last;
                Dictionary<string, object> fast;
                lock (gate)
                {
                    snap = pending; pending = null; fast = fastPending; fastPending = null;
                    last = frames; frames = new List<object[]>();
                    // A quick message not sent yet: its frames go with the snapshot, or back with the next quick one.
                    if (fast != null && fast.TryGetValue("tm", out var early)) last = ((List<object[]>)early).Concat(last).ToList();
                    if (snap == null && fast != null) { if (last.Count > 0) fast["tm"] = last; else fast.Remove("tm"); last = new List<object[]>(); }
                }
                if (snap == null && fast != null)
                {
                    // Only on a connection already open, and only while a page watches.
                    if (socket == null || socket.State != WebSocketState.Open || !watching) continue;
                    try
                    {
                        var quick = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(fast));
                        if (!socket.SendAsync(new ArraySegment<byte>(quick), WebSocketMessageType.Text, true, CancellationToken.None).Wait(2000)) throw new TimeoutException();
                    }
                    catch { Drop("Coupé, nouvel essai dans " + backoff + " s"); }
                    continue;
                }
                if (snap == null)
                {
                    // Nothing to send for a minute (out of the car, game closed): the connection is let go.
                    if (socket != null && DateTime.Now - offeredAt > TimeSpan.FromSeconds(60)) { Close(); Status = "En attente : partage dès que tu roules"; }
                    continue;
                }
                try
                {
                    if (!Open()) continue;
                    string message = Encode(snap, watching ? last : null);
                    if (message == null) continue;
                    var bytes = Encoding.UTF8.GetBytes(message);
                    if (!socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait(5000)) throw new TimeoutException();
                    SentAt = DateTime.Now;
                    backoff = 5;
                    Status = watching ? "En direct avec l'équipe" : "Connecté, personne ne regarde : envoi réduit";
                }
                catch { Drop("Coupé, nouvel essai dans " + backoff + " s"); }
            }
            Close();
        }

        bool Open()
        {
            if (socket != null && socket.State == WebSocketState.Open) return true;
            if (DateTime.Now < retryAt) return false;
            var link = code();
            if (link == null) { Status = "Colle ton code de liaison pour partager"; retryAt = DateTime.Now.AddSeconds(30); return false; }
            Close();
            var opened = new ClientWebSocket();
            opened.Options.SetRequestHeader("Authorization", "Bearer " + link.Token);
            opened.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            var uri = new Uri(RelayUrl(link) ?? Regex.Replace(link.Origin, "^https://", "wss://") + "/api/combos/plugin/live");
            if (!opened.ConnectAsync(uri, CancellationToken.None).Wait(10000) || opened.State != WebSocketState.Open) { opened.Dispose(); throw new TimeoutException(); }
            socket = opened;
            // A new connection: everything again, as if watched with the map until the site says otherwise.
            needMap = needFull = watching = mapShown = true;
            ThreadPool.QueueUserWorkItem(_ => Listen(opened));
            return true;
        }

        // The relay's address with a pass from the site, when the site has a relay (a second Cloudflare account, so the
        // live never weighs on the site); null otherwise, and the plugin connects to the site itself.
        string RelayUrl(LinkCode link)
        {
            try
            {
                using (var request = new HttpRequestMessage(HttpMethod.Get, link.Origin + "/api/combos/plugin/live/pass"))
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

        // The site's messages, until it closes the connection (then it is let go, and opened again at the next snapshot).
        void Listen(ClientWebSocket opened)
        {
            var buffer = new byte[4096];
            try
            {
                while (opened.State == WebSocketState.Open)
                {
                    using (var text = new System.IO.MemoryStream())
                    {
                        WebSocketReceiveResult part;
                        do
                        {
                            part = opened.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None).GetAwaiter().GetResult();
                            if (part.MessageType == WebSocketMessageType.Close) throw new WebSocketException();
                            text.Write(buffer, 0, part.Count);
                        } while (!part.EndOfMessage && text.Length < 65536);
                        Heard(Encoding.UTF8.GetString(text.ToArray()));
                    }
                }
            }
            catch { }
            if (socket == opened) try { opened.Abort(); } catch { }
        }

        void Drop(string status)
        {
            Close();
            retryAt = DateTime.Now.AddSeconds(backoff);
            Status = status;
            backoff = Math.Min(backoff * 2, 60);
        }

        void Close()
        {
            var old = socket;
            socket = null;
            if (old == null) return;
            try { if (old.State == WebSocketState.Open) old.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(2000); } catch { }
            try { old.Dispose(); } catch { }
        }
    }
}
