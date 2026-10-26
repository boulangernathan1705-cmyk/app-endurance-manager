// Envoi au site : chaque séance est gardée en fichier jusqu'à ce que le site l'ait reçue (POST
// /api/combos/plugin/session, server/combos.mjs). Un fichier que le site refuse est mis de côté avec la raison.
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace EnduranceManager.SimHub
{
    public class LinkCode
    {
        public string Origin, Token;
        static readonly Regex Pattern = new Regex(@"EMCOMBO1 (https://[A-Za-z0-9.-]+(?::\d+)?) ([a-f0-9]{64}) EMCOMBO1");

        // The code the site gives on the fiches combo page: the site's address and the pilot's key.
        public static LinkCode Parse(string text)
        {
            var match = Pattern.Match(text ?? "");
            return match.Success ? new LinkCode { Origin = match.Groups[1].Value, Token = match.Groups[2].Value } : null;
        }

        public override string ToString() => $"EMCOMBO1 {Origin} {Token} EMCOMBO1";
    }

    // The site said no to the key itself: removed (401) or the pilot no longer has the right (403).
    public class LinkRefused : Exception
    {
        public bool Removed;
        public LinkRefused(string message, bool removed) : base(message) { Removed = removed; }
    }

    public class Uploader
    {
        readonly string home;
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };

        public string Folder => Path.Combine(home, "sessions");
        public string Status { get; private set; } = "En attente";
        // The key is refused: nothing is sent until a new code is pasted; the sessions wait.
        public string Refused { get; private set; }
        // For the settings screen: did the last pass reach the site, and what went with it.
        public bool? Reached { get; private set; }
        public DateTime? LastSent { get; private set; }
        public int SentToday { get; private set; }
        public int Waiting => Directory.GetFiles(Folder, "*.json").Length;
        // The last session the site refused, and why: the file is kept in sessions\refused instead of being lost.
        public string LastRefusal { get; private set; }
        DateTime sentDay = DateTime.Today;

        public Uploader(string home)
        {
            this.home = home;
            Directory.CreateDirectory(Folder);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        }

        // A new code: try again at once.
        public void Reset() { Refused = null; Reached = null; Status = "En attente"; }

        // Written aside then renamed, so a file is never read half written.
        public void Save(LiveSession session)
        {
            string path = Path.Combine(Folder, session.At + ".json");
            File.WriteAllText(path + ".tmp", JsonConvert.SerializeObject(session));
            if (File.Exists(path)) File.Delete(path);
            File.Move(path + ".tmp", path);
        }

        // One pass: the sessions not sent yet, oldest first.
        public void SendAll(LinkCode code)
        {
            if (code == null) { Status = "Colle ton code de liaison dans l'écran du plugin."; return; }
            if (Refused != null) return;
            try
            {
                if (sentDay != DateTime.Today) { sentDay = DateTime.Today; SentToday = 0; }
                foreach (var path in Directory.GetFiles(Folder, "*.json").OrderBy(path => path))
                {
                    string refusal = Send(code, path);
                    if (refusal == null) { File.Delete(path); SentToday++; LastSent = DateTime.Now; continue; }
                    // Refused (4xx): kept aside with its reason, never sent again on its own.
                    string refused = Path.Combine(Folder, "refused");
                    Directory.CreateDirectory(refused);
                    string target = Path.Combine(refused, Path.GetFileName(path));
                    if (File.Exists(target)) File.Delete(target);
                    File.Move(path, target);
                    File.WriteAllText(target + ".txt", refusal);
                    LastRefusal = "le " + DateTime.Now.ToString("dd/MM à HH:mm") + " (" + refusal + ")";
                }
                Reached = true;
                Status = "Relié · " + DateTime.Now.ToString("HH:mm");
            }
            catch (LinkRefused error) { Refused = error.Message; Reached = false; Status = error.Message; }
            catch (Exception error) { Reached = false; Status = "Site injoignable, nouvel essai dans une minute (" + error.Message + ")"; }
        }

        static string Reason(HttpResponseMessage response)
        {
            try { return (string)Newtonsoft.Json.Linq.JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult())["error"]; }
            catch { return null; }
        }

        // null when the site has the session (new or already received), else why it refused it.
        string Send(LinkCode code, string path)
        {
            var content = new ByteArrayContent(File.ReadAllBytes(path));
            content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            var request = new HttpRequestMessage(HttpMethod.Post, code.Origin + "/api/combos/plugin/session") { Content = content };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", code.Token);
            using (var response = client.SendAsync(request).GetAwaiter().GetResult())
            {
                if (response.StatusCode == HttpStatusCode.Unauthorized)
                    throw new LinkRefused(Reason(response) ?? "Cette liaison a été retirée. Crée un nouveau code sur le site.", true);
                if (response.StatusCode == HttpStatusCode.Forbidden)
                    throw new LinkRefused(Reason(response) ?? "Le site refuse cette liaison.", false);
                if ((int)response.StatusCode >= 500 || response.StatusCode == (HttpStatusCode)429) throw new HttpRequestException("erreur " + (int)response.StatusCode);
                if (response.IsSuccessStatusCode) return null;
                string reason = Reason(response);
                return "erreur " + (int)response.StatusCode + (string.IsNullOrEmpty(reason) ? "" : " : " + reason);
            }
        }
    }
}
