using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace LmuEndurancePrep
{
    /// <summary>
    /// Tab shown in SimHub's left menu. Step 0 only reports what the recon recorder is doing.
    /// </summary>
    public class SettingsControl : UserControl
    {
        private readonly LmuEndurancePrepPlugin plugin;
        private readonly TextBlock lapsText = new TextBlock { Margin = new Thickness(0, 4, 0, 4) };
        private readonly TextBlock fileText = new TextBlock { Margin = new Thickness(0, 4, 0, 4), TextWrapping = TextWrapping.Wrap };
        private readonly TextBlock errorText = new TextBlock { Margin = new Thickness(0, 4, 0, 4), TextWrapping = TextWrapping.Wrap };

        public SettingsControl(LmuEndurancePrepPlugin plugin)
        {
            this.plugin = plugin;

            var openFolder = new Button
            {
                Content = "Ouvrir le dossier des relevés",
                Margin = new Thickness(0, 12, 0, 0),
                Padding = new Thickness(12, 4, 12, 4),
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            openFolder.Click += (sender, args) => OpenOutputFolder();

            Content = new StackPanel
            {
                Margin = new Thickness(16),
                Children =
                {
                    new TextBlock { Text = "LMU Endurance Prep : reconnaissance des données", FontSize = 16, FontWeight = FontWeights.SemiBold },
                    new TextBlock
                    {
                        Text = "Roule quelques tours en practice : chaque début de session et chaque tour enregistrent tout ce que SimHub lit du jeu.",
                        Margin = new Thickness(0, 8, 0, 8),
                        TextWrapping = TextWrapping.Wrap,
                    },
                    lapsText,
                    fileText,
                    errorText,
                    openFolder,
                },
            };

            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            timer.Tick += (sender, args) => Refresh();
            Loaded += (sender, args) => { Refresh(); timer.Start(); };
            Unloaded += (sender, args) => timer.Stop();
        }

        private void Refresh()
        {
            var recorder = plugin.Recorder;
            if (recorder == null)
            {
                return;
            }

            lapsText.Text = $"Relevés écrits : {recorder.LapsLogged}";
            fileText.Text = string.IsNullOrEmpty(recorder.CurrentFile)
                ? "Fichier : aucun pour l'instant (lance une session LMU)"
                : $"Fichier : {recorder.CurrentFile}";
            errorText.Text = string.IsNullOrEmpty(recorder.LastError) ? "" : $"Dernière erreur : {recorder.LastError}";
        }

        private void OpenOutputFolder()
        {
            var folder = plugin.Recorder?.OutputFolder;
            if (string.IsNullOrEmpty(folder))
            {
                return;
            }

            Directory.CreateDirectory(folder);
            Process.Start("explorer.exe", folder);
        }
    }
}
