// Écran du plugin dans SimHub : où en est la liaison avec le site, ce que fait LMU, et un seul geste à faire,
// coller le code de liaison donné par la page des fiches combo.
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
        static readonly Brush Green = Fill("#2EAD5B"), Orange = Fill("#E8A33D"), Red = Fill("#D9534F"), Grey = Fill("#8A8F98"),
            Card = Fill("#14FFFFFF"), Edge = Fill("#26FFFFFF"), Accent = Fill("#E8562A");

        static Brush Fill(string color) { var brush = (Brush)new BrushConverter().ConvertFromString(color); brush.Freeze(); return brush; }

        readonly EnduranceManagerPlugin plugin;
        readonly Ellipse linkDot = Dot(), gameDot = Dot();
        readonly TextBlock linkTitle = Title(), linkDetail = Detail(), gameTitle = Title(), gameDetail = Detail();
        readonly TextBlock message = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 0), Visibility = Visibility.Collapsed };
        readonly Button paste = Action("Coller mon code", true), open = Action("Ouvrir le site", false), update = Action("Mettre à jour", true);
        readonly TextBlock version = new TextBlock { Opacity = 0.5, FontSize = 11, Margin = new Thickness(2, 4, 0, 0), TextWrapping = TextWrapping.Wrap };
        readonly Border updateBox;
        readonly TextBlock updateText = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10) };
        readonly CheckBox enabled = new CheckBox { Content = "Plugin activé : enregistrer et envoyer mes séances", FontSize = 14, Margin = new Thickness(0, 0, 0, 6), Cursor = System.Windows.Input.Cursors.Hand };
        readonly CheckBox share = new CheckBox { Content = "Partager ma voiture en direct avec l'équipe (mur des stands)", FontSize = 14, Margin = new Thickness(0, 0, 0, 14), Cursor = System.Windows.Input.Cursors.Hand };

        public SettingsControl(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            var page = new StackPanel { Margin = new Thickness(20), Width = 600, HorizontalAlignment = HorizontalAlignment.Left };
            page.Children.Add(new TextBlock { Text = "Fiches combo", FontSize = 22, FontWeight = FontWeights.SemiBold });
            page.Children.Add(new TextBlock { Text = "Tes séances Le Mans Ultimate arrivent toutes seules dans les fiches combo de ton équipe.", Opacity = 0.7, Margin = new Thickness(0, 2, 0, 16), TextWrapping = TextWrapping.Wrap });

            // The on/off switch: off, the plugin reads nothing from the game and sends nothing.
            enabled.IsChecked = plugin.Settings.Enabled;
            enabled.Checked += (sender, args) => { plugin.SetEnabled(true); Refresh(); };
            enabled.Unchecked += (sender, args) => { plugin.SetEnabled(false); Refresh(); };
            page.Children.Add(enabled);
            // Live sharing: on by default, the teammates follow the car on the site's mur des stands.
            share.IsChecked = plugin.Settings.Share;
            share.Checked += (sender, args) => { plugin.SetShare(true); Refresh(); };
            share.Unchecked += (sender, args) => { plugin.SetShare(false); Refresh(); };
            page.Children.Add(share);

            // A newer version on the site: one button, the installer does the rest.
            var updatePanel = new StackPanel();
            updatePanel.Children.Add(updateText);
            update.HorizontalAlignment = HorizontalAlignment.Left;
            updatePanel.Children.Add(update);
            updateBox = new Border { Background = Card, BorderBrush = Accent, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = updatePanel, Visibility = Visibility.Collapsed };
            page.Children.Add(updateBox);

            var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 14, 0, 0) };
            buttons.Children.Add(paste);
            buttons.Children.Add(open);
            page.Children.Add(Box("Liaison avec le site", linkDot, linkTitle, linkDetail, buttons, message));
            page.Children.Add(Box("Le Mans Ultimate", gameDot, gameTitle, gameDetail));
            page.Children.Add(BannerBox());
            page.Children.Add(new TextBlock { Text = "Le plugin ne fait que lire : il ne change rien dans le jeu ni dans SimHub.", Opacity = 0.5, FontSize = 11, Margin = new Thickness(2, 4, 0, 0), TextWrapping = TextWrapping.Wrap });
            page.Children.Add(version);

            paste.Click += (sender, args) => PasteCode(false);
            update.Click += (sender, args) => StartUpdate();
            open.Click += (sender, args) =>
            {
                var code = LinkCode.Parse(plugin.Settings.Code);
                if (code != null) try { Process.Start(new ProcessStartInfo(code.Origin + "/") { UseShellExecute = true }); } catch { }
            };

            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
            timer.Tick += (sender, args) => Refresh();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Refresh();
            Content = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        // The code copied on the site, taken from the clipboard: nothing to type. Not linked yet, the screen looks
        // by itself every two seconds (automatic): the pilot only clicks « Créer mon code » on the site.
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
            var code = LinkCode.Parse(plugin.Settings.Code);
            if (code == null) return;
            if (plugin.GameState == "track") { updateText.Text = "Termine d'abord ta séance : la mise à jour ferme et relance SimHub."; return; }
            update.IsEnabled = false;
            updateText.Text = "Téléchargement de l'installeur…";
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                string error = plugin.Updater.Start(code);
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    update.IsEnabled = true;
                    updateText.Text = error ?? "SimHub se ferme : l'installeur met la nouvelle version et le relance. Ta liaison est gardée.";
                    // SimHub closes itself, as from its own menu (settings saved), so the installer has nothing to wait for.
                    if (error == null) Dispatcher.BeginInvoke(new Action(() => Application.Current?.Shutdown()), System.Windows.Threading.DispatcherPriority.Background);
                }));
            });
        }

        void Refresh()
        {
            if (LinkCode.Parse(plugin.Settings.Code) == null) PasteCode(true);
            var code = LinkCode.Parse(plugin.Settings.Code);
            var uploader = plugin.Uploader;
            string host = code == null ? "" : new Uri(code.Origin).Host;
            paste.Content = code == null ? "Coller mon code" : "Changer de code";
            open.Visibility = code == null ? Visibility.Collapsed : Visibility.Visible;

            int waiting = uploader?.Waiting ?? 0;
            string kept = waiting > 0 ? $" {waiting} séance{(waiting > 1 ? "s" : "")} en attente, rien n'est perdu." : "";
            if (code == null) Show(linkDot, Orange, linkTitle, "Pas encore relié", linkDetail, "Sur le site : Fiches combo → « Relier SimHub » → « Créer mon code ». Le plugin le trouve tout seul ici.");
            else if (uploader?.Refused is string refused) Show(linkDot, Red, linkTitle, "Liaison refusée", linkDetail, refused + kept);
            else if (uploader?.Reached == false) Show(linkDot, Orange, linkTitle, "Site injoignable", linkDetail, "Nouvel essai dans une minute." + kept);
            else if (uploader?.Reached == true) Show(linkDot, Green, linkTitle, "Relié à " + host, linkDetail,
                uploader.LastSent is DateTime last ? $"Dernier envoi à {last:HH:mm} · {uploader.SentToday} aujourd'hui" : "À jour, rien à envoyer pour l'instant.");
            else Show(linkDot, Grey, linkTitle, "Relié à " + host, linkDetail, "Premier envoi dans la minute.");

            var available = plugin.Updater.Available;
            version.Text = "Version " + Updater.Current.ToString(3);
            plugin.Updater.Check(code);
            if (available != null && code != null)
            {
                if (updateBox.Visibility != Visibility.Visible) updateText.Text = "Une nouvelle version du plugin est prête (" + available.ToString(3) + ", tu as la " + Updater.Current.ToString(3) + ").";
                updateBox.Visibility = Visibility.Visible;
            }
            else updateBox.Visibility = Visibility.Collapsed;

            var api = plugin.Api;
            string service = api.ReadAt is DateTime read ? $"Temps de service de la voiture lus à {read:HH:mm}." : "Les temps de service seront lus dès que tu rouleras.";
            if (api.Setup is string setup) service += "\nRéglage chargé : " + setup;
            service += "\n" + (plugin.LastSession is string recorded ? "Dernière séance enregistrée : " + recorded : "Aucune séance enregistrée depuis le lancement de SimHub.");
            service += "\n" + (!plugin.Settings.Share ? "Partage en direct coupé." : "Mur des stands : " + plugin.Live.Status
                + (plugin.Live.SentAt is DateTime sent ? $" (dernier envoi à {sent:HH:mm:ss})" : ""));
            if (uploader?.LastRefusal is string refusal) service += "\nUne séance a été refusée par le site " + refusal + ". Elle est gardée dans le dossier sessions\\refused.";
            if (!plugin.Settings.Enabled)
            {
                Show(gameDot, Grey, gameTitle, "En pause", gameDetail, "Le plugin ne lit rien du jeu et n'envoie rien. Les séances déjà enregistrées attendent sur le PC. Coche « Plugin activé » pour reprendre.");
                return;
            }
            switch (plugin.GameState)
            {
                case "track": Show(gameDot, Green, gameTitle, "En piste · séance enregistrée", gameDetail, service); break;
                case "menu": Show(gameDot, Grey, gameTitle, "Ouvert, au menu ou au garage", gameDetail, service); break;
                default: Show(gameDot, Grey, gameTitle, "Fermé", gameDetail, "Lance le jeu et roule : le plugin enregistre tout seul."); break;
            }
        }

        static void Show(Ellipse dot, Brush color, TextBlock title, string titleText, TextBlock detail, string detailText)
        {
            dot.Fill = color; title.Text = titleText; detail.Text = detailText;
        }

        static Ellipse Dot() => new Ellipse { Width = 12, Height = 12, Margin = new Thickness(0, 4, 10, 0), VerticalAlignment = VerticalAlignment.Top };
        static TextBlock Title() => new TextBlock { FontSize = 15, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap };
        static TextBlock Detail() => new TextBlock { Opacity = 0.7, Margin = new Thickness(0, 2, 0, 0), TextWrapping = TextWrapping.Wrap };

        static Button Action(string text, bool main)
        {
            var button = new Button { Content = text, Padding = new Thickness(16, 6, 16, 6), Margin = new Thickness(0, 0, 8, 0), Cursor = System.Windows.Input.Cursors.Hand };
            if (main) { button.Background = Accent; button.BorderBrush = Accent; button.Foreground = Brushes.White; }
            return button;
        }

        // The overlays: where to find them in Dash Studio, and the stint length that sets the energy aimed at.
        Border BannerBox()
        {
            var inside = new StackPanel();
            inside.Children.Add(new TextBlock { Text = "OVERLAYS ESSAIS ET COURSE", FontSize = 11, Opacity = 0.5, Margin = new Thickness(0, 0, 0, 8) });
            inside.Children.Add(new TextBlock { Opacity = 0.7, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10),
                Text = "Ton dernier tour (temps, énergie, usure des 4 pneus) face à la valeur visée, avec ta moyenne, celle de l'équipe et la meilleure. "
                    + "Dans SimHub › Dash Studio › Overlays : « Endurance Manager · Bandeau » ou « Endurance Manager · Colonne ». Ils s'affichent en essais et en course, voiture en piste. "
                    + "En roulant, les tours par relais se changent avec les boutons A (+1) et B (−1) des dashs, s'ils sont reliés à ton volant, "
                    + "ou avec les actions « ToursParRelaisPlus » et « ToursParRelaisMoins » du plugin, dans Contrôles et événements." });
            inside.Children.Add(Setting("Tours par relais", 1, 60, 1, plugin.Settings.StintLaps, value => $"{value:0} tours", value => plugin.SetStintLaps((int)Math.Round(value))));
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }

        // One slider line: its name, the slider, its value.
        static FrameworkElement Setting(string name, double min, double max, double step, double value, Func<double, string> format, Action<double> save)
        {
            var line = new DockPanel { Margin = new Thickness(0, 4, 0, 4) };
            var label = new TextBlock { Text = name, Width = 120, VerticalAlignment = VerticalAlignment.Center };
            var shown = new TextBlock { Width = 70, TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            var slider = new Slider { Minimum = min, Maximum = max, SmallChange = step, LargeChange = step * 5, TickFrequency = step, IsSnapToTickEnabled = true,
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
            inside.Children.Add(new TextBlock { Text = heading.ToUpperInvariant(), FontSize = 11, Opacity = 0.5, Margin = new Thickness(0, 0, 0, 8) });
            inside.Children.Add(line);
            foreach (var element in below) inside.Children.Add(element);
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }
    }
}
