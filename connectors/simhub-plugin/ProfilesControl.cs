// Onglet « Réglages voiture en course » : la voiture en cours et ses profils (Sec, Inter, Pluie), chacun avec ses réglages
// mémorisés. Les boutons qui appuient dans LMU sont trouvés tout seuls (ceux de FMT companion) : rien à choisir ici.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace EnduranceManager.SimHub
{
    public class ProfilesControl : UserControl
    {
        // The site's colours (Theme.cs).
        static readonly Brush Card = Theme.Panel, Edge = Theme.Border, Accent = Theme.Accent, Cyan = Theme.Accent;

        readonly EnduranceManagerPlugin plugin;
        Profiles Profiles => plugin.Profiles;
        readonly TextBlock car = new TextBlock { FontSize = 15, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 12) };
        readonly StackPanel list = new StackPanel();
        readonly TextBlock state = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12), Foreground = Cyan };
        readonly TextBlock buttons = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Theme.Muted, Margin = new Thickness(0, 4, 0, 0) };
        string shown;

        public ProfilesControl(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            var page = new StackPanel { Margin = new Thickness(20), Width = 600, HorizontalAlignment = HorizontalAlignment.Left };
            page.Children.Add(new TextBlock { Text = "Réglages voiture en course", FontSize = 22, FontWeight = FontWeights.Bold });
            page.Children.Add(new TextBlock { Foreground = Theme.Muted, Margin = new Thickness(0, 2, 0, 16), TextWrapping = TextWrapping.Wrap,
                Text = "Tes réglages perso de la black box, mis en une touche." });
            page.Children.Add(SettingsControl.Switch("Activer ce module", plugin.Settings.Profiles, on => plugin.SetModule(x => x.Profiles = on)));
            page.Children.Add(state);
            page.Children.Add(car);
            page.Children.Add(list);
            page.Children.Add(buttons);
            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            timer.Tick += (sender, args) => Refresh();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Refresh();
            Content = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        // Every second: the car driven (its profiles shown when it changes), the active profile, the buttons found.
        void Refresh()
        {
            // The car driven, else the last one seen.
            string next = Profiles.Car ?? shown ?? Profiles.File.Cars.Keys.LastOrDefault();
            if (next != null && Profiles.Car == next) Profiles.For(next);
            if (next != shown) { shown = next; Rebuild(); }
            car.Text = shown ?? "Charge une voiture dans LMU : ses profils Sec, Inter et Pluie apparaissent ici.";
            car.Foreground = shown == null ? Theme.Muted : Theme.Text;
            int count = shown == null ? 0 : Profiles.For(shown).Count;
            buttons.Text = "Sur ton volant : relie " + string.Join(", ", Enumerable.Range(1, Math.Max(1, count)).Select(i => "Profil" + i))
                + " à tes boutons dans SimHub › Contrôles et événements. Appui court : applique. Appui de 2 s : mémorise.";
            if (!plugin.Settings.Profiles) { state.Text = "Module coupé : les boutons ne font rien."; return; }
            var lines = new List<string>();
            if (Profiles.Car != null) lines.Add("Profil actif : " + (Profiles.Active ?? "aucun") + (Profiles.Wetness is double wet ? $" · piste humide à {wet:0} %" : ""));
            if (Profiles.ToChange) lines.Add("La piste correspond au profil « " + Profiles.ForWeather + " ».");
            if (!Profiles.AnyRole) lines.Add("Boutons de FMT companion introuvables : dans Black box sur boutons, clique « Préparer LMU ».");
            if (!string.IsNullOrEmpty(Profiles.Message)) lines.Add(Profiles.Message);
            state.Text = string.Join("\n", lines);
        }

        // The profiles of the car shown, one card each, in button order.
        void Rebuild()
        {
            list.Children.Clear();
            if (shown == null) return;
            var profiles = Profiles.For(shown);
            for (int i = 0; i < profiles.Count; i++) list.Children.Add(CardFor(profiles, i));
        }

        UIElement CardFor(List<Profile> profiles, int index)
        {
            var profile = profiles[index];
            var inside = new StackPanel();
            inside.Children.Add(new TextBlock { Text = "BOUTON « PROFIL" + (index + 1) + " »", FontSize = 11.5, FontWeight = FontWeights.Bold, Foreground = Theme.Muted, Margin = new Thickness(0, 0, 0, 6) });

            var name = new TextBox { Text = profile.Name, Width = 200, FontSize = 15, FontWeight = FontWeights.SemiBold };
            name.LostFocus += (sender, args) => { profile.Name = name.Text.Trim() == "" ? "Profil " + (index + 1) : name.Text.Trim(); Profiles.Save(); };
            var top = new WrapPanel { Margin = new Thickness(0, 0, 0, 8) };
            top.Children.Add(name);
            inside.Children.Add(top);

            // The in-car settings memorised.
            var drive = Setting.All.Where(x => profile.Drive.ContainsKey(x.Key))
                .Select(x => x.Label + " " + (x.Key == "Bias" ? profile.Drive[x.Key].ToString("0.0", CultureInfo.GetCultureInfo("fr-FR")) + " %" : profile.Drive[x.Key].ToString("0"))).ToList();
            inside.Children.Add(new TextBlock { TextWrapping = TextWrapping.Wrap, Opacity = drive.Count == 0 ? 0.5 : 1, Margin = new Thickness(0, 0, 0, 6),
                Text = drive.Count == 0 ? "Vide : roule, règle la voiture, puis maintiens le bouton 2 s (ou « Mémoriser »)." : string.Join(" · ", drive) });

            // The pit menu lines memorised, each one applied or not.
            if (profile.Pit.Count > 0)
            {
                var lines = new StackPanel { Margin = new Thickness(8, 4, 0, 0) };
                foreach (var line in profile.Pit)
                {
                    var box = new CheckBox { Content = Pretty(line.Key) + " : " + line.Value, IsChecked = profile.PitApplied.Contains(line.Key), Margin = new Thickness(0, 2, 0, 2) };
                    string key = line.Key;
                    box.Checked += (sender, args) => { if (!profile.PitApplied.Contains(key)) profile.PitApplied.Add(key); Profiles.Save(); };
                    box.Unchecked += (sender, args) => { profile.PitApplied.Remove(key); Profiles.Save(); };
                    lines.Children.Add(box);
                }
                inside.Children.Add(new Expander { Header = $"Menu des stands ({profile.PitApplied.Count} lignes appliquées sur {profile.Pit.Count})", Content = lines, Margin = new Thickness(0, 0, 0, 8) });
            }

            var buttons = new WrapPanel();
            var memorise = Button("Mémoriser mes réglages actuels", true);
            // Read aside (the game's pit menu answers over HTTP), the card redrawn after.
            memorise.Click += (sender, args) => System.Threading.ThreadPool.QueueUserWorkItem(_ => { Profiles.Memorise(index); Dispatcher.BeginInvoke(new Action(Rebuild)); });
            var apply = Button("Appliquer", false);
            apply.Click += (sender, args) => Profiles.Apply(index);
            buttons.Children.Add(memorise);
            buttons.Children.Add(apply);
            inside.Children.Add(buttons);
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }

        static string Pretty(string name) => name.Length == 0 ? name : name.Substring(0, 1) + name.Substring(1).ToLowerInvariant();

        static Button Button(string text, bool main)
        {
            var button = main ? Theme.Primary(text) : Theme.Secondary(text);
            button.Padding = new Thickness(14, 6, 14, 6);
            return button;
        }
    }
}
