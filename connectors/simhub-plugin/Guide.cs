// Parcours guidé du plugin, au premier lancement (et depuis l'onglet Général) : 1. ce que le pilote veut que le plugin
// fasse (les modules Pour moi et Avec mon équipe), 2. un réglage par module coché qui en demande un (relier au site,
// où trouver l'overlay, les boutons…), 3. le récapitulatif. Maquette validée par Nathan le 19/11/2026.
// Shell : ce que SimHub affiche pour le plugin, le guide ou l'écran des modules (SettingsControl).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;

namespace EnduranceManager.SimHub
{
    public class Shell : ContentControl
    {
        readonly EnduranceManagerPlugin plugin;

        public Shell(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            Theme.Apply(this);
            if (plugin.Settings.GuideDone) ShowModules(); else ShowGuide();
        }

        public void ShowGuide() => Content = new Guide(plugin, ShowModules);
        public void ShowModules() => Content = new SettingsControl(plugin, ShowGuide);
    }

    public class Guide : UserControl
    {
        // The site's colours (Theme.cs).
        static readonly Brush Blue = Theme.Accent, Track = Theme.Border, Muted = Theme.Muted, Green = Theme.Ok, Orange = Theme.Warn, Card = Theme.Panel, Edge = Theme.Border;

        // A module of the first step: its name, what it does, read and saved on the plugin's settings.
        class Choice
        {
            public string Name, Text;
            public Func<Settings, bool> Get;
            public Action<EnduranceManagerPlugin, bool> Set;
            public CheckBox Box;
            public bool On => Box.IsChecked == true;
        }

        readonly EnduranceManagerPlugin plugin;
        readonly Action done;
        readonly List<Choice> mine, team;
        readonly DispatcherTimer timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        // The screen shown: 0 the modules, 1 the settings one by one (which), 2 the recap.
        int step, setting;
        List<Func<UIElement>> settings = new List<Func<UIElement>>();
        Action tick;

        public Guide(EnduranceManagerPlugin plugin, Action done)
        {
            this.plugin = plugin;
            this.done = done;
            mine = new List<Choice>
            {
                new Choice { Name = "Overlay relais", Text = "Après chaque tour : ton temps, ton énergie et l'usure des pneus face à ta cible.",
                    Get = s => s.Overlays, Set = (p, on) => p.SetModule(x => x.Overlays = on) },
                new Choice { Name = "Réglages voiture en course", Text = "Tes réglages perso de la black box en une touche.",
                    Get = s => s.Profiles, Set = (p, on) => p.SetModule(x => x.Profiles = on) },
                new Choice { Name = "Black box sur boutons", Text = "Modifie la black box et le menu des stands avec des boutons, sur ton volant ou ton Stream Deck.",
                    Get = s => s.CompanionOn, Set = (p, on) => { if (on != p.Settings.CompanionOn) p.SetModule(x => x.Companion = on); } },
                new Choice { Name = "Mur des stands", Text = "Le mur des stands de ta voiture dans SimHub, sans le site.",
                    Get = s => s.Wall, Set = (p, on) => p.SetWall(on) },
            };
            team = new List<Choice>
            {
                new Choice { Name = "Télémétrie Mémo", Text = "Tes tours arrivent dans la Télémétrie Mémo de l'équipe sur le site.",
                    Get = s => s.Enabled, Set = (p, on) => p.SetEnabled(on) },
                new Choice { Name = "Mur des stands équipages", Text = "Envoie ta voiture sur le site : tes coéquipiers suivent ton relais sur le mur des stands.",
                    Get = s => s.Share, Set = (p, on) => p.SetShare(on) },
                new Choice { Name = "Aide au développement", Text = "Envoie au développeur ce que fait le plugin, pour corriger les bugs. Pas obligatoire, mais ça aide beaucoup.",
                    Get = s => s.Report, Set = (p, on) => p.SetModule(x => x.Report = on) },
            };
            foreach (var c in mine.Concat(team))
                c.Box = new CheckBox { IsChecked = c.Get(plugin.Settings), Margin = new Thickness(0, 3, 10, 0), VerticalAlignment = VerticalAlignment.Top, Cursor = System.Windows.Input.Cursors.Hand };
            timer.Tick += (sender, args) => tick?.Invoke();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Show();
        }

        // ---------- Screens ----------

        void Show()
        {
            tick = null;
            if (step == 0) Content = Modules();
            else if (step == 1) Content = Frame("ÉTAPE 2 SUR 3 · RÉGLAGE " + (setting + 1) + " SUR " + settings.Count, settings[setting](), true);
            else Content = Recap();
        }

        UIElement Modules()
        {
            var columns = new Grid { Margin = new Thickness(0, 6, 0, 0) };
            columns.ColumnDefinitions.Add(new ColumnDefinition());
            columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(24) });
            columns.ColumnDefinitions.Add(new ColumnDefinition());
            var left = Column("Pour moi", "Avec SimHub seul, rien ne sort de ton PC", mine);
            var right = Column("Avec mon équipe", "Passe par le site de l'équipe, à relier à l'étape suivante", team);
            Grid.SetColumn(right, 2);
            columns.Children.Add(left);
            columns.Children.Add(right);
            var body = new StackPanel();
            body.Children.Add(Heading("Que veux-tu que le plugin fasse ?"));
            body.Children.Add(new TextBlock { Text = "Coche ce qui te sert. Tu pourras changer plus tard.", Opacity = 0.8, Margin = new Thickness(0, 4, 0, 14) });
            body.Children.Add(columns);
            var skip = Link("Passer le guide");
            skip.Click += (sender, args) => Finish();
            return Frame("ÉTAPE 1 SUR 3", body, false, skip);
        }

        static StackPanel Column(string title, string intro, List<Choice> choices)
        {
            var panel = new StackPanel();
            panel.Children.Add(new TextBlock { Text = title, FontSize = 15, FontWeight = FontWeights.SemiBold });
            panel.Children.Add(new TextBlock { Text = intro, FontSize = 12, Foreground = Muted, Margin = new Thickness(0, 2, 0, 10), TextWrapping = TextWrapping.Wrap });
            foreach (var c in choices)
            {
                var text = new TextBlock { TextWrapping = TextWrapping.Wrap };
                text.Inlines.Add(new System.Windows.Documents.Run(c.Name) { FontWeight = FontWeights.SemiBold });
                text.Inlines.Add(new System.Windows.Documents.LineBreak());
                text.Inlines.Add(new System.Windows.Documents.Run(c.Text) { Foreground = Muted });
                text.MouseLeftButtonUp += (sender, args) => c.Box.IsChecked = c.Box.IsChecked != true;
                var line = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
                if (c.Box.Parent is Panel old) old.Children.Remove(c.Box);
                DockPanel.SetDock(c.Box, Dock.Left);
                line.Children.Add(c.Box);
                line.Children.Add(text);
                panel.Children.Add(line);
            }
            return panel;
        }

        // The settings the checked modules need, in the order of the first step.
        void Plan()
        {
            settings = new List<Func<UIElement>>();
            if (mine[0].On) settings.Add(Overlay);
            if (mine[1].On) settings.Add(Profiles);
            if (mine[2].On) settings.Add(Companion);
            if (mine[3].On) settings.Add(Wall);
            if (team.Any(c => c.On)) settings.Insert(0, Site);
        }

        UIElement Site()
        {
            var body = new StackPanel();
            body.Children.Add(Heading("Relier au site"));
            var state = new TextBlock { FontSize = 14, Margin = new Thickness(0, 6, 0, 12), TextWrapping = TextWrapping.Wrap };
            body.Children.Add(state);
            body.Children.Add(Steps("Ouvre la page Fiches combo du site de ton équipe.", "Clique « Créer mon code ». Le code est copié.", "Reviens ici : le plugin le trouve tout seul."));
            var open = Link("Ouvrir le site");
            open.Margin = new Thickness(0, 4, 0, 12);
            open.HorizontalAlignment = HorizontalAlignment.Left;
            open.Click += (sender, args) => { try { Process.Start(new ProcessStartInfo((plugin.Link?.Origin ?? Updater.PublicSite) + "/fiches-combo.html") { UseShellExecute = true }); } catch { } };
            body.Children.Add(open);
            var dot = new System.Windows.Shapes.Ellipse { Width = 12, Height = 12, Margin = new Thickness(0, 3, 12, 0), VerticalAlignment = VerticalAlignment.Top };
            var title = new TextBlock { FontWeight = FontWeights.SemiBold };
            var detail = new TextBlock { Foreground = Muted, TextWrapping = TextWrapping.Wrap };
            var text = new StackPanel();
            text.Children.Add(title);
            text.Children.Add(detail);
            var line = new DockPanel();
            DockPanel.SetDock(dot, Dock.Left);
            line.Children.Add(dot);
            line.Children.Add(text);
            body.Children.Add(Box(line));
            tick = () =>
            {
                if (LinkCode.Parse(plugin.Settings.Code) == null)
                {
                    string clip = "";
                    try { clip = Clipboard.GetText(); } catch { }
                    if (LinkCode.Parse(clip) is LinkCode found) plugin.SaveCode(found.ToString());
                }
                var code = LinkCode.Parse(plugin.Settings.Code);
                dot.Fill = code == null ? Orange : Green;
                title.Text = code == null ? "En attente du code" : "Relié à " + new Uri(code.Origin).Host;
                detail.Text = code == null ? "Le plugin regarde le presse-papiers toutes les 2 secondes." : "C'est bon, tu peux continuer.";
                state.Text = code == null ? "Pas encore de code : fais le point 1 ci-dessous." : "";
                state.Foreground = Orange;
                state.Visibility = code == null ? Visibility.Visible : Visibility.Collapsed;
            };
            tick();
            return body;
        }

        UIElement Overlay() => Info("Overlay relais",
            "Dans SimHub › Dash Studio › Overlays, choisis « Endurance Manager · Bandeau » ou « Endurance Manager · Colonne ».",
            "Il s'affiche en essais et en course, voiture en piste.",
            "Règle le nombre de tours par relais dans l'onglet Overlay relais : il fixe ta cible d'énergie par tour.");

        UIElement Profiles() => Info("Réglages voiture en course",
            "Un bouton du volant par profil (Sec, Inter, Pluie…) : appui court, la voiture passe dans ce profil ; appui de 2 s, il mémorise tes réglages du moment.",
            "Dans l'onglet Réglages voiture en course, donne à chaque commande de LMU le bouton qui appuie dessus.",
            "Charge une voiture dans LMU : ses profils apparaissent dans l'onglet.");

        UIElement Companion() => Info("Black box sur boutons",
            plugin.Companion.Running ? "C'est FMT companion, déjà lancé dans ce plugin." : "C'est FMT companion : il démarre au prochain lancement de SimHub.",
            "Dans son onglet, clique « Préparer LMU » : il relie les touches du jeu pour toi.",
            "Ensuite, donne tes boutons du volant ou du Stream Deck à chaque commande.");

        UIElement Wall() => Info("Mur des stands",
            "Dans SimHub › Dash Studio, ouvre le dash « Endurance Manager · Mur » sur un écran.",
            "Il se remplit dès que tu roules : classement, pneus, énergie, chrono, réglages.",
            "Rien ne passe par le site.");

        UIElement Recap()
        {
            var body = new StackPanel();
            body.Children.Add(Heading("C'est prêt"));
            var list = new StackPanel { Margin = new Thickness(0, 12, 0, 12) };
            var code = LinkCode.Parse(plugin.Settings.Code);
            bool any = false;
            foreach (var c in mine.Concat(team).Where(c => c.On))
            {
                any = true;
                bool needsSite = team.Contains(c) && code == null;
                bool later = c == mine[2] && !plugin.Companion.Running;
                list.Children.Add(Row(c.Name, needsSite ? "À faire : relier au site" : later ? "Au prochain lancement de SimHub" : "Prêt", needsSite || later ? Orange : Green));
            }
            if (team.Any(c => c.On) && code != null) list.Children.Insert(0, Row("Site de l'équipe", "Relié à " + new Uri(code.Origin).Host, Green));
            if (!any) list.Children.Add(new TextBlock { Text = "Aucun module coché : le plugin ne fait rien pour l'instant.", Foreground = Muted });
            body.Children.Add(list);
            body.Children.Add(new TextBlock { Text = "Tu peux ajouter ou couper un module à tout moment dans les onglets Pour moi et Avec mon équipe, et relancer ce guide depuis l'onglet Général.",
                Foreground = Muted, TextWrapping = TextWrapping.Wrap });
            return Frame("ÉTAPE 3 SUR 3", body, true, null, "Terminer");
        }

        // One screen at once, for the pictures of the screen (tests/Preview): nothing is saved.
        public void Jump(int screen, int which = 0)
        {
            Plan();
            step = screen == 1 && settings.Count == 0 ? 2 : screen;
            setting = Math.Min(which, Math.Max(0, settings.Count - 1));
            Show();
        }

        // ---------- Moving on ----------

        void Next()
        {
            if (step == 0)
            {
                foreach (var c in mine.Concat(team)) c.Set(plugin, c.On);
                Plan();
                step = settings.Count > 0 ? 1 : 2;
                setting = 0;
            }
            else if (step == 1 && setting + 1 < settings.Count) setting++;
            else if (step == 1) step = 2;
            else { Finish(); return; }
            Show();
        }

        void Back()
        {
            if (step == 2 && settings.Count > 0) { step = 1; setting = settings.Count - 1; }
            else if (step == 1 && setting > 0) setting--;
            else step = 0;
            Show();
        }

        void Finish()
        {
            plugin.SetModule(x => x.GuideDone = true);
            done();
        }

        // ---------- Pieces ----------

        // A screen: the step line (and its bars), the content, then Retour / Plus tard / Continuer.
        UIElement Frame(string stepText, UIElement body, bool back, Button left = null, string next = "Continuer")
        {
            var page = new DockPanel { Margin = new Thickness(28, 24, 28, 24), MaxWidth = 760, HorizontalAlignment = HorizontalAlignment.Left, LastChildFill = true };
            var top = new StackPanel();
            if (step == 1)
            {
                var bars = new UniformGrid { Rows = 1, Margin = new Thickness(0, 0, 0, 14) };
                for (int i = 0; i < settings.Count; i++) bars.Children.Add(new Border { Height = 4, CornerRadius = new CornerRadius(2), Margin = new Thickness(0, 0, 6, 0), Background = i <= setting ? Blue : Track });
                top.Children.Add(bars);
            }
            top.Children.Add(new TextBlock { Text = stepText, FontSize = 12, Foreground = Muted, Margin = new Thickness(0, 0, 0, 8) });
            DockPanel.SetDock(top, Dock.Top);
            page.Children.Add(top);
            var buttons = new DockPanel { Margin = new Thickness(0, 20, 0, 0) };
            if (back)
            {
                var b = Theme.Secondary("Retour");
                b.Click += (sender, args) => Back();
                buttons.Children.Add(b);
            }
            else if (left != null) buttons.Children.Add(left);
            var right = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            if (step == 1)
            {
                var later = Link("Plus tard");
                later.Margin = new Thickness(0, 0, 14, 0);
                later.Click += (sender, args) => Next();
                right.Children.Add(later);
            }
            var go = Theme.Primary(next);
            go.Margin = new Thickness(0);
            go.Click += (sender, args) => Next();
            right.Children.Add(go);
            DockPanel.SetDock(right, Dock.Right);
            buttons.Children.Insert(0, right);
            DockPanel.SetDock(buttons, Dock.Bottom);
            page.Children.Add(buttons);
            page.Children.Add(new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
            return page;
        }

        UIElement Info(string title, params string[] lines)
        {
            var body = new StackPanel();
            body.Children.Add(Heading(title));
            var steps = Steps(lines);
            steps.Margin = new Thickness(0, 14, 0, 0);
            body.Children.Add(steps);
            return body;
        }

        static TextBlock Heading(string text) => new TextBlock { Text = text, FontSize = 24, FontWeight = FontWeights.Bold };

        static StackPanel Steps(params string[] lines)
        {
            var list = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
            for (int i = 0; i < lines.Length; i++)
            {
                var line = new DockPanel { Margin = new Thickness(0, 0, 0, 10) };
                var n = new TextBlock { Text = (i + 1) + ".", Width = 22, FontSize = 14, Foreground = Muted };
                DockPanel.SetDock(n, Dock.Left);
                line.Children.Add(n);
                line.Children.Add(new TextBlock { Text = lines[i], FontSize = 14, TextWrapping = TextWrapping.Wrap });
                list.Children.Add(line);
            }
            return list;
        }

        static Border Box(UIElement inside) => new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = Theme.Medium, Padding = new Thickness(16, 14, 16, 14), Child = inside };

        static UIElement Row(string name, string state, Brush color)
        {
            var line = new DockPanel();
            var right = new TextBlock { Text = state, Foreground = color };
            DockPanel.SetDock(right, Dock.Right);
            line.Children.Add(right);
            line.Children.Add(new TextBlock { Text = name });
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = Theme.Small, Padding = new Thickness(16, 11, 16, 11), Margin = new Thickness(0, 0, 0, 8), Child = line };
        }

        static Button Link(string text) => Theme.Link(text);
    }
}
