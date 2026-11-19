// Le dash « Endurance Manager · Mur » (2560 × 1440, écran du PC), dessiné d'après la maquette validée par Nathan
// (/mnt/project-files/mur-simhub/maquette-mur-simhub.png) avec la direction artistique du mur du site : fond #0a0c10,
// cadres #131722 bordés #262e45 avec titre en capitales, cases creuses #0d1017, accent cyan #00e5ff, couleurs des
// catégories. Il n'affiche que les propriétés EnduranceManagerPlugin.Mur.* (WallProperties.cs) : rien n'y est calculé,
// sauf la position des points sur la piste à plat et le clignotement des cadres en alerte (le cadre clignote, aucun
// message ne masque le reste).
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace EnduranceManager.SimHub
{
    public static class WallDash
    {
        public const int Width = 2560, Height = 1440;
        const string Bg = "#FF0A0C10", CardBg = "#FF131722", CardEdge = "#FF262E45", Inset = "#FF0D1017", Cyan = "#FF00E5FF", Grey = "#FF8A93A6",
            White = "#FFFFFFFF", Violet = "#FFC77DFF", Green = "#FF00E676", Red = "#FFFF5252", Orange = "#FFFFAB00", Clear = "#00FFFFFF";
        const string Words = "Bahnschrift", Digits = "Consolas";

        static string P(string name) => "[EnduranceManagerPlugin.Mur." + name + "]";
        static string Q(string text) => "'" + text.Replace("'", "\\'") + "'";

        static readonly List<JObject> items = new List<JObject>();

        static void Text(string name, double x, double y, double w, double h, double size, string expr, string color = White, int align = 0, string font = Words,
            string weight = "Normal", string visible = null) =>
            items.Add(Dashes.Label(name, x, y, w, h, font, size, weight, expr, color, align, visible));

        // A rectangle; color may be a formula ([...] or if(...)): then bound.
        static void Rect(string name, double x, double y, double w, double h, string color, string border = null, int radius = 6, string visible = null,
            string left = null, string width = null)
        {
            bool formula = !color.StartsWith("#");
            var box = Dashes.Box(name, x, y, w, h, formula ? Clear : color, border ?? (formula ? Clear : color), radius);
            var bindings = new JObject();
            if (formula) bindings["BackgroundColor"] = Dashes.Bind("BackgroundColor", color);
            if (visible != null) bindings["Visible"] = Dashes.Bind("Visible", visible);
            if (left != null) bindings["Left"] = Dashes.Bind("Left", left);
            if (width != null) bindings["Width"] = Dashes.Bind("Width", width);
            if (bindings.Count > 0) box["Bindings"] = bindings;
            items.Add(box);
        }

        // A card with its uppercase title bar; alert: a formula that makes its frame flash red.
        static void Card(string name, double x, double y, double w, double h, string title, string alert = null)
        {
            Rect(name, x, y, w, h, CardBg, CardEdge, 8);
            if (alert != null) Rect(name + "Alerte", x - 3, y - 3, w + 6, h + 6, $"if(blink('{name}', 400, {alert}), '#55FF1744', '#00000000')", null, 10);
            Text(name + "Titre", x + 20, y + 10, w - 40, 34, 22, Q(title), White, 0, Words, "SemiBold");
        }

        // A small inset box: label on top, figure below.
        static void Cell(string name, double x, double y, double w, double h, string label, string expr, double size = 34, string color = White, string alert = null,
            string visible = null)
        {
            Rect(name, x, y, w, h, Inset, CardEdge, 6, visible);
            if (alert != null) Rect(name + "Alerte", x, y, w, h, $"if(blink('{name}', 400, {alert}), '#AAFF1744', '#00000000')", null, 6, visible);
            Text(name + "Nom", x + 12, y + 6, w - 24, 22, 15, Q(label), Grey, 0, Words, "Normal", visible);
            Text(name + "Valeur", x + 12, y + 28, w - 24, h - 34, size, expr, color, 0, Digits, "SemiBold", visible);
        }

        public static JArray Items()
        {
            items.Clear();
            Rect("Fond", 0, 0, Width, Height, Bg, Bg, 0);
            Standings();
            Tyres();
            Settings();
            Band();
            FlatTrack();
            Relative();
            Energy();
            Inputs();
            Text("Etat", 1300, 829, 1225, 34, 18, P("Etat"), Orange, 2);
            return new JArray(items);
        }

        // ----- Classement de notre catégorie : 15,15 → 1380 × 702 -----
        static void Standings()
        {
            const double x = 15, y = 15, w = 1365;
            Card("Classement", x, y, w, 702, "CLASSEMENT");
            Text("ClassementCategorie", x + 210, y + 10, 400, 34, 22, P("Categorie"), P("CategorieCouleur"), 0, Words, "SemiBold");
            double[] cols = { 20, 100, 190, 560, 640, 770, 905, 1040, 1175 };
            string[] heads = { "POS", "#", "PILOTE · VOITURE", "PNEUS", "LEADER", "DEVANT", "DERNIER", "MEILLEUR", "RELAIS" };
            for (int c = 0; c < heads.Length; c++) Text("ClassementTete" + c, x + cols[c], y + 56, 160, 24, 15, Q(heads[c]), Grey);
            Text("ClassementTeteStands", x + 1245, y + 56, 105, 24, 15, Q("STANDS"), Grey, 2);
            for (int r = 0; r < WallView.Rows; r++)
            {
                string at = "Classement." + (r + 1) + ".";
                double top = y + 86 + r * 50;
                string shown = P(at + "Visible");
                Rect("ClassementFond" + r, x + 10, top, w - 20, 46, $"if({P(at + "Nous")}, '#FF14303A', '#00000000')", null, 4, shown);
                Rect("ClassementNous" + r, x + 10, top, 4, 46, Cyan, Cyan, 2, P(at + "Nous"));
                Text("ClassementPos" + r, x + cols[0], top + 4, 80, 38, 26, P(at + "Pos"), White, 0, Digits, "SemiBold", shown);
                Text("ClassementNum" + r, x + cols[1], top + 4, 90, 38, 26, P(at + "Num"), "#FFFFD54F", 0, Digits, "SemiBold", shown);
                Text("ClassementPilote" + r, x + cols[2], top + 4, 200, 38, 24, P(at + "Pilote"), White, 0, Words, "SemiBold", shown);
                Text("ClassementVoiture" + r, x + cols[2] + 205, top + 8, 160, 34, 17, P(at + "Voiture"), Grey, 0, Words, "Normal", shown);
                Text("ClassementPneus" + r, x + cols[3], top + 4, 75, 38, 22, P(at + "Pneus"), "#FFFFD54F", 0, Digits, "Bold", shown);
                Text("ClassementLeader" + r, x + cols[4], top + 4, 130, 38, 24, P(at + "Leader"), White, 2, Digits, "Normal", shown);
                Text("ClassementDevant" + r, x + cols[5], top + 4, 130, 38, 24, P(at + "Devant"), White, 2, Digits, "Normal", shown);
                Text("ClassementDernier" + r, x + cols[6], top + 4, 130, 38, 24, P(at + "Dernier"), White, 2, Digits, "Normal", shown);
                Text("ClassementMeilleur" + r, x + cols[7], top + 4, 130, 38, 24, P(at + "Meilleur"), $"if({P(at + "MeilleurCategorie")}, '{Violet}', '{Green}')", 2, Digits, "Normal", shown);
                Text("ClassementRelais" + r, x + cols[8], top + 4, 55, 38, 24, P(at + "Relais"), White, 2, Digits, "Normal", shown);
                Text("ClassementStands" + r, x + 1240, top + 6, 112, 34, 16, P(at + "Stands"), P(at + "StandsCouleur"), 2, Words, "Bold", shown);
            }
        }

        // ----- Pneus et dégâts : 1395,15 → 777 × 702 -----
        static readonly string[] Corners = { "AVG", "AVD", "ARG", "ARD" };
        static readonly string[] CornerNames = { "Avant gauche", "Avant droit", "Arrière gauche", "Arrière droit" };
        static void Tyres()
        {
            const double x = 1395, y = 15, w = 777;
            Card("Pneus", x, y, w, 702, "PNEUS ET DÉGÂTS", P("Degats.Alerte"));
            Text("PneusGomme", x + 470, y + 12, 290, 30, 18, P("PneusBandeau"), "#FFFFD54F", 2, Words, "Bold");
            for (int i = 0; i < 4; i++)
            {
                string at = "Pneus." + Corners[i] + ".";
                bool right = i % 2 == 1;
                double cx = x + 20 + (right ? 460 : 0), cy = y + 60 + (i / 2) * 255;
                string worn = $"{P(at + "Use")} || {P(at + "Crevaison")}";
                Rect("Roue" + i, cx, cy, 280, 240, Inset, CardEdge, 8);
                Rect("RoueAlerte" + i, cx, cy, 280, 240, $"if({P(at + "TresUse")} || {P(at + "Crevaison")}, if(blink('roue{i}', 400, true), '#AAFF1744', '#00000000'), if({P(at + "Use")}, '#66FFAB00', '#00000000'))", null, 8);
                Text("RoueNom" + i, cx + 14, cy + 8, 170, 28, 18, Q(CornerNames[i]), White, 0, Words, "SemiBold");
                Text("RouePression" + i, cx + 150, cy + 8, 116, 28, 20, P(at + "Pression"), Cyan, 2, Digits);
                Text("RoueRestant" + i, cx + 14, cy + 44, 252, 44, 38, P(at + "Restant"), $"if({worn}, '{Orange}', '{Green}')", 0, Digits, "Bold");
                Text("RoueCarcasseNom" + i, cx + 14, cy + 96, 120, 22, 15, Q("CARCASSE"), Grey);
                Text("RoueCarcasse" + i, cx + 14, cy + 116, 120, 40, 34, P(at + "Carcasse"), White, 0, Digits, "SemiBold");
                Text("RoueFreinNom" + i, cx + 150, cy + 96, 116, 22, 15, Q("FREIN"), Grey, 2);
                Text("RoueFrein" + i, cx + 150, cy + 116, 116, 40, 30, P(at + "Frein"), White, 2, Digits);
                Text("RoueBandeNom" + i, cx + 14, cy + 164, 252, 22, 15, Q("BANDE  INT · MIL · EXT"), Grey);
                Text("RoueBande" + i, cx + 14, cy + 186, 252, 40, 30, P(at + "Bande"), White, 0, Digits);
            }
            // The car seen from above: eight dent zones (0 front, round by the left to 7 front right), red when hit.
            double ox = x + 318, oy = y + 90;
            double[][] zones = { new double[] { 30, 0, 80, 40 }, new double[] { 0, 10, 28, 90 }, new double[] { 0, 110, 28, 100 }, new double[] { 0, 220, 28, 90 },
                new double[] { 30, 280, 80, 40 }, new double[] { 112, 220, 28, 90 }, new double[] { 112, 110, 28, 100 }, new double[] { 112, 10, 28, 90 } };
            Rect("Caisse", ox + 30, oy + 44, 80, 232, Inset, CardEdge, 20);
            for (int z = 0; z < 8; z++)
                Rect("Zone" + z, ox + zones[z][0], oy + zones[z][1], zones[z][2], zones[z][3],
                    $"if({P("Degats.Zone" + z)} >= 2, '{Red}', if({P("Degats.Zone" + z)} >= 1, '{Orange}', '#FF1E2A3A'))", null, 6);
            Text("AileronNom", ox - 10, oy + 330, 160, 22, 14, Q("AILERON ARRIÈRE"), Grey, 1);
            Text("Aileron", ox - 10, oy + 352, 160, 28, 20, $"if({P("Degats.Aileron")}, 'Arraché', 'En place')", $"if({P("Degats.Aileron")}, '{Red}', '{Green}')", 1, Words, "SemiBold");
            // Wear per lap, 5-lap average, the four tyres in one frame.
            double ty = y + 580;
            Rect("Usure", x + 20, ty, w - 40, 106, Inset, CardEdge, 6);
            Text("UsureNom", x + 34, ty + 8, 300, 24, 15, Q("USURE PAR TOUR · MOY. 5 TOURS"), Grey);
            for (int i = 0; i < 4; i++)
            {
                Text("UsureCoin" + i, x + 34 + i * 180, ty + 36, 170, 22, 15, Q(CornerNames[i].ToUpperInvariant()), Grey);
                Text("UsureValeur" + i, x + 34 + i * 180, ty + 58, 170, 40, 32, P("Pneus." + Corners[i] + ".UsureMoy5"), White, 0, Digits, "SemiBold");
            }
        }

        // ----- Réglages : 2186,15 → 359 × 702 -----
        static void Settings()
        {
            const double x = 2186, y = 15, w = 359;
            Card("Reglages", x, y, w, 702, "RÉGLAGES");
            (string label, string prop)[] rows = { ("TC", "Reglages.TC"), ("TC COUPURE", "Reglages.Coupure"), ("TC GLISSE", "Reglages.Glisse"), ("ABS", "Reglages.ABS"),
                ("RÉPARTITION", "Reglages.Repartition"), ("CARTO MOTEUR", "Reglages.Carto"), ("MIGRATION", "Reglages.Migration"), ("RÉGÉNÉRATION", "Reglages.Regen"), ("BATTERIE", "Reglages.Batterie") };
            for (int i = 0; i < rows.Length; i++)
            {
                double top = y + 60 + i * 70;
                Rect("Reglage" + i, x + 16, top, w - 32, 62, Inset, CardEdge, 6);
                Text("ReglageNom" + i, x + 30, top + 16, 180, 30, 18, Q(rows[i].label), Cyan, 0, Words, "SemiBold");
                Text("ReglageValeur" + i, x + 200, top + 8, 130, 46, 38, P(rows[i].prop), White, 2, Digits, "Bold");
            }
        }

        // ----- Bande du rythme : 15,732 → 2530 × 72 -----
        static void Band()
        {
            const double x = 15, y = 732, w = 2530;
            Rect("Bande", x, y, w, 72, CardBg, CardEdge, 8);
            Text("BandePilote", x + 20, y + 6, 330, 34, 26, P("Pilote"), White, 0, Words, "SemiBold");
            Text("BandeVoiture", x + 20, y + 40, 330, 26, 16, P("Voiture"), Grey);
            (string label, string expr, string color, double width)[] facts =
            {
                ("DELTA", P("Chrono.Delta"), P("Chrono.DeltaCouleur"), 130), ("S1", P("Chrono.S1"), White, 125), ("S2", P("Chrono.S2"), White, 125), ("S3", P("Chrono.S3"), White, 125),
                ("DERNIER", P("Chrono.Dernier"), White, 170), ("MEILLEUR", P("Chrono.Meilleur"), Green, 170), ("OPTIMAL", P("Chrono.Optimal"), Violet, 170),
                ("POSITION", P("Place"), White, 130), ("TEMPS RESTANT", P("TempsRestant"), White, 175), ("TOURS RESTANTS", P("ToursRestants"), White, 150)
            };
            double at = x + 370;
            for (int i = 0; i < facts.Length; i++)
            {
                Text("BandeNom" + i, at, y + 6, facts[i].width, 22, 15, Q(facts[i].label), Grey);
                Text("BandeValeur" + i, at, y + 26, facts[i].width, 42, 30, facts[i].expr, facts[i].color, 0, Digits, "SemiBold");
                at += facts[i].width + 10;
            }
            Text("BandeMeteoNom", at, y + 6, 330, 22, 15, Q("MÉTÉO · PISTE / AIR"), Grey);
            Text("BandeMeteo", at, y + 28, 330, 40, 24, P("Conditions"), White, 0, Digits, "SemiBold");
            Rect("BandeDirect", x + w - 140, y + 20, 120, 32, $"if({P("EnDirect")}, '#3300E676', '#33FF5252')", null, 16);
            Text("BandeDirectTexte", x + w - 140, y + 22, 120, 28, 16, $"if({P("EnDirect")}, 'En direct', 'Coupé')", $"if({P("EnDirect")}, '{Green}', '{Red}')", 1, Words, "SemiBold");
        }

        // ----- Piste à plat : 15,819 → 2530 × 186 ; notre voiture au milieu, une seule ligne -----
        static void FlatTrack()
        {
            const double x = 15, y = 819, w = 2530, left = x + 40, run = w - 80;
            Card("PisteAPlat", x, y, w, 186, "PISTE À PLAT");
            double line = y + 118;
            // Three fixed sector colours (S1 lime, S2 white, S3 mint): S1 from the line to S1's end, S2 to S2's end, S3 back to the line.
            string pos(string prop) => $"{left} + {P(prop)} * {run}";
            Rect("PisteFond", left, line - 3, run, 6, "#FF1DE9B6", null, 3);
            Rect("PisteS1", left, line - 3, 0, 6, "#FFC6FF00", null, 3, $"{P("Piste.FinS1")} > {P("Piste.Ligne")}", pos("Piste.Ligne"), $"({P("Piste.FinS1")} - {P("Piste.Ligne")}) * {run}");
            Rect("PisteS2", left, line - 3, 0, 6, White, null, 3, $"{P("Piste.FinS2")} > {P("Piste.FinS1")}", pos("Piste.FinS1"), $"({P("Piste.FinS2")} - {P("Piste.FinS1")}) * {run}");
            Rect("PisteArrivee", left, line - 40, 3, 80, White, null, 0, null, pos("Piste.Ligne"));
            Text("PisteArriveeNom", left, y + 52, 140, 24, 16, Q("ARRIVÉE"), White);
            items[items.Count - 1]["Bindings"]["Left"] = Dashes.Bind("Left", pos("Piste.Ligne") + " + 8");
            for (int d = 0; d < WallView.Dots; d++)
            {
                string at = "Piste." + (d + 1) + ".";
                string shown = $"{P(at + "Visible")} && !{P(at + "Nous")}";
                double size = 36;
                Rect("Point" + d, left, line - size / 2, size, size, P(at + "Couleur"), null, 18, shown, $"{pos(at + "X")} - {size / 2}");
                var label = Dashes.Label("PointPos" + d, left, line - size / 2, size, size, Digits, 17, "Bold", P(at + "Pos"), "#FF0A0C10", 1, shown);
                label["Bindings"]["Left"] = Dashes.Bind("Left", $"{pos(at + "X")} - {size / 2}");
                items.Add(label);
                var pit = Dashes.Label("PointStand" + d, left, line - 44, 60, 20, Words, 13, "Bold", Q("STAND"), Orange, 1, $"{shown} && {P(at + "Stand")}");
                pit["Bindings"]["Left"] = Dashes.Bind("Left", $"{pos(at + "X")} - 30");
                items.Add(pit);
            }
            // Ours: bigger, cyan, always in the middle.
            Rect("PointNous", left + run / 2 - 26, line - 26, 52, 52, Cyan, White, 26);
            Text("PointNousPos", left + run / 2 - 26, line - 26, 52, 52, 24, P("PlaceNumero"), "#FF0A0C10", 1, Digits, "Bold");
        }

        // ----- Relatif : 15,1020 → 877 × 403 -----
        static void Relative()
        {
            const double x = 15, y = 1020, w = 877;
            Card("Relatif", x, y, w, 403, "RELATIF");
            string[] heads = { "POS", "#", "PILOTE", "SUR NOUS" };
            double[] cols = { 20, 110, 220, 640 };
            for (int c = 0; c < heads.Length; c++) Text("RelatifTete" + c, x + cols[c], y + 52, 200, 24, 15, Q(heads[c]), Grey);
            for (int r = 0; r < 7; r++)
            {
                double top = y + 80 + r * 45;
                if (r == 3)
                {
                    Rect("RelatifNous", x + 10, top, w - 20, 42, "#FF14303A", "#FF14303A", 4);
                    Rect("RelatifNousBord", x + 10, top, 4, 42, Cyan, Cyan, 2);
                    Text("RelatifNousPos", x + cols[0], top + 4, 90, 34, 24, P("PlaceCourte"), White, 0, Digits, "SemiBold");
                    Text("RelatifNousPilote", x + cols[2], top + 4, 400, 34, 24, P("Pilote"), White, 0, Words, "SemiBold");
                    continue;
                }
                int k = r < 3 ? r : r - 1;
                string at = "Relatif." + (k + 1) + ".", shown = P(at + "Visible");
                string tone = $"if({P(at + "TourDeRetard")}, '#FF4FC3F7', if({P(at + "TourDAvance")}, '#FFFF9800', '{White}'))";
                Rect("RelatifCat" + k, x + 10, top + 6, 6, 30, P(at + "Couleur"), null, 2, shown);
                Text("RelatifPos" + k, x + cols[0], top + 4, 90, 34, 24, P(at + "Pos"), White, 0, Digits, "SemiBold", shown);
                Text("RelatifNum" + k, x + cols[1], top + 4, 100, 34, 24, P(at + "Num"), "#FFFFD54F", 0, Digits, "SemiBold", shown);
                Text("RelatifPilote" + k, x + cols[2], top + 4, 400, 34, 24, P(at + "Pilote"), tone, 0, Words, "SemiBold", shown);
                Text("RelatifEcart" + k, x + cols[3], top + 4, 120, 34, 24, P(at + "Ecart"), tone, 2, Digits, "SemiBold", shown);
                Text("RelatifStands" + k, x + 770, top + 8, 90, 28, 15, P(at + "Stands"), Orange, 2, Words, "Bold", shown);
            }
        }

        // ----- Énergie et consommation : 906,1020 → 1006 × 403 -----
        static void Energy()
        {
            const double x = 906, y = 1020, w = 1006;
            Card("Energie", x, y, w, 403, "ÉNERGIE ET CONSOMMATION", P("Energie.Alerte"));
            Text("EnergieRelais", x + 600, y + 12, 386, 30, 18, P("RelaisTexte"), Grey, 2);
            // Left: energy (VE, or fuel for a car without); right: fuel.
            double lx = x + 20, rx = x + 513, top = y + 56, half = 473;
            Rect("EnergieCadre", lx, top, half, 230, Inset, CardEdge, 8);
            Text("EnergieTitre", lx + 14, top + 10, 260, 30, 20, P("Energie.Titre"), White, 0, Words, "SemiBold");
            Text("EnergieValeur", lx + 250, top + 4, 210, 46, 40, P("Energie.Valeur"), Cyan, 2, Digits, "Bold");
            Rect("EnergieBarre", lx + 14, top + 56, half - 28, 10, "#FF1E2A3A", null, 5);
            Rect("EnergieBarrePleine", lx + 14, top + 56, 0, 10, Cyan, null, 5, null, null, $"{P("Energie.Remplissage")} * {half - 28}");
            Cell("EnergieDernier", lx + 14, top + 78, 218, 70, "DERNIER TOUR", P("Energie.DernierTour"), 28);
            Cell("EnergieMoy5", lx + 241, top + 78, 218, 70, "MOY. 5 TOURS", P("Energie.Moy5"), 28);
            Cell("EnergieRelaisMoy", lx + 14, top + 154, 218, 70, "MOY. DU RELAIS", P("Energie.Relais"), 28);
            Cell("EnergieTours", lx + 241, top + 154, 218, 70, "TOURS RESTANTS", P("Energie.ToursRestants"), 28, White, P("Energie.Alerte"));
            // A car without virtual energy already has its fuel on the left: the right block and the ratio go.
            string ve = $"{P("Energie.Titre")} != 'CARBURANT'";
            Rect("CarbuCadre", rx, top, half, 230, Inset, CardEdge, 8, ve);
            Text("CarbuTitre", rx + 14, top + 10, 260, 30, 20, Q("CARBURANT"), White, 0, Words, "SemiBold", ve);
            Text("CarbuValeur", rx + 250, top + 4, 210, 46, 40, P("Carburant.Valeur"), Orange, 2, Digits, "Bold", ve);
            Cell("CarbuDernier", rx + 14, top + 78, 218, 70, "DERNIER TOUR", P("Carburant.DernierTour"), 28, White, null, ve);
            Cell("CarbuMoy5", rx + 241, top + 78, 218, 70, "MOY. 5 TOURS", P("Carburant.Moy5"), 28, White, null, ve);
            Cell("CarbuTours", rx + 14, top + 154, 445, 70, "TOURS RESTANTS", P("Carburant.ToursRestants"), 28, White, null, ve);
            Cell("Ratio", lx, top + 244, 310, 84, "RATIO CARBURANT", P("Ratio"), 32, White, null, ve);
            Cell("Prevu", lx + 326, top + 244, 310, 84, "TOUR PRÉVU", P("Chrono.Prevu"), 32);
            Cell("Moy5Tour", lx + 652, top + 244, 314, 84, "MOY. 5 TOURS", P("Chrono.Moy5"), 32);
        }

        // ----- Entrées : 1926,1020 → 619 × 403 -----
        static void Inputs()
        {
            const double x = 1926, y = 1020, w = 619;
            Card("Entrees", x, y, w, 403, "ENTRÉES");
            Text("Rapport", x + 30, y + 60, 160, 150, 130, P("Entrees.Rapport"), Cyan, 1, Digits, "Bold");
            Text("Vitesse", x + 220, y + 70, 360, 100, 90, P("Entrees.Vitesse"), White, 2, Digits, "Bold");
            Text("VitesseUnite", x + 220, y + 170, 360, 28, 18, Q("KM/H"), Grey, 2);
            // Throttle and brake as two bars, steering as a cursor.
            double bx = x + 60, by = y + 220, bh = 120;
            Rect("GazFond", bx, by, 220, 26, "#FF1E2A3A", null, 4);
            Rect("Gaz", bx, by, 0, 26, Green, null, 4, null, null, $"{P("Entrees.Accelerateur")} / 100 * 220");
            Text("GazNom", bx, by + 30, 220, 24, 16, P("Entrees.GazTexte"), Grey);
            Rect("FreinFond", bx + 280, by, 220, 26, "#FF1E2A3A", null, 4);
            Rect("Frein", bx + 280, by, 0, 26, Red, null, 4, null, null, $"{P("Entrees.Frein")} / 100 * 220");
            Text("FreinNom", bx + 280, by + 30, 220, 24, 16, P("Entrees.FreinTexte"), Grey);
            Text("VolantNom", bx, by + bh - 20, 300, 24, 16, Q("VOLANT"), Grey);
            Rect("VolantFond", bx, by + bh + 10, 500, 10, "#FF1E2A3A", null, 5);
            Rect("Volant", bx + 240, by + bh + 2, 20, 26, "#FFFFD54F", null, 4, null, $"{bx + 240} + {P("Entrees.Volant")} / 100 * 240");
        }
    }
}
