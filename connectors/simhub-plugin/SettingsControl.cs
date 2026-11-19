// Écran du plugin dans SimHub, en onglets : « Général » (ce que fait LMU, mise à jour, version), « Pour moi » (SimHub
// seul : Overlay relais, Réglages voiture en course, Black box sur boutons, Mur des stands) et « Avec mon équipe » (le
// site : Relier au site, Télémétrie Mémo, Mur des stands équipages, Aide au développement). Chaque module a son
// interrupteur en haut de son onglet.
using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace EnduranceManager.SimHub
{
    public class SettingsControl : UserControl
    {
        // The site's colours (Theme.cs, styles/tokens.css).
        static readonly Brush Green = Theme.Ok, Orange = Theme.Warn, Red = Theme.Danger, Grey = Theme.Faint, Card = Theme.Panel, Edge = Theme.Border, Accent = Theme.Accent;

        readonly EnduranceManagerPlugin plugin;
        readonly Ellipse linkDot = Dot(), gameDot = Dot();
        readonly TextBlock linkTitle = Title(), linkDetail = Detail(), gameTitle = Title(), gameDetail = Detail();
        readonly TextBlock message = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 0), Visibility = Visibility.Collapsed };
        readonly Button paste = Action("Coller mon code", true), open = Action("Ouvrir le site", false), update = Action("Mettre à jour", true);
        readonly TextBlock version = new TextBlock { Foreground = Theme.Faint, FontSize = 11, Margin = new Thickness(2, 4, 0, 0), TextWrapping = TextWrapping.Wrap };
        readonly Border updateBox;
        readonly TextBlock updateText = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10) };

        public SettingsControl(EnduranceManagerPlugin plugin, Action guide = null)
        {
            this.plugin = plugin;
            var page = Page("Endurance Manager", "Un seul plugin, en modules que tu actives ou coupes. Pour moi : avec SimHub seul. Avec mon équipe : passe par le site de ton équipe.");

            // A newer version on the site: one button, the installer does the rest.
            var updatePanel = new StackPanel();
            updatePanel.Children.Add(updateText);
            update.HorizontalAlignment = HorizontalAlignment.Left;
            updatePanel.Children.Add(update);
            updateBox = new Border { Background = Card, BorderBrush = Accent, BorderThickness = new Thickness(1), CornerRadius = Theme.Medium, Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = updatePanel, Visibility = Visibility.Collapsed };
            page.Children.Add(updateBox);

            page.Children.Add(Box("Le Mans Ultimate", gameDot, gameTitle, gameDetail));
            page.Children.Add(new TextBlock { Text = "Seuls Réglages voiture en course et Black box sur boutons changent quelque chose dans le jeu, quand tu appuies sur un de leurs boutons.", Foreground = Theme.Faint, FontSize = 11, Margin = new Thickness(2, 4, 0, 0), TextWrapping = TextWrapping.Wrap });
            page.Children.Add(version);
            // The guided path again (Guide.cs).
            var again = Action("Relancer le guide", false);
            again.HorizontalAlignment = HorizontalAlignment.Left;
            again.Margin = new Thickness(0, 14, 0, 0);
            again.Click += (sender, args) => guide?.Invoke();
            if (guide != null) page.Children.Add(again);

            // Pour moi: SimHub alone.
            var overlays = Page("Overlay relais", "Après chaque tour : ton temps, ton énergie et l'usure des pneus face à ta cible.");
            overlays.Children.Add(Switch("Activer ce module", plugin.Settings.Overlays, on => plugin.SetModule(x => x.Overlays = on)));
            overlays.Children.Add(BannerBox());
            // Black box sur boutons = FMT companion, whole: its own screen below the switch when it runs.
            var companion = Page("Black box sur boutons", "Modifie la black box et le menu des stands avec des boutons, sur ton volant ou ton Stream Deck (FMT companion). Activé ou coupé, il change au prochain lancement de SimHub.");
            companion.Children.Add(Switch("Activer ce module", plugin.Settings.CompanionOn, on => plugin.SetModule(x => x.Companion = on)));
            companion.Children.Add(companionText);
            var screen = plugin.Companion.Running ? plugin.Companion.Screen(plugin.PluginManager) : null;
            if (screen != null) companion.Children.Add(screen);
            var wall = Page("Mur des stands", "Le mur des stands de ta voiture dans SimHub, sans le site : dash « Endurance Manager · Mur » dans Dash Studio.");
            wall.Children.Add(Switch("Activer ce module", plugin.Settings.Wall, on => plugin.SetWall(on)));
            wall.Children.Add(wallText);

            // Avec mon équipe: the site's link first, then the modules that use it.
            var site = Page("Relier au site", "Pour les modules d'équipe : le code créé sur le site de ton équipe relie ce plugin à ton compte.");
            var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 14, 0, 0) };
            buttons.Children.Add(paste);
            buttons.Children.Add(open);
            site.Children.Add(Box("Site de l'équipe", linkDot, linkTitle, linkDetail, buttons, message));
            var combos = Page("Télémétrie Mémo", "Tes tours arrivent dans la Télémétrie Mémo de l'équipe sur le site.");
            combos.Children.Add(Switch("Activer ce module", plugin.Settings.Enabled, on => plugin.SetEnabled(on)));
            combos.Children.Add(sessionText);
            var share = Page("Mur des stands équipages", "Envoie ta voiture sur le site : tes coéquipiers suivent ton relais sur le mur des stands.");
            share.Children.Add(Switch("Activer ce module", plugin.Settings.Share, on => plugin.SetShare(on)));
            share.Children.Add(shareText);
            // Aide au développement: the journal, « Signaler un problème », and the full recording for the replay tests.
            var report = Page("Aide au développement", "Envoie au développeur ce que fait le plugin, pour corriger les bugs. Pas obligatoire, mais ça aide beaucoup.");
            report.Children.Add(Switch("Activer ce module", plugin.Settings.Report, on => plugin.SetModule(x => x.Report = on)));
            report.Children.Add(reportText);
            var note = new TextBox { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 60, Margin = new Thickness(0, 10, 0, 8) };
            var signal = Action("Signaler un problème", true);
            var folder = Action("Ouvrir le dossier", false);
            signal.Click += (sender, args) =>
            {
                reportSaid = DateTime.Now.AddSeconds(15);
                if (string.IsNullOrWhiteSpace(note.Text)) { reportText.Text = "Écris d'abord en une phrase ce qui ne va pas."; return; }
                plugin.Signal(note.Text.Trim());
                note.Text = "";
                reportText.Text = plugin.Link != null ? "Merci, c'est noté : il part sur le site dès que tu n'es plus en piste." : "Merci, c'est noté dans le dossier des retours (pas encore relié au site : à envoyer à la main).";
            };
            folder.Click += (sender, args) => { try { System.IO.Directory.CreateDirectory(Report.Folder); Process.Start(new ProcessStartInfo(Report.Folder) { UseShellExecute = true }); } catch { } };
            report.Children.Add(new TextBlock { Text = "Ce qui ne va pas, en une phrase :", Margin = new Thickness(0, 14, 0, 0) });
            report.Children.Add(note);
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 18) };
            row.Children.Add(signal);
            row.Children.Add(folder);
            report.Children.Add(row);
            // The recorder for the replay tests (Tape.cs): off at each start of SimHub, heavy, kept on the PC.
            report.Children.Add(Switch("Enregistrer ma séance complète pour les tests (gros fichier, reste sur ce PC)", Tape.Recording, on => plugin.SetRecording(on)));
            report.Children.Add(recordText);
            var mine = new TabControl { Margin = new Thickness(0, 8, 0, 0) };
            mine.Items.Add(Tab("Overlay relais", overlays));
            mine.Items.Add(new TabItem { Header = "Réglages voiture en course", Content = new ProfilesControl(plugin) });
            // Its own screen is wide: no fixed-width page around it.
            companion.Width = double.NaN;
            mine.Items.Add(Tab("Black box sur boutons", companion));
            mine.Items.Add(Tab("Mur des stands", wall));
            var crew = new TabControl { Margin = new Thickness(0, 8, 0, 0) };
            crew.Items.Add(Tab("Relier au site", site));
            crew.Items.Add(Tab("Télémétrie Mémo", combos));
            crew.Items.Add(Tab("Mur des stands équipages", share));
            crew.Items.Add(Tab("Aide au développement", report));
            var tabs = new TabControl { Margin = new Thickness(8) };
            tabs.Items.Add(Tab("Général", page));
            tabs.Items.Add(new TabItem { Header = "Pour moi", Content = Group("Avec SimHub seul, rien ne sort de ton PC.", mine) });
            tabs.Items.Add(new TabItem { Header = "Avec mon équipe", Content = Group("Passe par le site de ton équipe. Commence par « Relier au site ».", crew) });

            paste.Click += (sender, args) => PasteCode(false);
            update.Click += (sender, args) => StartUpdate();
            open.Click += (sender, args) =>
            {
                var code = plugin.Link;
                if (code != null) try { Process.Start(new ProcessStartInfo(code.Origin + "/") { UseShellExecute = true }); } catch { }
            };

            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
            timer.Tick += (sender, args) => Refresh();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Refresh();
            Content = tabs;
        }

        // The code copied on the site, taken from the clipboard: nothing to type. Not linked yet, the screen looks
        // by itself every two seconds (automatic): the pilot only clicks « Créer mon code » on the site.
        readonly TextBlock sessionText = Detail(), wallText = Detail(), shareText = Detail(), recordText = Detail(), companionText = Detail(), reportText = Detail();
        // A message after « Signaler » stays a few seconds before the state comes back.
        DateTime reportSaid;

        static StackPanel Page(string title, string intro)
        {
            var page = new StackPanel { Margin = new Thickness(20), Width = 600, HorizontalAlignment = HorizontalAlignment.Left };
            page.Children.Add(new TextBlock { Text = title, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Theme.Text });
            page.Children.Add(new TextBlock { Text = intro, Foreground = Theme.Muted, Margin = new Thickness(0, 4, 0, 18), TextWrapping = TextWrapping.Wrap });
            return page;
        }

        // A group of modules: one line saying what they have in common, then their tabs.
        static UIElement Group(string intro, TabControl modules)
        {
            var panel = new DockPanel { Margin = new Thickness(12, 10, 12, 0) };
            var text = new TextBlock { Text = intro, Foreground = Theme.Muted, TextWrapping = TextWrapping.Wrap };
            DockPanel.SetDock(text, Dock.Top);
            panel.Children.Add(text);
            panel.Children.Add(modules);
            return panel;
        }

        static TabItem Tab(string header, UIElement page) => new TabItem { Header = header, Content = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto } };

        // A module's on/off switch.
        public static CheckBox Switch(string text, bool on, Action<bool> save)
        {
            var box = new CheckBox { Content = text, FontSize = 14, IsChecked = on, Margin = new Thickness(0, 0, 0, 14), Cursor = System.Windows.Input.Cursors.Hand };
            box.Checked += (sender, args) => save(true);
            box.Unchecked += (sender, args) => save(false);
            return box;
        }

        void PasteCode(bool automatic)
        {
            string text = "";
            try { text = Clipboard.GetText(); } catch { }
            var code = LinkCode.Parse(text);
            if (code == null)
            {
                if (!automatic) Say("Aucun code dans le presse-papiers. Sur le site : Fiches combo → « Relier SimHub » → « Créer mon code », puis reclique ici.", Orange);
                return;
            }
            plugin.SaveCode(code.ToString());
            Say("Code enregistré. Tes séances partiront dans la minute.", Green);
            Refresh();
        }

        void Say(string text, Brush color) { message.Text = text; message.Foreground = color; message.Visibility = Visibility.Visible; }

        // Never while driving: the installer closes SimHub. Fetched aside, so the screen never freezes.
        void StartUpdate()
        {
            var code = plugin.Link;
            if (plugin.GameState == "track") { updateText.Text = "Termine d'abord ta séance : la mise à jour ferme et relance SimHub."; return; }
            update.IsEnabled = false;
            updateText.Text = "Téléchargement de l'installeur…";
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                string error = plugin.Updater.Start(code);
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    update.IsEnabled = true;
                    updateText.Text = error ?? "SimHub se ferme : l'installeur met la nouvelle version et le relance. Tes réglages sont gardés.";
                    // SimHub closes itself, as from its own menu (settings saved), so the installer has nothing to wait for.
                    if (error == null) Dispatcher.BeginInvoke(new Action(() => Application.Current?.Shutdown()), System.Windows.Threading.DispatcherPriority.Background);
                }));
            });
        }

        void Refresh()
        {
            if (stint != null && (int)Math.Round(stint.Value) != plugin.Settings.StintLaps) stint.Value = plugin.Settings.StintLaps;
            bool siteOn = plugin.TeamOn;
            if (LinkCode.Parse(plugin.Settings.Code) == null) PasteCode(true);
            var code = plugin.Link;
            var uploader = plugin.Uploader;
            string host = code == null ? "" : new Uri(code.Origin).Host;
            paste.Content = LinkCode.Parse(plugin.Settings.Code) == null ? "Coller mon code" : "Changer de code";
            open.Visibility = code == null ? Visibility.Collapsed : Visibility.Visible;

            int waiting = uploader?.Waiting ?? 0;
            string kept = waiting > 0 ? $" {waiting} séance{(waiting > 1 ? "s" : "")} en attente, rien n'est perdu." : "";
            if (!siteOn) Show(linkDot, Grey, linkTitle, "Aucun module d'équipe activé", linkDetail, "Le plugin marche seul : rien n'est envoyé ni lu sur le site." + kept);
            else if (code == null) Show(linkDot, Orange, linkTitle, "Pas encore relié", linkDetail, "Sur le site : Fiches combo → « Relier SimHub » → « Créer mon code ». Le plugin le trouve tout seul ici.");
            else if (uploader?.Refused is string refused) Show(linkDot, Red, linkTitle, "Liaison refusée", linkDetail, refused + kept);
            else if (uploader?.Reached == false) Show(linkDot, Orange, linkTitle, "Site injoignable", linkDetail, "Nouvel essai dans une minute." + kept);
            else if (uploader?.Reached == true) Show(linkDot, Green, linkTitle, "Relié à " + host, linkDetail,
                uploader.LastSent is DateTime last ? $"Dernier envoi à {last:HH:mm} · {uploader.SentToday} aujourd'hui" : "À jour, rien à envoyer pour l'instant.");
            else Show(linkDot, Grey, linkTitle, "Relié à " + host, linkDetail, "Premier envoi dans la minute.");

            var available = plugin.Updater.Available;
            version.Text = "Version " + Updater.Build;
            plugin.Updater.Check(code);
            if (available != null)
            {
                if (updateBox.Visibility != Visibility.Visible) updateText.Text = "Une nouvelle version du plugin est prête (" + available.ToString(3) + ", tu as la " + Updater.Current.ToString(3) + ").";
                updateBox.Visibility = Visibility.Visible;
            }
            else updateBox.Visibility = Visibility.Collapsed;

            var api = plugin.Api;
            string service = api.ReadAt is DateTime read ? $"Temps de service de la voiture lus à {read:HH:mm}." : "Les temps de service seront lus dès que tu rouleras.";
            if (api.Setup is string setup) service += "\nRéglage chargé : " + setup;
            sessionText.Text = !plugin.Settings.Enabled ? "Module coupé : aucune séance enregistrée. Celles déjà enregistrées attendent sur le PC."
                : plugin.LastSession is string recorded ? "Dernière séance enregistrée : " + recorded : "Aucune séance enregistrée depuis le lancement de SimHub.";
            if (plugin.Settings.Enabled && code == null) sessionText.Text += "\nPas encore relié au site : les séances restent sur ce PC, elles partiront une fois relié.";
            if (uploader?.LastRefusal is string refusal) sessionText.Text += "\nUne séance a été refusée par le site " + refusal + ". Elle est gardée dans le dossier sessions\\refused.";
            recordText.Text = Tape.Status;
            if (DateTime.Now > reportSaid)
            {
                int files = Report.WaitingCount;
                reportText.Text = !plugin.Settings.Report ? "Module coupé : rien n'est noté." : "Journal en cours, écrit à la fin de chaque séance."
                    + (files > 0 ? $" {files} fichier{(files > 1 ? "s" : "")} en attente d'envoi." : "")
                    + (Report.LastSent is string at ? $" Dernier envoi à {at}." : "")
                    + (plugin.Link == null ? " Pas encore relié au site : les fichiers restent dans Documents\\Endurance Manager\\Retours." : "");
            }
            companionText.Text = plugin.Settings.CompanionOn == plugin.Companion.Running ? plugin.Companion.Status
                : plugin.Settings.CompanionOn ? "Activé : FMT companion démarre au prochain lancement de SimHub." + (plugin.Companion.Status.StartsWith("Module") ? "" : "\n" + plugin.Companion.Status)
                : "Coupé : FMT companion s'arrête au prochain lancement de SimHub.";
            wallText.Text = !plugin.Settings.Wall ? "Module coupé." : "Mur des stands : " + plugin.Wall.Status;
            shareText.Text = !plugin.Settings.Share ? "Module coupé : ta voiture n'est pas partagée." : code == null ? "Pas encore relié : va dans « Relier au site »."
                : plugin.Live.Status + (plugin.Live.SentAt is DateTime sent ? $" (dernier envoi à {sent:HH:mm:ss})" : "");
            if (plugin.GameState == "paused")
            {
                Show(gameDot, Grey, gameTitle, "Tous les modules sont coupés", gameDetail, "Le plugin ne lit rien du jeu et n'envoie rien.");
                return;
            }
            switch (plugin.GameState)
            {
                case "track": Show(gameDot, Green, gameTitle, plugin.Settings.Enabled ? "En piste · séance enregistrée" : "En piste", gameDetail, service); break;
                case "menu": Show(gameDot, Grey, gameTitle, "Ouvert, au menu ou au garage", gameDetail, service); break;
                default: Show(gameDot, Grey, gameTitle, "Fermé", gameDetail, "Lance le jeu et roule : le plugin enregistre tout seul."); break;
            }
        }

        static void Show(Ellipse dot, Brush color, TextBlock title, string titleText, TextBlock detail, string detailText)
        {
            dot.Fill = color; title.Text = titleText; detail.Text = detailText;
        }

        static Ellipse Dot() => new Ellipse { Width = 12, Height = 12, Margin = new Thickness(0, 4, 10, 0), VerticalAlignment = VerticalAlignment.Top };
        static TextBlock Title() => new TextBlock { Foreground = Theme.Text, FontSize = 15, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap };
        static TextBlock Detail() => new TextBlock { Foreground = Theme.Muted, Margin = new Thickness(0, 2, 0, 0), TextWrapping = TextWrapping.Wrap };

        static Button Action(string text, bool main) => main ? Theme.Primary(text) : Theme.Secondary(text);

        // The overlays: where to find them in Dash Studio, and the stint length that sets the energy aimed at.
        Border BannerBox()
        {
            var inside = new StackPanel();
            inside.Children.Add(Theme.Kicker("Dans Dash Studio"));
            inside.Children.Add(new TextBlock { Foreground = Theme.Muted, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10),
                Text = "Ton dernier tour (temps, énergie, usure des 4 pneus) face à la valeur visée, avec ta moyenne, celle de l'équipe et la meilleure. "
                    + "Dans SimHub › Dash Studio › Overlays : « Endurance Manager · Bandeau » ou « Endurance Manager · Colonne ». Ils s'affichent en essais et en course, voiture en piste. "
                    + "En roulant, les tours par relais se changent avec les boutons A (+1) et B (−1) des dashs, s'ils sont reliés à ton volant, "
                    + "ou avec les actions « ToursParRelaisPlus » et « ToursParRelaisMoins » du plugin, dans Contrôles et événements." });
            inside.Children.Add(Setting("Tours par relais", 1, 60, 1, plugin.Settings.StintLaps, value => $"{value:0} tours", value => plugin.SetStintLaps((int)Math.Round(value)), out stint));
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = Theme.Medium, Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }

        // One slider line: its name, the slider, its value.
        // Changed from the wheel too (dash buttons A and B): the slider follows at each refresh.
        Slider stint;

        static FrameworkElement Setting(string name, double min, double max, double step, double value, Func<double, string> format, Action<double> save, out Slider slider)
        {
            var line = new DockPanel { Margin = new Thickness(0, 4, 0, 4) };
            var label = new TextBlock { Text = name, Foreground = Theme.Text, Width = 120, VerticalAlignment = VerticalAlignment.Center };
            var shown = new TextBlock { Foreground = Theme.Text, Width = 70, TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            slider = new Slider { Minimum = min, Maximum = max, SmallChange = step, LargeChange = step * 5, TickFrequency = step, IsSnapToTickEnabled = true,
                Value = Math.Max(min, Math.Min(max, value)), VerticalAlignment = VerticalAlignment.Center };
            shown.Text = format(slider.Value);
            slider.ValueChanged += (sender, args) => { shown.Text = format(args.NewValue); save(args.NewValue); };
            DockPanel.SetDock(label, Dock.Left);
            DockPanel.SetDock(shown, Dock.Right);
            line.Children.Add(label);
            line.Children.Add(shown);
            line.Children.Add(slider);
            return line;
        }

        // A card: a small heading, then the state line (coloured dot, title, detail) and what goes below it.
        static Border Box(string heading, Ellipse dot, TextBlock title, TextBlock detail, params UIElement[] below)
        {
            var text = new StackPanel();
            text.Children.Add(title);
            text.Children.Add(detail);
            var line = new DockPanel();
            DockPanel.SetDock(dot, Dock.Left);
            line.Children.Add(dot);
            line.Children.Add(text);
            var inside = new StackPanel();
            inside.Children.Add(Theme.Kicker(heading));
            inside.Children.Add(line);
            foreach (var element in below) inside.Children.Add(element);
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = Theme.Medium, Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }
    }
}
