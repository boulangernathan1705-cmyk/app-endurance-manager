// Endurance Manager · plugin SimHub.
//
// Fait la même chose que le synchroniseur Windows (connectors/lmu-sync), pour les pilotes qui ont déjà SimHub :
// il envoie à la page « Mon entraînement » les fichiers de résultats de Le Mans Ultimate et, pendant que le pilote
// roule, ce que le jeu publie dans sa mémoire partagée (pneus, carburant, vitesse, arrêts aux stands).
// Il ne fait que lire : il ne modifie rien dans le jeu ni dans SimHub. Si le synchroniseur tourne déjà sur le PC,
// le plugin le laisse faire pour ne pas envoyer deux fois.
using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Threading;
using System.Windows.Media;
using GameReaderCommon;
using SimHub.Plugins;

namespace EnduranceManager.SimHub
{
    public class Settings
    {
        public string Code { get; set; } = "";
    }

    [PluginDescription("Envoie tes séances Le Mans Ultimate à la page « Mon entraînement » d'Endurance Manager.")]
    [PluginAuthor("Endurance Manager")]
    [PluginName("Endurance Manager")]
    public class EnduranceManagerPlugin : IPlugin, IDataPlugin, IWPFSettingsV2
    {
        public Settings Settings;
        public PluginManager PluginManager { get; set; }
        public ImageSource PictureIcon => Icon;

        // The menu icon: a stopwatch, drawn rather than shipped as a file.
        static readonly ImageSource Icon = MakeIcon();
        static ImageSource MakeIcon()
        {
            var pen = new Pen(Brushes.White, 2.2) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            var group = new DrawingGroup();
            group.Children.Add(new GeometryDrawing(null, pen, new EllipseGeometry(new System.Windows.Point(12, 13.5), 8, 8)));
            group.Children.Add(new GeometryDrawing(null, pen, Geometry.Parse("M12,13.5 L15.5,10 M10,3 L14,3 M12,3 L12,5.5")));
            var image = new DrawingImage(group);
            image.Freeze();
            return image;
        }
        public string LeftMenuTitle => "Endurance Manager";

        Uploader uploader;
        readonly LmuApi api = new LmuApi();
        Thread reader, sender;
        volatile bool running;
        int laps;

        public Uploader Uploader => uploader;
        public LmuApi Api => api;
        // What the game is doing, for the settings screen: closed, in the menus, or on track.
        public volatile string GameState = "closed";
        public bool OtherSync => SyncRunning();
        public string Status => SyncRunning() ? "Le synchroniseur Windows tourne déjà sur ce PC : le plugin le laisse envoyer tes séances." : uploader?.Status ?? "";

        // The synchroniser holds this mutex while it runs (connectors/lmu-sync/platform_windows.go).
        static bool SyncRunning()
        {
            try
            {
                if (!Mutex.TryOpenExisting(@"Local\EnduranceManagerSync", out var mutex)) return false;
                mutex.Dispose();
                return true;
            }
            catch (UnauthorizedAccessException) { return true; }
        }

        public void Init(PluginManager pluginManager)
        {
            Settings = this.ReadCommonSettings("GeneralSettings", () => new Settings());
            string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnduranceManager", "SimHub");
            Directory.CreateDirectory(home);
            uploader = new Uploader(home);
            this.AttachDelegate("Status", () => Status);
            this.AttachDelegate("LapsRecorded", () => laps);
            running = true;
            reader = new Thread(ReadGame) { IsBackground = true, Name = "EnduranceManager.Read" };
            sender = new Thread(SendLoop) { IsBackground = true, Name = "EnduranceManager.Send" };
            reader.Start();
            sender.Start();
        }

        public void End(PluginManager pluginManager)
        {
            running = false;
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        // SimHub calls this sixty times a second; the plugin reads the game on its own thread, ten times a second.
        public void DataUpdate(PluginManager pluginManager, ref GameData data) { }

        public System.Windows.Controls.Control GetWPFSettingsControl(PluginManager pluginManager) => new SettingsControl(this);

        public void SaveCode(string code)
        {
            Settings.Code = code?.Trim() ?? "";
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        void ReadGame()
        {
            var recorder = new Recorder(() => DateTime.Now, session =>
            {
                laps += session.Laps.Count;
                // The game's service times and forecast for this car, read while the pilot drove.
                session.Service = api.Service;
                session.Game = api.Game;
                if (!SyncRunning()) try { uploader.SaveLive(session); } catch { }
            });
            var buffer = new byte[LmuMemory.Size];
            while (running)
            {
                MemoryMappedFile memory = null;
                try { memory = MemoryMappedFile.OpenExisting(LmuMemory.Name, MemoryMappedFileRights.Read); } catch { }
                if (memory == null)
                {
                    // The game is closed: the session is over, send it now.
                    GameState = "closed";
                    recorder.Flush();
                    Thread.Sleep(5000);
                    continue;
                }
                using (memory)
                using (var view = memory.CreateViewAccessor(0, LmuMemory.Size, MemoryMappedFileAccess.Read))
                {
                    for (int misses = 0, tick = 0; running && misses < 600; tick++)
                    {
                        view.ReadArray(0, buffer, 0, buffer.Length);
                        bool ok = LmuMemory.Read(buffer, out var sample);
                        recorder.Feed(sample, ok);
                        bool driving = ok && sample.Realtime;
                        GameState = driving ? "track" : "menu";
                        misses = driving ? 0 : misses + 1;
                        // The game's API, every 30 s on track: its tables do not change during a session.
                        // Read aside, so a slow answer never holds up the samples.
                        if (driving && tick % 300 == 0) { string compound = sample.FrontCompound; ThreadPool.QueueUserWorkItem(_ => api.Read(compound)); }
                        Thread.Sleep(100);
                    }
                }
                // A minute without driving: the session is over, and the memory is let go so the game can close cleanly.
                recorder.Flush();
            }
        }

        void SendLoop()
        {
            Thread.Sleep(10000);
            while (running)
            {
                if (!SyncRunning()) uploader.SendAll(LinkCode.Parse(Settings.Code));
                for (int i = 0; running && i < 60; i++) Thread.Sleep(1000);
            }
        }
    }
}
