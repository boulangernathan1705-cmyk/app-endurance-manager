using System;
using System.IO;
using System.Windows.Controls;
using System.Windows.Media;
using GameReaderCommon;
using SimHub.Plugins;

namespace LmuEndurancePrep
{
    [PluginDescription("Recueil de données de practice pour préparer les endurances sur Le Mans Ultimate")]
    [PluginAuthor("Equipe LMU Endurance")]
    [PluginName("LMU Endurance Prep")]
    public class LmuEndurancePrepPlugin : IPlugin, IDataPlugin, IWPFSettingsV2
    {
        public PluginManager PluginManager { get; set; }

        public ImageSource PictureIcon => null;

        public string LeftMenuTitle => "Endurance Prep";

        public ReconRecorder Recorder { get; private set; }

        public void Init(PluginManager pluginManager)
        {
            var outputFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                "SimHub", "LmuEndurancePrep", "recon");
            Recorder = new ReconRecorder(outputFolder);

            this.AttachDelegate("Recon.LapsLogged", () => Recorder.LapsLogged);
            this.AttachDelegate("Recon.CurrentFile", () => Recorder.CurrentFile);
            this.AttachDelegate("Recon.LastError", () => Recorder.LastError);
        }

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            if (!data.GameRunning || data.NewData == null)
            {
                return;
            }

            Recorder.OnFrame(data.GameName, data.OldData, data.NewData);
        }

        public void End(PluginManager pluginManager)
        {
            Recorder?.Flush();
        }

        public Control GetWPFSettingsControl(PluginManager pluginManager)
        {
            return new SettingsControl(this);
        }
    }
}
