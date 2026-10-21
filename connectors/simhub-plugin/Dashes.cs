// Les overlays de Dash Studio : « Endurance Manager · Bandeau » (les trois chiffres côte à côte) et
// « Endurance Manager · Colonne » (les mêmes, les uns sous les autres). Dernier tour, écart signé et cible « vs » :
// les moyennes de l'équipe continuent d'alimenter les cibles dans Practice.cs sans encombrer l'affichage.
// Ils n'affichent que les propriétés du plugin
// (EnduranceManagerPlugin.Essais.*, Practice.cs) : rien à calculer, couleurs comprises. Le plugin les écrit dans les
// modèles de SimHub (DashTemplates) à son lancement ; un overlay que le pilote a modifié dans Dash Studio est laissé tel quel.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public static class Dashes
    {
        const string Text = "SimHub.Plugins.OutputPlugins.GraphicalDash.Models.TextItem, SimHub.Plugins";
        const string Rectangle = "SimHub.Plugins.OutputPlugins.GraphicalDash.Models.RectangleItem, SimHub.Plugins";
        const string Layer = "SimHub.Plugins.OutputPlugins.GraphicalDash.Models.Layer, SimHub.Plugins";
        const string Grey = "#FF9CAABD", Body = "Bahnschrift", Digits = "Bahnschrift";
        // Full-width cards: a large figure, signed delta on the right, and the target below.
        const int BlockWidth = 485, BlockHeight = 140, Gap = 8, RowGap = 5;

        static string P(string name) => "[EnduranceManagerPlugin.Essais." + name + "]";

        static JObject Bind(string target, string expression) =>
            new JObject { ["Formula"] = new JObject { ["Expression"] = expression }, ["Mode"] = 2, ["TargetPropertyName"] = target };

        static JObject Label(string name, double left, double top, double width, double height, string font, double size, string weight,
            string text, string color = null, int align = 0, string visible = null, bool italic = false)
        {
            var bindings = new JObject { ["Text"] = Bind("Text", text) };
            if (color != null && color.StartsWith("[")) bindings["TextColor"] = Bind("TextColor", color);
            if (visible != null) bindings["Visible"] = Bind("Visible", visible);
            var item = new JObject
            {
                ["$type"] = Text, ["IsTextItem"] = true, ["Font"] = font, ["FontSize"] = size, ["FontWeight"] = weight, ["Text"] = "—",
                ["TextColor"] = color != null && color.StartsWith("#") ? color : "#FFFFFFFF", ["HorizontalAlignment"] = align, ["VerticalAlignment"] = 1,
                ["BackgroundColor"] = "#00FFFFFF", ["Height"] = height, ["Left"] = left, ["Top"] = top, ["Visible"] = true, ["Width"] = width, ["Name"] = name,
                ["Bindings"] = bindings
            };
            if (italic) item["FontStyle"] = "Italic";
            return item;
        }

        static JObject Box(string name, double x, double y, double width, double height, string color, string border, int radius) =>
            new JObject
            {
                ["$type"] = Rectangle, ["IsRectangleItem"] = true, ["Name"] = name,
                ["Left"] = x, ["Top"] = y, ["Width"] = width, ["Height"] = height, ["Visible"] = true,
                ["BackgroundColor"] = color,
                ["BorderStyle"] = new JObject
                {
                    ["BorderColor"] = border, ["BorderTop"] = 1, ["BorderBottom"] = 1, ["BorderLeft"] = 1, ["BorderRight"] = 1,
                    ["RadiusTopLeft"] = radius, ["RadiusTopRight"] = radius, ["RadiusBottomLeft"] = radius, ["RadiusBottomRight"] = radius
                }
            };

        // One figure (Tour, Energie, Usure) at the card's top-left corner (x, y).
        static IEnumerable<JObject> Block(string name, double x, double y)
        {
            string at = name + ".";
            yield return Box(name + "Fond", x, y, BlockWidth, BlockHeight, "#FF0F151E", "#FF253140", 8);
            yield return Box(name + "Accent", x, y + 6, 4, 128, "#FF4B9FFF", "#FF4B9FFF", 2);
            yield return Box(name + "EcartFond", x + 330, y + 42, 139, 64, "#FF172230", "#FF2A3747", 8);
            yield return Label(name + "Titre", x + 16, y + 4, 325, 22, Body, 18, "SemiBold", P(at + "Titre"), "#FFCAD5E2");
            if (name == "Tour") yield return Label("NonCompte", x + 341, y + 4, 128, 22, Body, 13, "Normal", "'non compté'", Grey, 2, P("NonCompte"), true);
            yield return Label(name + "Valeur", x + 16, y + 26, 306, 84, Digits, 76, "Bold", P(at + "Valeur"), "#FFFFFFFF");
            yield return Label(name + "Ecart", x + 334, y + 44, 131, 60, Digits, 44, "SemiBold", P(at + "Ecart"), P(at + "EcartCouleur"), 1);
            yield return Label(name + "Vise", x + 16, y + 110, 453, 28, Body, 24, "Normal", P(at + "Vise"), Grey);
        }

        static readonly string[] Names = { "Tour", "Energie", "Usure" };

        // The whole dashboard: a dark translucent card, the three blocks side by side (banner) or stacked (column).
        static (JObject dash, JObject metadata) Make(string title, string id, string screen, bool column)
        {
            int width = column ? BlockWidth : 3 * BlockWidth + 2 * Gap;
            int height = column ? 3 * BlockHeight + 2 * RowGap : BlockHeight;
            var children = new JArray();
            for (int i = 0; i < 3; i++)
                foreach (var item in column ? Block(Names[i], 0, i * (BlockHeight + RowGap)) : Block(Names[i], i * (BlockWidth + Gap), 0)) children.Add(item);
            // Shown in practice and in a race, car on track: change the formula in Dash Studio for other sessions.
            var layer = new JObject
            {
                ["$type"] = Layer, ["Group"] = true, ["Repetitions"] = 0, ["Visible"] = true, ["Name"] = "Endurance Manager", ["RenderingSkip"] = 0,
                ["MinimumRefreshIntervalMS"] = 0.0, ["Top"] = 0, ["Left"] = 0, ["Height"] = height, ["Width"] = width, ["BackgroundColor"] = "#00FFFFFF",
                ["Bindings"] = new JObject { ["Visible"] = Bind("Visible", P("EnEssais") + " || " + P("EnCourse")) }, ["Childrens"] = children
            };
            var metadata = new JObject
            {
                ["Category"] = "Endurance Manager", ["Title"] = title, ["Author"] = "Endurance Manager",
                ["Description"] = "Temps, énergie et usure du dernier tour en grands chiffres, écart signé coloré et cible « vs ». Plugin « Fiches combo » requis.",
                ["ScreenCount"] = 1.0, ["InGameScreensIndexs"] = new JArray(0), ["IdleScreensIndexs"] = new JArray(), ["MainPreviewIndex"] = 0, ["IsOverlay"] = true,
                ["Width"] = (double)width, ["Height"] = (double)height, ["OverlaySizeWarning"] = false, ["MetadataVersion"] = 2.0, ["EnableOnDashboardMessaging"] = true,
                ["PitScreensIndexs"] = new JArray()
            };
            var dash = new JObject
            {
                ["DashboardDebugManager"] = new JObject { ["Maximized"] = false }, ["Version"] = 2, ["Id"] = id, ["BaseHeight"] = height, ["BaseWidth"] = width,
                ["BackgroundColor"] = "#00000000",
                ["Screens"] = new JArray(new JObject
                {
                    ["Name"] = "Screen1", ["InGameScreen"] = true, ["IdleScreen"] = false, ["PitScreen"] = false, ["ScreenId"] = screen, ["IsForegroundLayer"] = false,
                    ["IsBackgroundLayer"] = false, ["BackgroundColor"] = "#00000000", ["Items"] = new JArray(layer)
                }),
                ["SnapToGrid"] = false, ["HideLabels"] = true, ["ShowForeground"] = true, ["ForegroundOpacity"] = 100.0, ["ShowBackground"] = true, ["BackgroundOpacity"] = 100.0,
                ["ShowBoundingRectangles"] = false, ["GridSize"] = 2, ["Images"] = new JArray(), ["Metadata"] = metadata, ["ShowOnScreenControls"] = false,
                ["IsOverlay"] = true, ["EnableClickThroughOverlay"] = true, ["EnableOnDashboardMessaging"] = true
            };
            return (dash, metadata);
        }

        public static IEnumerable<(string name, string dash, string metadata)> All()
        {
            foreach (var (title, id, screen, column) in new[]
            {
                ("Endurance Manager · Bandeau", "0b5c6c9e-4f0a-4d39-9d3e-6a1d2b7c1a01", "0b5c6c9e-4f0a-4d39-9d3e-6a1d2b7c1a02", false),
                ("Endurance Manager · Colonne", "0b5c6c9e-4f0a-4d39-9d3e-6a1d2b7c1a03", "0b5c6c9e-4f0a-4d39-9d3e-6a1d2b7c1a04", true)
            })
            {
                var (dash, metadata) = Make(title, id, screen, column);
                yield return (title, dash.ToString(Formatting.None), metadata.ToString(Formatting.Indented));
            }
        }

        static string Hash(string text) { using (var sha = SHA256.Create()) return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(text))); }

        // Into SimHub's DashTemplates, each in its own folder. Written when missing or still as the plugin last wrote it
        // (its fingerprint kept in dashes.json): one the pilot changed in Dash Studio stays his.
        public static void Install(string home)
        {
            try
            {
                string templates = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "DashTemplates");
                if (!Directory.Exists(templates)) return;
                string ledger = Path.Combine(home, "dashes.json");
                var written = File.Exists(ledger) ? JsonConvert.DeserializeObject<Dictionary<string, string>>(File.ReadAllText(ledger)) ?? new Dictionary<string, string>() : new Dictionary<string, string>();
                foreach (var (name, dash, metadata) in All())
                {
                    string folder = Path.Combine(templates, name), file = Path.Combine(folder, name + ".djson");
                    if (File.Exists(file) && (!written.TryGetValue(name, out var mine) || mine != Hash(File.ReadAllText(file)))) continue;
                    Directory.CreateDirectory(folder);
                    File.WriteAllText(file, dash);
                    File.WriteAllText(file + ".metadata", metadata);
                    written[name] = Hash(dash);
                }
                File.WriteAllText(ledger, JsonConvert.SerializeObject(written));
            }
            // A SimHub folder that cannot be written: the overlays can still be imported by hand.
            catch { }
        }
    }
}
