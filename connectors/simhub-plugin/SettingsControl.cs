// Écran du plugin dans SimHub : où en est la liaison avec le site, ce que fait LMU, et un seul geste à faire,
// coller le code de liaison donné par la page « Mon entraînement ».
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
        readonly Button paste = Action("Coller mon code", true), open = Action("Ouvrir le site", false);

        public SettingsControl(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            var page = new StackPanel { Margin = new Thickness(20), Width = 600, HorizontalAlignment = HorizontalAlignment.Left };
            page.Children.Add(new TextBlock { Text = "Endurance Manager", FontSize = 22, FontWeight = FontWeights.SemiBold });
            page.Children.Add(new TextBlock { Text = "Tes séances Le Mans Ultimate arrivent toutes seules sur le site.", Opacity = 0.7, Margin = new Thickness(0, 2, 0, 16), TextWrapping = TextWrapping.Wrap });

            var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 14, 0, 0) };
            buttons.Children.Add(paste);
            buttons.Children.Add(open);
            page.Children.Add(Box("Liaison avec le site", linkDot, linkTitle, linkDetail, buttons, message));
            page.Children.Add(Box("Le Mans Ultimate", gameDot, gameTitle, gameDetail));
            page.Children.Add(new TextBlock { Text = "Le plugin ne fait que lire : il ne change rien dans le jeu ni dans SimHub.", Opacity = 0.5, FontSize = 11, Margin = new Thickness(2, 4, 0, 0), TextWrapping = TextWrapping.Wrap });

            paste.Click += (sender, args) => PasteCode();
            open.Click += (sender, args) =>
            {
                var code = LinkCode.Parse(plugin.Settings.Code);
                if (code != null) try { Process.Start(new ProcessStartInfo(code.Origin + "/stands.html") { UseShellExecute = true }); } catch { }
            };

            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
            timer.Tick += (sender, args) => Refresh();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Refresh();
            Content = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        // The code copied on the site, taken from the clipboard: nothing to type.
        void PasteCode()
        {
            string text = "";
            try { text = Clipboard.GetText(); } catch { }
            var code = LinkCode.Parse(text);
            if (code == null)
            {
                Say("Aucun code dans le presse-papiers. Copie-le sur le site (Entraînement → « Tu utilises SimHub ? » → Copier), puis reclique ici.", Orange);
                return;
            }
            plugin.SaveCode($"EMSYNC1 {code.Origin} {code.Token} EMSYNC1");
            Say("Code enregistré. Tes séances partiront dans la minute.", Green);
            Refresh();
        }

        void Say(string text, Brush color) { message.Text = text; message.Foreground = color; message.Visibility = Visibility.Visible; }

        void Refresh()
        {
            var code = LinkCode.Parse(plugin.Settings.Code);
            var uploader = plugin.Uploader;
            string host = code == null ? "" : new Uri(code.Origin).Host;
            paste.Content = code == null ? "Coller mon code" : "Changer de code";
            open.Visibility = code == null ? Visibility.Collapsed : Visibility.Visible;

            if (plugin.OtherSync) Show(linkDot, Grey, linkTitle, "Le synchroniseur Windows s'en charge", linkDetail, "Il tourne déjà sur ce PC : le plugin le laisse envoyer tes séances.");
            else if (code == null) Show(linkDot, Orange, linkTitle, "Pas encore relié", linkDetail, "Sur le site : Entraînement → « Tu utilises SimHub ? » → Copier. Puis clique sur « Coller mon code ».");
            else if (uploader?.Revoked == true) Show(linkDot, Red, linkTitle, "Liaison retirée", linkDetail, "Demande un nouveau code sur le site, puis « Changer de code ».");
            else if (uploader?.Reached == false) Show(linkDot, Orange, linkTitle, "Site injoignable", linkDetail, "Nouvel essai dans une minute, rien n'est perdu.");
            else if (uploader?.Reached == true) Show(linkDot, Green, linkTitle, "Relié à " + host, linkDetail,
                uploader.LastSent is DateTime last ? $"Dernier envoi à {last:HH:mm} · {uploader.SentToday} aujourd'hui" : "À jour, rien à envoyer pour l'instant.");
            else Show(linkDot, Grey, linkTitle, "Relié à " + host, linkDetail, "Premier envoi dans la minute.");

            var api = plugin.Api;
            string service = api.ReadAt is DateTime read ? $"Temps de service de la voiture lus à {read:HH:mm}." : "Les temps de service seront lus dès que tu rouleras.";
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
