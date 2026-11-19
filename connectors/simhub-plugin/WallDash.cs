// Le dash « Endurance Manager · Mur » (2560 × 1440, écran du PC) : la maquette validée par Nathan, dash/mur.html, lue
// par dash/build.mjs et écrite en éléments Dash Studio dans dash/mur.json (incorporé à la DLL). Chaque case lit une
// propriété EnduranceManagerPlugin.Mur.* que Wall.Make remplit ; rien n'est calculé dans le dash, sauf la place des
// points sur la piste à plat et le cadre qui clignote en alerte (le cadre seul, aucun message ne masque le reste).
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public static class WallDash
    {
        public const int Width = 2560, Height = 1440;

        static string json;
        static string Json()
        {
            if (json != null) return json;
            using (var stream = typeof(WallDash).Assembly.GetManifestResourceStream("EnduranceManager.SimHub.mur.json"))
            using (var reader = new StreamReader(stream)) return json = reader.ReadToEnd();
        }

        public static JArray Items() => JArray.Parse(Json());

        // The properties the dash reads (without « Mur. »), each attached once by the plugin.
        public static IEnumerable<string> Properties() =>
            Regex.Matches(Json(), @"EnduranceManagerPlugin\.Mur\.([A-Za-z0-9.]+)").Cast<Match>().Select(m => m.Groups[1].Value.TrimEnd('.')).Distinct();
    }
}
