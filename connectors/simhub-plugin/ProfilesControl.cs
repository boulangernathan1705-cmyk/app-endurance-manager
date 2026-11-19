// Onglet « Profils » de l'écran du plugin : les profils du pilote pour la voiture choisie (nom, plage d'humidité, réglages
// mémorisés, lignes du menu des stands appliquées), et les rôles du Control Mapper qui appuient sur chaque commande de LMU.
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
        static readonly Brush Card = Fill("#14FFFFFF"), Edge = Fill("#26FFFFFF"), Accent = Fill("#E8562A"), Cyan = Fill("#00E5FF");
        static Brush Fill(string color) { var brush = (Brush)new BrushConverter().ConvertFromString(color); brush.Freeze(); return brush; }

        readonly EnduranceManagerPlugin plugin;
        Profiles Profiles => plugin.Profiles;
        readonly ComboBox car = new ComboBox { Width = 320, Margin = new Thickness(0, 0, 0, 12), HorizontalAlignment = HorizontalAlignment.Left };
        readonly StackPanel list = new StackPanel(), roles = new StackPanel();
        readonly TextBlock state = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12), Foreground = Cyan };
        string shown;

        public ProfilesControl(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            var page = new StackPanel { Margin = new Thickness(20), Width = 600, HorizontalAlignment = HorizontalAlignment.Left };
            page.Children.Add(new TextBlock { Text = "Réglages voiture en course", FontSize = 22, FontWeight = FontWeights.SemiBold });
            page.Children.Add(new TextBlock { Opacity = 0.7, Margin = new Thickness(0, 2, 0, 16), TextWrapping = TextWrapping.Wrap,
                Text = "Un bouton du volant par profil : appui court, la voiture passe dans ce profil ; appui de 2 s, il mémorise ses réglages actuels. "
                    + "Relie « Profil1 », « Profil2 »… à tes boutons dans SimHub › Contrôles et événements (plugin EnduranceManagerPlugin)." });
            page.Children.Add(SettingsControl.Switch("Activer ce module", plugin.Settings.Profiles, on => plugin.SetModule(x => x.Profiles = on)));
            page.Children.Add(state);
            page.Children.Add(Heading("Voiture"));
            page.Children.Add(car);
            page.Children.Add(list);
            page.Children.Add(Heading("Commandes LMU"));
            page.Children.Add(new TextBlock { Opacity = 0.7, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10),
                Text = "Pour chaque réglage, les rôles du Control Mapper qui appuient sur « + » et « − » dans LMU, par ta sortie vJoy ou bridge USB "
                    + "(les mêmes que pour tes boutons du volant). Le menu des stands, lui, est réglé directement, sans rôle." });
            page.Children.Add(roles);
            car.SelectionChanged += (sender, args) => { if (car.SelectedItem is string chosen && chosen != shown) { shown = chosen; Rebuild(); } };
            list.Children.Add(new TextBlock { Text = "Active le module puis charge une voiture dans LMU (garage ou piste) : ses profils Sec, Inter et Pluie apparaissent ici.", Opacity = 0.6 });
            BuildRoles();
            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            timer.Tick += (sender, args) => Refresh();
            timer.Start();
            Unloaded += (sender, args) => timer.Stop();
            Refresh();
            Content = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }

        // Every second: the car driven (its profiles shown when it changes), the active profile and the last message.
        void Refresh()
        {
            var cars = Profiles.File.Cars.Keys.ToList();
            if (Profiles.Car is string driven && !cars.Contains(driven)) { Profiles.For(driven); cars.Add(driven); }
            if (car.Items.Count != cars.Count) { car.ItemsSource = null; car.ItemsSource = cars; car.SelectedItem = shown; }
            // A new car driven: its profiles come up. Otherwise the car picked stays.
            string next = Profiles.Car != null && Profiles.Car != lastCar ? Profiles.Car : shown ?? cars.FirstOrDefault();
            lastCar = Profiles.Car ?? lastCar;
            if (next != shown) { shown = next; car.SelectedItem = shown; Rebuild(); }
            if (!plugin.Settings.Profiles) { state.Text = "Module coupé : les boutons ne font rien."; return; }
            var lines = new List<string>();
            if (Profiles.Car == null) lines.Add("Charge une voiture dans LMU (garage ou piste) : ses profils Sec, Inter et Pluie apparaissent ici.");
            else lines.Add("Profil actif : " + (Profiles.Active ?? "aucun") + (Profiles.Wetness is double wet ? $" · piste humide à {wet:0} %" : ""));
            if (Profiles.ToChange) lines.Add("La piste correspond au profil « " + Profiles.ForWeather + " ».");
            if (!string.IsNullOrEmpty(Profiles.Message)) lines.Add(Profiles.Message);
            state.Text = string.Join("\n", lines);
        }
        string lastCar;

        // The profiles of the car shown, one card each, in button order.
        void Rebuild()
        {
            list.Children.Clear();
            if (shown == null) return;
            var profiles = Profiles.For(shown);
            for (int i = 0; i < profiles.Count; i++) list.Children.Add(CardFor(profiles, i));
            if (profiles.Count < Profiles.Slots)
            {
                var add = Button("Ajouter un profil", false);
                add.HorizontalAlignment = HorizontalAlignment.Left;
                add.Margin = new Thickness(0, 0, 0, 16);
                add.Click += (sender, args) => { profiles.Add(new Profile { Name = "Profil " + (profiles.Count + 1) }); Profiles.Save(); Rebuild(); };
                list.Children.Add(add);
            }
        }

        UIElement CardFor(List<Profile> profiles, int index)
        {
            var profile = profiles[index];
            var inside = new StackPanel();
            inside.Children.Add(new TextBlock { Text = "BOUTON « PROFIL" + (index + 1) + " »", FontSize = 11, Opacity = 0.5, Margin = new Thickness(0, 0, 0, 6) });

            var name = new TextBox { Text = profile.Name, Width = 200, FontSize = 15, FontWeight = FontWeights.SemiBold };
            name.LostFocus += (sender, args) => { profile.Name = name.Text.Trim() == "" ? "Profil " + (index + 1) : name.Text.Trim(); Profiles.Save(); };
            var wetFrom = Number(profile.WetMin, value => { profile.WetMin = value; Profiles.Save(); });
            var wetTo = Number(profile.WetMax, value => { profile.WetMax = value; Profiles.Save(); });
            var top = new WrapPanel { Margin = new Thickness(0, 0, 0, 8) };
            top.Children.Add(name);
            top.Children.Add(new TextBlock { Text = "   Piste humide de", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
            top.Children.Add(wetFrom);
            top.Children.Add(new TextBlock { Text = "à", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 6, 0) });
            top.Children.Add(wetTo);
            top.Children.Add(new TextBlock { Text = "%", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0) });
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
            var memorise = Button("Mémoriser", true);
            // Read aside (the game's pit menu answers over HTTP), the card redrawn after.
            memorise.Click += (sender, args) => System.Threading.ThreadPool.QueueUserWorkItem(_ => { Profiles.Memorise(index); Dispatcher.BeginInvoke(new Action(Rebuild)); });
            var apply = Button("Appliquer", false);
            apply.Click += (sender, args) => Profiles.Apply(index);
            buttons.Children.Add(memorise);
            buttons.Children.Add(apply);
            if (index > 0)
            {
                var up = Button("Monter", false);
                up.Click += (sender, args) => { profiles.RemoveAt(index); profiles.Insert(index - 1, profile); Profiles.Save(); Rebuild(); };
                buttons.Children.Add(up);
            }
            var remove = Button("Supprimer", false);
            remove.Click += (sender, args) => { profiles.RemoveAt(index); Profiles.Save(); Rebuild(); };
            buttons.Children.Add(remove);
            inside.Children.Add(buttons);
            return new Border { Background = Card, BorderBrush = Edge, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(16), Margin = new Thickness(0, 0, 0, 12), Child = inside };
        }

        // One line per setting: the role for « + » and the role for « − », picked among the Control Mapper's button roles.
        void BuildRoles()
        {
            roles.Children.Clear();
            List<string> available;
            try { available = Profiles.ButtonRoles(plugin.PluginManager) ?? new List<string>(); } catch { available = new List<string>(); }
            available = available.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderBy(x => x).ToList();
            if (available.Count == 0)
                roles.Children.Add(new TextBlock { TextWrapping = TextWrapping.Wrap, Opacity = 0.7, Margin = new Thickness(0, 0, 0, 8),
                    Text = "Aucun rôle de bouton dans le Control Mapper. Dans SimHub › Control Mapper, choisis ta sortie (vJoy ou bridge), donne un rôle à chaque bouton "
                        + "de sortie (« TC + », « TC - »…), relie ces boutons dans les contrôles de LMU, puis reviens ici." });
            var choices = new List<string> { "" };
            choices.AddRange(available);
            foreach (var setting in Setting.All)
            {
                var line = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
                var label = new TextBlock { Text = setting.Label, Width = 120, VerticalAlignment = VerticalAlignment.Center };
                DockPanel.SetDock(label, Dock.Left);
                line.Children.Add(label);
                var both = new StackPanel { Orientation = Orientation.Horizontal };
                foreach (string sign in new[] { "+", "-" })
                {
                    string command = setting.Key + sign;
                    Profiles.File.Roles.TryGetValue(command, out string role);
                    if (string.IsNullOrEmpty(role)) role = Guess(setting, sign, available);
                    if (!string.IsNullOrEmpty(role) && !Profiles.File.Roles.ContainsKey(command)) { Profiles.File.Roles[command] = role; Profiles.Save(); }
                    var pick = new ComboBox { Width = 200, Margin = new Thickness(0, 0, 8, 0), ItemsSource = choices, SelectedItem = role ?? "" };
                    if (!string.IsNullOrEmpty(role) && !choices.Contains(role)) { var own = new List<string>(choices) { role }; pick.ItemsSource = own; pick.SelectedItem = role; }
                    pick.SelectionChanged += (sender, args) => { Profiles.File.Roles[command] = pick.SelectedItem as string ?? ""; Profiles.Save(); };
                    both.Children.Add(new TextBlock { Text = sign == "+" ? "+" : "−", Width = 14, VerticalAlignment = VerticalAlignment.Center });
                    both.Children.Add(pick);
                }
                line.Children.Add(both);
                roles.Children.Add(line);
            }
            var again = Button("Relire les rôles du Control Mapper", false);
            again.HorizontalAlignment = HorizontalAlignment.Left;
            again.Margin = new Thickness(0, 8, 0, 0);
            again.Click += (sender, args) => BuildRoles();
            roles.Children.Add(again);
        }

        // The pilot's own role for it, found by its words and its sign (« TC + », « ABS - », « régen électrique + »).
        static string Guess(Setting setting, string sign, List<string> available)
        {
            foreach (string word in setting.Words)
                foreach (string role in available)
                {
                    string text = role.ToLowerInvariant().Trim();
                    if (!(text.EndsWith(sign) || text.EndsWith(sign == "-" ? "−" : "+"))) continue;
                    string stem = text.Substring(0, text.Length - 1).Trim();
                    // « TC + » is TC, not « TC cut + »: the shortest words must be the whole name.
                    if (stem == word || (word.Length > 3 && stem.Contains(word))) return role;
                }
            return null;
        }

        static string Pretty(string name) => name.Length == 0 ? name : name.Substring(0, 1) + name.Substring(1).ToLowerInvariant();

        static TextBox Number(double value, Action<double> save)
        {
            var box = new TextBox { Text = value.ToString("0", CultureInfo.InvariantCulture), Width = 44, TextAlignment = TextAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            box.LostFocus += (sender, args) =>
            {
                if (double.TryParse(box.Text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out double read)) save(Math.Max(0, Math.Min(100, read)));
                else box.Text = value.ToString("0", CultureInfo.InvariantCulture);
            };
            return box;
        }

        static TextBlock Heading(string text) => new TextBlock { Text = text.ToUpperInvariant(), FontSize = 11, Opacity = 0.5, Margin = new Thickness(0, 8, 0, 8) };

        static Button Button(string text, bool main)
        {
            var button = new Button { Content = text, Padding = new Thickness(14, 5, 14, 5), Margin = new Thickness(0, 0, 8, 0), Cursor = System.Windows.Input.Cursors.Hand };
            if (main) { button.Background = Accent; button.BorderBrush = Accent; button.Foreground = Brushes.White; }
            return button;
        }
    }
}
