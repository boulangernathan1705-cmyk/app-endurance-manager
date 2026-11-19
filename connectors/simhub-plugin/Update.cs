// Mise à jour du plugin : le site qui a donné le code publie la dernière version (/downloads/simhub/plugin.json,
// scripts/build.mjs). Le bouton « Mettre à jour » de l'écran du plugin télécharge l'installeur de ce site et le lance :
// il ferme SimHub, copie la nouvelle DLL et relance SimHub. Jamais pendant que le pilote roule.
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public class Updater
    {
        readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        readonly string folder;
        DateTime checkedAt = DateTime.MinValue;
        int busy;

        public static readonly Version Current = typeof(Updater).Assembly.GetName().Version;
        // Without the site module, the public site gives the updates: SimHub alone keeps up to date too.
        public const string PublicSite = "https://endurance-manager.app";
        static string Origin(LinkCode code) => code?.Origin ?? PublicSite;
        // « 2.6.0 (abc1234) »: the version and the commit it was built from, one build told from another.
        public static string Build
        {
            get
            {
                string info = (typeof(Updater).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false) is object[] a && a.Length > 0
                    ? ((System.Reflection.AssemblyInformationalVersionAttribute)a[0]).InformationalVersion : null) ?? "";
                int plus = info.IndexOf('+');
                string commit = plus > 0 ? info.Substring(plus + 1) : "";
                return Current.ToString(3) + (commit.Length > 0 ? " (" + (commit.Length > 7 ? commit.Substring(0, 7) : commit) + ")" : "");
            }
        }
        // The latest version on the site, when it is newer than this one.
        public Version Available { get; private set; }

        public Updater(string home) { folder = Path.Combine(home, "update"); }

        // « 1.2.0 » on the site, 1.2.0.0 in the DLL.
        static Version Full(Version version) => new Version(version.Major, version.Minor, Math.Max(version.Build, 0), Math.Max(version.Revision, 0));

        // At most once an hour, aside: a slow site never holds up anything. Never throws.
        public void Check(LinkCode code, bool force = false)
        {
            if (!force && DateTime.Now - checkedAt < TimeSpan.FromHours(1)) return;
            if (System.Threading.Interlocked.Exchange(ref busy, 1) == 1) return;
            checkedAt = DateTime.Now;
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    var info = JObject.Parse(client.GetStringAsync(Origin(code) + "/downloads/simhub/plugin.json").GetAwaiter().GetResult());
                    Available = Version.TryParse((string)info["version"], out var latest) && Full(latest) > Current ? latest : null;
                }
                catch { }
                finally { busy = 0; }
            });
        }

        // The installer from the site, with the site written in, started in its own window. null when it is on its
        // way, else why not.
        public string Start(LinkCode code)
        {
            try
            {
                string script = client.GetStringAsync(Origin(code) + "/downloads/simhub/installer.cmd").GetAwaiter().GetResult();
                if (!script.Contains("@@SITE@@")) return "Le site n'a pas donné l'installeur.";
                script = script.Replace("@@SITE@@", Origin(code)).Replace("\r\n", "\n").Replace("\n", "\r\n");
                Directory.CreateDirectory(folder);
                string path = Path.Combine(folder, "Installer le plugin.cmd");
                File.WriteAllText(path, script, new UTF8Encoding(false));
                Process.Start(new ProcessStartInfo("cmd.exe", "/c \"\"" + path + "\" maj\"") { UseShellExecute = true, WorkingDirectory = folder });
                return null;
            }
            catch (Exception error) { return "La mise à jour n'a pas pu démarrer (" + error.Message + ")."; }
        }
    }
}
