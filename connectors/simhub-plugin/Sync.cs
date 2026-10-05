// Envoi au site : les fichiers de résultats LMU (UserData\Log\Results\*.xml) et les séances lues en direct, gardées
// en fichiers jusqu'à ce que le site les ait. Même règles que le synchroniseur (connectors/lmu-sync/sync.go).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Newtonsoft.Json;

namespace EnduranceManager.SimHub
{
    public class LinkCode
    {
        public string Origin, Token;
        static readonly Regex Pattern = new Regex(@"EMSYNC1 (https://[A-Za-z0-9.-]+(?::\d+)?) ([a-f0-9]{64}) EMSYNC1");

        // The code the site gives on « Mon entraînement » (or the end of the synchroniser it delivers).
        public static LinkCode Parse(string text)
        {
            var match = Pattern.Match(text ?? "");
            return match.Success ? new LinkCode { Origin = match.Groups[1].Value, Token = match.Groups[2].Value } : null;
        }
    }

    public class Uploader
    {
        const int KeepDays = 60, MaxFile = 3_000_000;
        readonly string home;
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        HashSet<string> sent;

        public string LiveFolder => Path.Combine(home, "live");
        public string Status { get; private set; } = "En attente";
        public bool Revoked { get; private set; }

        public Uploader(string home)
        {
            this.home = home;
            Directory.CreateDirectory(LiveFolder);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            try { sent = JsonConvert.DeserializeObject<HashSet<string>>(File.ReadAllText(Path.Combine(home, "sent.json"))); } catch { }
            sent = sent ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        // Written aside then renamed, so a file is never read half written.
        public void SaveLive(LiveSession session)
        {
            string path = Path.Combine(LiveFolder, session.At + ".json");
            File.WriteAllText(path + ".tmp", JsonConvert.SerializeObject(session));
            if (File.Exists(path)) File.Delete(path);
            File.Move(path + ".tmp", path);
        }

        // Where Steam is installed, then its libraries: the LMU results folders found there.
        public static List<string> ResultsDirs()
        {
            var roots = new List<string>();
            try { if (Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam")?.GetValue("SteamPath") is string steam) roots.Add(steam.Replace('/', '\\')); } catch { }
            roots.Add(@"C:\Program Files (x86)\Steam");
            roots.Add(@"C:\Program Files\Steam");
            var libraries = new List<string>();
            foreach (var root in roots)
            {
                libraries.Add(root);
                try
                {
                    string vdf = File.ReadAllText(Path.Combine(root, "steamapps", "libraryfolders.vdf"));
                    libraries.AddRange(Regex.Matches(vdf, "\"path\"\\s+\"([^\"]+)\"").Cast<Match>().Select(m => m.Groups[1].Value.Replace(@"\\", @"\")));
                }
                catch { }
            }
            return libraries.Select(library => Path.Combine(library, "steamapps", "common", "Le Mans Ultimate", "UserData", "Log", "Results"))
                .Where(Directory.Exists).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        // The pilot's name in LMU (UserData\player\Settings.JSON, next to the results): online, every driver of a results
        // file is marked as the player, and the site finds the pilot by this name.
        public static string PlayerName(string resultsDir)
        {
            try
            {
                string text = File.ReadAllText(Path.Combine(resultsDir, "..", "..", "player", "Settings.JSON"));
                var match = Regex.Match(text, "\"Player Name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
                return match.Success ? Regex.Unescape(match.Groups[1].Value).Trim() : "";
            }
            catch { return ""; }
        }

        static string FileKey(FileInfo info) => info.Name.ToLowerInvariant() + "|" + info.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ");

        // One pass: the results files not sent yet (finished, recent, oldest first), then the live sessions.
        public void SendAll(LinkCode code)
        {
            if (code == null) { Status = "Colle ton code de liaison dans les réglages du plugin."; return; }
            try
            {
                var now = DateTime.UtcNow;
                var files = ResultsDirs().SelectMany(dir => new DirectoryInfo(dir).GetFiles("*.xml"))
                    .Where(info => info.Length > 0 && info.Length <= MaxFile && now - info.LastWriteTimeUtc >= TimeSpan.FromSeconds(15)
                        && now - info.LastWriteTimeUtc <= TimeSpan.FromDays(KeepDays) && !sent.Contains(FileKey(info)))
                    .OrderBy(info => info.LastWriteTimeUtc).ToList();
                foreach (var info in files)
                {
                    if (Send(code, info.FullName, "/api/training/collector", "application/xml", PlayerName(info.DirectoryName))) { sent.Add(FileKey(info)); SaveSent(); }
                }
                foreach (var path in Directory.GetFiles(LiveFolder, "*.json").OrderBy(path => path))
                {
                    if (Send(code, path, "/api/training/live", "application/json", "")) File.Delete(path);
                }
                Revoked = false;
                Status = "Synchronisation active · " + DateTime.Now.ToString("HH:mm");
            }
            catch (UnauthorizedAccessException) { Revoked = true; Status = "Cette liaison a été retirée. Demande un nouveau code sur la page Mon entraînement."; }
            catch (Exception error) { Status = "Site injoignable, nouvel essai dans une minute (" + error.Message + ")"; }
        }

        // A file the site refuses (not a session of the pilot) is never sent again; a refused key stops everything.
        bool Send(LinkCode code, string path, string endpoint, string kind, string player)
        {
            var content = new ByteArrayContent(File.ReadAllBytes(path));
            content.Headers.ContentType = new MediaTypeHeaderValue(kind);
            var request = new HttpRequestMessage(HttpMethod.Post, code.Origin + endpoint) { Content = content };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", code.Token);
            if (player != "") request.Headers.Add("X-LMU-Player", Uri.EscapeDataString(player));
            using (var response = client.SendAsync(request).GetAwaiter().GetResult())
            {
                if (response.StatusCode == HttpStatusCode.Unauthorized) throw new UnauthorizedAccessException();
                if ((int)response.StatusCode >= 500 || response.StatusCode == (HttpStatusCode)429) throw new HttpRequestException("erreur " + (int)response.StatusCode);
                return true;
            }
        }

        void SaveSent()
        {
            string path = Path.Combine(home, "sent.json");
            File.WriteAllText(path + ".tmp", JsonConvert.SerializeObject(sent));
            if (File.Exists(path)) File.Delete(path);
            File.Move(path + ".tmp", path);
        }
    }
}
