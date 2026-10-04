using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using GameReaderCommon;
using Newtonsoft.Json;
using SimHub.Plugins;

namespace EnduranceManager
{
    // Prototype: compile against the installed SDK and validate mappings in LMU before distributing.
    // All disk/network work runs off the simulator's DataUpdate path.
    [PluginName("Endurance Manager — préparation (prototype)")]
    [PluginAuthor("Endurance Manager")]
    [PluginDescription("Collecte de résumés de tours pour la préparation de l’équipage.")]
    public sealed class PreparationPlugin : IPlugin, IDataPlugin
    {
        public PluginManager PluginManager { get; set; }
        private readonly object gate = new object();
        private readonly HttpClient http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(10) };
        private readonly Queue<Capture> pending = new Queue<Capture>();
        private Timer timer;
        private Connection connection;
        private Target target;
        private Mapping mapping;
        private string folder;
        private Capture session;
        private int previousLap = -1, uploading;
        private DateTime lastSample = DateTime.MinValue;
        private double? fuelStart, energyStart;
        private bool pit, wet, night, continuous, flagsKnown, conditionWetKnown, conditionNightKnown, pauseKnown;

        public void Init(PluginManager pluginManager)
        {
            PluginManager = pluginManager;
            folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnduranceManager", "SimHub");
            Directory.CreateDirectory(folder);
            var config = Path.Combine(folder, "EnduranceManager.connection.json");
            if (!File.Exists(config)) return;
            connection = JsonConvert.DeserializeObject<Connection>(File.ReadAllText(config));
            // A downloaded config cannot turn this collector into an arbitrary HTTP client.
            Uri endpoint;
            if (connection == null || !Uri.TryCreate(connection.endpoint, UriKind.Absolute, out endpoint)
                || endpoint.Scheme != "https" || !string.IsNullOrEmpty(endpoint.UserInfo)
                || !(endpoint.Host == "endurance-manager.app" || endpoint.Host.EndsWith(".endurance-manager.app", StringComparison.OrdinalIgnoreCase))
                || endpoint.AbsolutePath != "/" || !string.IsNullOrEmpty(endpoint.Query) || !string.IsNullOrEmpty(endpoint.Fragment)
                || !System.Text.RegularExpressions.Regex.IsMatch(connection.token ?? "", "^[a-f0-9]{64}$")) return;
            var mappingFile = Path.Combine(folder, "mapping.json");
            mapping = File.Exists(mappingFile) ? JsonConvert.DeserializeObject<Mapping>(File.ReadAllText(mappingFile)) : new Mapping();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", connection.token);
            timer = new Timer(_ => { var ignored = Sync(); }, null, 0, 15000);
        }

        // Reads public normalized data only. Field names are isolated in an explicit mapping for validation.
        private static object Read(object source, string name)
        {
            if (source == null || string.IsNullOrEmpty(name)) return null;
            return source.GetType().GetProperty(name)?.GetValue(source, null);
        }
        private static double? Number(object value)
        {
            if (value == null) return null;
            if (value is TimeSpan) return ((TimeSpan)value).TotalSeconds;
            double result; return double.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out result) && !double.IsNaN(result) && !double.IsInfinity(result) ? result : (double?)null;
        }
        private static bool? Flag(object value) { return value is bool ? (bool?)value : null; }
        private static string Normal(string value) { return new string((value ?? "").ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray()); }
        private static double? Used(double? start, double? end) { return start.HasValue && end.HasValue && start >= end ? start-end : null; }

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            if (mapping == null) return;
            var at = DateTime.UtcNow;
            if ((at-lastSample).TotalSeconds < 1) return;
            var gap = lastSample != DateTime.MinValue && (at-lastSample).TotalSeconds > 3;
            lastSample = at;
            try
            {
                lock (gate)
                {
                    if (!data.GameRunning || data.NewData == null || target == null) { previousLap = -1; session = null; return; }
                    object source = data.NewData;
                    var track = Convert.ToString(Read(source, mapping.track));
                    var car = Convert.ToString(Read(source, mapping.car));
                    var game = Convert.ToString(Read(data, mapping.game));
                    // No fuzzy match: a different layout/car must never train the wrong objective.
                    if (Normal(track) != Normal(mapping.trackName ?? target.circuitName)
                        || Normal(car) != Normal(mapping.carName ?? target.car)
                        || Normal(game) != Normal(mapping.gameName ?? (target.game == "lmu" ? "LeMansUltimate" : "IRacing")))
                    { previousLap = -1; session = null; return; }
                    var count = Number(Read(source, mapping.completedLaps));
                    if (!count.HasValue || count < 0 || count != Math.Floor(count.Value)) return;
                    int lap = (int)count.Value;
                    if (session == null || lap < previousLap)
                    {
                        session = new Capture { crewId = connection.crewId, clientId = Guid.NewGuid().ToString(), game = target.game,
                            circuit = target.circuit, car = target.car, startedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
                        previousLap = lap;
                        Reset(source, false); // Connecting in the middle of a lap cannot yield a complete first lap.
                        return;
                    }
                    var inPit = Flag(Read(source, mapping.inPit));
                    var isPaused = Flag(Read(source, mapping.paused));
                    var isWet = Flag(Read(source, mapping.wet));
                    var isNight = Flag(Read(source, mapping.night));
                    if (lap == previousLap)
                    {
                        flagsKnown &= inPit.HasValue; pit |= inPit == true;
                        pauseKnown &= isPaused.HasValue; continuous &= !gap && isPaused == false;
                        conditionWetKnown &= isWet.HasValue; wet |= isWet == true;
                        conditionNightKnown &= isNight.HasValue; night |= isNight == true;
                        return;
                    }
                    var seconds = Number(Read(source, mapping.lastLapTime));
                    if (lap == previousLap+1 && seconds >= 10 && seconds <= 3600)
                    {
                        var record = new Lap { number = lap, seconds = seconds.Value,
                            valid = Flag(Read(source, mapping.previousLapValid)), pit = flagsKnown ? (bool?)pit : null,
                            continuous = pauseKnown ? (bool?)continuous : null, wet = conditionWetKnown ? (bool?)wet : null,
                            night = conditionNightKnown ? (bool?)night : null,
                            fuelUsed = !pit && continuous ? Used(fuelStart, Number(Read(source, mapping.fuel))) : null,
                            energyUsed = !pit && continuous ? Used(energyStart, Number(Read(source, mapping.energy))) : null };
                        pending.Enqueue(session.WithLap(record));
                    }
                    previousLap = lap; Reset(source, true);
                }
            }
            catch { /* Unsupported data remains unmeasured. Never throw into SimHub's update callback. */ }
        }
        private void Reset(object source, bool full)
        {
            var p = Flag(Read(source, mapping.inPit)), w = Flag(Read(source, mapping.wet)), n = Flag(Read(source, mapping.night)), paused = Flag(Read(source, mapping.paused));
            flagsKnown=p.HasValue; pit=p==true; conditionWetKnown=w.HasValue; wet=w==true; conditionNightKnown=n.HasValue; night=n==true;
            pauseKnown=paused.HasValue; continuous=full && paused==false;
            fuelStart=Number(Read(source,mapping.fuel)); energyStart=Number(Read(source,mapping.energy));
        }
        private async Task Sync()
        {
            if (Interlocked.Exchange(ref uploading, 1) != 0) return;
            try
            {
                List<Capture> batch;
                lock(gate) { batch=pending.ToList(); pending.Clear(); }
                foreach(var capture in batch)
                {
                    var path=Path.Combine(folder,capture.clientId+"-"+capture.laps[0].number+".json");
                    File.WriteAllText(path+".tmp",JsonConvert.SerializeObject(capture));
                    if(File.Exists(path))File.Delete(path);File.Move(path+".tmp",path);
                }
                using(var response=await http.GetAsync(connection.endpoint+"/api/preparation/collector/target?crew="+Uri.EscapeDataString(connection.crewId)))
                {
                    if(!response.IsSuccessStatusCode){lock(gate){target=null;}return;}
                    var current=JsonConvert.DeserializeObject<Target>(await response.Content.ReadAsStringAsync());
                    lock(gate){if(target!=null&&(target.car!=current.car||target.circuit!=current.circuit||target.game!=current.game)){session=null;previousLap=-1;}target=current;}
                }
                // Durable per-lap queue. HTTP retries use the same clientId and lap number (server deduplicates).
                foreach(var path in Directory.GetFiles(folder,"*.json").Where(p=>Path.GetFileName(p)!="mapping.json"&&Path.GetFileName(p)!="EnduranceManager.connection.json").OrderBy(p=>p).Take(20))
                {
                    var capture=JsonConvert.DeserializeObject<Capture>(File.ReadAllText(path));
                    if(capture?.laps==null)continue;
                    if(capture.startedAt<DateTimeOffset.UtcNow.AddDays(-60).ToUnixTimeMilliseconds()){File.Delete(path);continue;}
                    using(var response=await http.PostAsync(connection.endpoint+"/api/preparation/collector/laps",new StringContent(JsonConvert.SerializeObject(capture),Encoding.UTF8,"application/json")))
                    { if(response.IsSuccessStatusCode)File.Delete(path);else break; }
                }
            }
            catch { /* Offline queue stays local; no credentials or payloads in logs. */ }
            finally { Volatile.Write(ref uploading,0); }
        }
        public void End(PluginManager pluginManager)
        {
            timer?.Dispose();
            // Do not block SimHub shutdown on a network request. Persist pending laps locally.
            lock(gate)
            {
                foreach(var capture in pending)
                {
                    try { File.WriteAllText(Path.Combine(folder,capture.clientId+"-"+capture.laps[0].number+".json"),JsonConvert.SerializeObject(capture)); }
                    catch { /* Shutdown remains safe if the disk is unavailable. */ }
                }
                pending.Clear();
            }
            http.Dispose();
        }
    }
    public sealed class Connection { public string endpoint, token, crewId; }
    public sealed class Target { public string game, circuit, circuitName, car; }
    public sealed class Mapping
    {
        public string game="GameName", track="TrackName", car="CarModel", completedLaps="CompletedLaps", lastLapTime="LastLapTime", fuel="Fuel";
        // Optional flags MUST be verified before mapping; missing values intentionally stay null.
        public string previousLapValid, inPit, paused, wet, night, energy, trackName, carName, gameName;
    }
    public sealed class Lap { public int number; public double seconds; public bool? valid,pit,continuous,wet,night; public double? fuelUsed,energyUsed; }
    public sealed class Capture
    {
        public string crewId,clientId,game,circuit,car;public long startedAt;public List<Lap> laps=new List<Lap>();
        public Capture WithLap(Lap lap) { return new Capture {crewId=crewId,clientId=clientId,game=game,circuit=circuit,car=car,startedAt=startedAt,laps=new List<Lap>{lap}}; }
    }
}
