// Les fiches circuit et voiture de Lovely Sim Racing (sur GitHub, les mêmes que NeoRed) : virages et lignes droites
// du circuit, temps de drive-through, de stop-and-go et d'arrêt par catégorie, régime de passage par rapport. Chaque
// fiche est téléchargée une fois puis gardée dans %LOCALAPPDATA%\EnduranceManager\Combos\lovely : sans connexion,
// la copie gardée sert. Lu hors du fil de lecture du jeu, une fiche à la fois.
using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class Lovely
    {
        const string Tracks = "https://raw.githubusercontent.com/Lovely-Sim-Racing/lovely-track-data/main/data/";
        const string Cars = "https://raw.githubusercontent.com/Lovely-Sim-Racing/lovely-car-data/main/data/";
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        readonly string folder;
        int busy;
        string trackAsked, carAsked;

        public volatile JObject Track, Car;
        public bool Busy => busy != 0;

        public Lovely(string home) { folder = Path.Combine(home, "lovely"); }

        // The track and car being driven (SimHub's TrackId and CarId, the names Lovely files them under, and the game's
        // track name). Loads what changed. Never throws: it runs on a pool thread.
        public void Load(string trackId, string trackName, string carId)
        {
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                Directory.CreateDirectory(folder);
                string track = (trackId ?? "") + "|" + (trackName ?? "");
                if (track != trackAsked && (trackId != null || trackName != null))
                {
                    trackAsked = track;
                    var entry = Find(Tracks, "tracks", "trackId", trackId, trackName);
                    Track = entry != null ? File(Tracks, (string)entry["path"]) : null;
                    // Not found (offline, no copy yet): asked again at the next call.
                    if (Track == null) trackAsked = null;
                }
                if (carId != null && carId != carAsked)
                {
                    carAsked = carId;
                    var entry = Find(Cars, "cars", "carId", carId, null);
                    Car = entry != null ? File(Cars, (string)entry["path"]) : null;
                    if (Car == null) carAsked = null;
                }
            }
            catch { }
            finally { busy = 0; }
        }

        // The game's line in Lovely's list (manifest.json): by SimHub's id, else by the track's name.
        JObject Find(string root, string kind, string key, string id, string name)
        {
            var list = File(root, "manifest.json", TimeSpan.FromDays(1))?[kind]?["lmu"] as JArray;
            if (list == null) return null;
            bool Same(JToken token, string text) => text != null && string.Equals(((string)token ?? "").Trim(), text.Trim(), StringComparison.OrdinalIgnoreCase);
            return list.OfType<JObject>().FirstOrDefault(item => Same(item[key], id))
                ?? list.OfType<JObject>().FirstOrDefault(item => Same(item[key], name) || Same(item["trackName"], name));
        }

        // A file from the site, kept on disk; again from the site when older than maxAge (never, by default).
        JObject File(string root, string path, TimeSpan? maxAge = null)
        {
            string local = Path.Combine(folder, (root == Tracks ? "track-" : "car-") + path.Replace('/', '-'));
            bool fresh = System.IO.File.Exists(local) && (maxAge == null || DateTime.Now - System.IO.File.GetLastWriteTime(local) < maxAge);
            if (!fresh)
            {
                try
                {
                    string text = client.GetStringAsync(root + path).GetAwaiter().GetResult();
                    JObject.Parse(text);
                    System.IO.File.WriteAllText(local, text);
                }
                catch { }
            }
            try { return System.IO.File.Exists(local) ? JObject.Parse(System.IO.File.ReadAllText(local)) : null; }
            catch { return null; }
        }
    }
}
