// Réglages du plugin dans SimHub : coller le code de liaison donné par la page « Mon entraînement ».
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace EnduranceManager.SimHub
{
    public class SettingsControl : UserControl
    {
        public SettingsControl(EnduranceManagerPlugin plugin)
        {
            var panel = new StackPanel { Margin = new Thickness(16), MaxWidth = 720, HorizontalAlignment = HorizontalAlignment.Left };
            panel.Children.Add(new TextBlock { Text = "Endurance Manager · Mon entraînement", FontSize = 18, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 8) });
            panel.Children.Add(new TextBlock
            {
                TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12),
                Text = "Sur le site, ouvre « Mon entraînement » puis « Relier SimHub » et copie ton code de liaison. Colle-le ici : tes séances LMU arriveront sur le site toutes seules, avec l'usure et les températures des pneus, la conso et tes arrêts aux stands."
            });
            var code = new TextBox { Text = plugin.Settings.Code, FontFamily = new System.Windows.Media.FontFamily("Consolas"), Padding = new Thickness(6), TextWrapping = TextWrapping.Wrap };
            panel.Children.Add(code);
            var message = new TextBlock { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
            var save = new Button { Content = "Enregistrer le code", Margin = new Thickness(0, 8, 0, 0), Padding = new Thickness(12, 4, 12, 4), HorizontalAlignment = HorizontalAlignment.Left };
            save.Click += (sender, args) =>
            {
                if (LinkCode.Parse(code.Text) == null) { message.Text = "Ce code n'est pas valide. Copie-le en entier depuis la page Mon entraînement."; return; }
                plugin.SaveCode(code.Text);
                message.Text = "Code enregistré. Tes prochaines séances seront envoyées.";
            };
            panel.Children.Add(save);
            panel.Children.Add(message);
            var status = new TextBlock { Margin = new Thickness(0, 16, 0, 0), TextWrapping = TextWrapping.Wrap, Opacity = 0.8 };
            panel.Children.Add(status);
            var timer = new DispatcherTimer { Interval = System.TimeSpan.FromSeconds(2) };
            timer.Tick += (sender, args) => status.Text = "État : " + plugin.Status;
            timer.Start();
            status.Text = "État : " + plugin.Status;
            Unloaded += (sender, args) => timer.Stop();
            Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        }
    }
}
