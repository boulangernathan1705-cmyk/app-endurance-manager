// Endurance Manager · plugin SimHub des fiches combo.
//
// Pendant que le pilote roule dans Le Mans Ultimate, il lit ce que le jeu publie dans sa mémoire partagée (pneus,
// énergie, carburant, vitesse, pluie, secteurs, arrêts aux stands) et l'API locale du jeu (temps de service de la
// voiture, nom du réglage chargé),
// puis envoie chaque séance aux fiches combo de son équipe avec sa clé de pilote. Il se met à jour depuis le même site.
// Il ne fait que lire : il ne modifie rien dans le jeu ni dans SimHub.
using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Media;
using GameReaderCommon;
using SimHub.Plugins;

namespace EnduranceManager.SimHub
{
    public class Settings
    {
        public string Code { get; set; } = "";
        // Off: nothing is read from the game and nothing is sent; the sessions waiting stay on the disk.
        public bool Enabled { get; set; } = true;
        // Mur des stands: the car shared live with the team while driving (LiveShare.cs). On unless the pilot turns it off.
        public bool Share { get; set; } = true;
        // The practice banner (Practice.cs, Banner.cs): shown in practice, its size, its background's opacity, its place
        // on the screen (none: top centre) and the stint length in laps, which sets the energy per lap aimed at.
        public bool Banner { get; set; } = true;
        public double BannerScale { get; set; } = 1;
        public double BannerOpacity { get; set; } = 0.88;
        public double? BannerLeft { get; set; }
        public double? BannerTop { get; set; }
        public int StintLaps { get; set; } = 12;
    }

    [PluginDescription("Envoie tes séances Le Mans Ultimate aux fiches combo de ton équipe sur Endurance Manager.")]
    [PluginAuthor("Endurance Manager")]
    [PluginName("Endurance Manager · Fiches combo")]
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
        public string LeftMenuTitle => "Fiches combo";

        Uploader uploader;
        Updater updater;
        LiveShare live;
        readonly LmuApi api = new LmuApi();
        Thread reader, sender;
        volatile bool running;
        int laps;

        public Uploader Uploader => uploader;
        public Updater Updater => updater;
        public LmuApi Api => api;
        public LiveShare Live => live;
        public Practice Practice { get; } = new Practice();
        // « Placer le bandeau » on the plugin's screen: the banner shows and follows the mouse.
        public volatile bool Placing;
        public Action StopBanner;
        // What the game is doing, for the settings screen: closed, in the menus, or on track.
        public volatile string GameState = "closed";
        // The last session recorded, for the settings screen.
        public volatile string LastSession;
        public string Status => !Settings.Enabled ? "En pause" : uploader?.Status ?? "";

        public void Init(PluginManager pluginManager)
        {
            Settings = this.ReadCommonSettings("GeneralSettings", () => new Settings());
            string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnduranceManager", "Combos");
            Directory.CreateDirectory(home);
            uploader = new Uploader(home);
            updater = new Updater(home);
            live = new LiveShare(() => LinkCode.Parse(Settings.Code));
            this.AttachDelegate("Status", () => Status);
            this.AttachDelegate("LapsRecorded", () => laps);
            this.AttachDelegate("Enabled", () => Settings.Enabled);
            running = true;
            // Below the game and SimHub: when the PC is busy, these threads wait, never the game.
            reader = new Thread(ReadGame) { IsBackground = true, Name = "EnduranceManager.Read", Priority = ThreadPriority.BelowNormal };
            sender = new Thread(SendLoop) { IsBackground = true, Name = "EnduranceManager.Send", Priority = ThreadPriority.Lowest };
            reader.Start();
            sender.Start();
            Banner.Start(this);
        }

        public void End(PluginManager pluginManager)
        {
            running = false;
            live?.Stop();
            StopBanner?.Invoke();
            this.SaveCommonSettings("GeneralSettings", Settings);
            // SimHub closes: the session being driven is written to disk before the process goes.
            reader?.Join(3000);
        }

        // SimHub calls this sixty times a second; the plugin reads the game on its own thread, ten times a second.
        public void DataUpdate(PluginManager pluginManager, ref GameData data) { }

        public System.Windows.Controls.Control GetWPFSettingsControl(PluginManager pluginManager) => new SettingsControl(this);

        public void SaveCode(string code)
        {
            Settings.Code = code?.Trim() ?? "";
            this.SaveCommonSettings("GeneralSettings", Settings);
            uploader.Reset();
        }

        // The live sharing switch (mur des stands): off, nothing more leaves for the team's pit wall.
        public void SetShare(bool share)
        {
            Settings.Share = share;
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        // The banner's settings, from the plugin's screen.
        public void SaveBanner(Action<Settings> change)
        {
            change(Settings);
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        public void SaveBannerPlace(double left, double top) => SaveBanner(settings => { settings.BannerLeft = left; settings.BannerTop = top; });

        // The switch on the plugin's screen. Turned off while driving, the laps already done are kept.
        public void SetEnabled(bool enabled)
        {
            Settings.Enabled = enabled;
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        void ReadGame()
        {
            var recorder = new Recorder(() => DateTime.Now, session =>
            {
                laps += session.Laps.Count;
                LastSession = $"{DateTime.Now:dd/MM HH:mm} · {session.Track} · {session.Laps.Count} tours · {session.Stops.Count} arrêt{(session.Stops.Count > 1 ? "s" : "")}";
                // The game's service times and forecast for this car, read while the pilot drove.
                session.Service = api.Service;
                session.Game = api.Game;
                try { uploader.Save(session); } catch { }
            }, () => api.Setup, api.CurrentLight);
            var buffer = new byte[LmuMemory.Size];
            while (running)
            {
                if (!Settings.Enabled)
                {
                    GameState = "paused";
                    Practice.Hide();
                    recorder.Flush();
                    Thread.Sleep(1000);
                    continue;
                }
                MemoryMappedFile memory = null;
                try { memory = MemoryMappedFile.OpenExisting(LmuMemory.Name, MemoryMappedFileRights.Read); } catch { }
                if (memory == null)
                {
                    // The game is closed: the session is over, send it now.
                    GameState = "closed";
                    Practice.Hide();
                    recorder.Flush();
                    Thread.Sleep(5000);
                    continue;
                }
                try
                {
                    using (memory)
                    using (var view = memory.CreateViewAccessor(0, LmuMemory.Size, MemoryMappedFileAccess.Read))
                    {
                        double lastEt = -1;
                        for (int misses = 0, frozen = 0, tick = 0; running && Settings.Enabled && misses < 600; tick++)
                        {
                            Copy(view, buffer);
                            bool ok = LmuMemory.Read(buffer, out var sample);
                            // The game's clock stopped (paused, crashed or closed while on track): not driving. After a
                            // minute the memory is let go and the session written, so nothing is lost on a crash.
                            frozen = ok && sample.Realtime && sample.ET == lastEt ? frozen + 1 : 0;
                            lastEt = sample.ET;
                            bool driving = ok && sample.Realtime && frozen < 50;
                            recorder.Feed(sample, driving);
                            GameState = driving ? "track" : "menu";
                            // Once a second, the car and the field for the team's mur des stands.
                            if (driving && Settings.Share && tick % 10 == 0) live.Offer(buffer, sample, recorder, api);
                            // Once a second, the practice banner: practice and warm-up only (rF2 sessions 0 to 4, 9), out of the garage.
                            if (tick % 10 == 0)
                            {
                                if (driving && Settings.Banner && !sample.Garage && (sample.Session <= 4 || sample.Session == 9))
                                    try { Practice.Update(sample, recorder.Current, LinkCode.Parse(Settings.Code), Settings.StintLaps); } catch { Practice.Hide(); }
                                else Practice.Hide();
                            }
                            misses = driving ? 0 : misses + 1;
                            // The game's API when the car stands in the pits, at most every 30 s, or in the garage and
                            // menus, every 5 s for the setup being loaded; on track only the daylight, once a minute. Read
                            // aside, so a slow answer never holds up the samples.
                            if (driving && sample.InPits && sample.Speed < 1 && tick % 300 == 0 && !api.Busy)
                            {
                                string compound = sample.FrontCompound;
                                ThreadPool.QueueUserWorkItem(_ => api.Read(compound));
                            }
                            else if (driving && tick % 600 == 0 && !api.Busy) ThreadPool.QueueUserWorkItem(_ => api.ReadLight());
                            // The pit screens answer in the garage too: read there while the service times are still
                            // missing (a short stop or a drive straight back to the garage can fall between two reads).
                            else if (!driving && tick % 50 == 0 && !api.Busy)
                            {
                                string compound = ok ? sample.FrontCompound : null;
                                bool setupOnly = api.Service != null;
                                ThreadPool.QueueUserWorkItem(_ => api.Read(compound, setupOnly));
                            }
                            Thread.Sleep(100);
                        }
                    }
                }
                // An error here must never close SimHub: the reading starts again a few seconds later.
                catch { Practice.Hide(); Thread.Sleep(5000); }
                // A minute without driving: the session is over, and the memory is let go so the game can close cleanly.
                recorder.Flush();
            }
        }

        // One copy of the game's memory: a single block copy (ReadArray copies byte by byte on .NET Framework).
        static void Copy(MemoryMappedViewAccessor view, byte[] buffer)
        {
            var handle = view.SafeMemoryMappedViewHandle;
            bool added = false;
            try
            {
                handle.DangerousAddRef(ref added);
                Marshal.Copy(IntPtr.Add(handle.DangerousGetHandle(), (int)view.PointerOffset), buffer, 0, buffer.Length);
            }
            finally { if (added) handle.DangerousRelease(); }
        }

        // Sessions leave when the pilot is not on track (menus, garage screen, game closed): nothing goes out while he drives.
        void SendLoop()
        {
            Thread.Sleep(10000);
            while (running)
            {
                if (Settings.Enabled && GameState != "track") try { uploader.SendAll(LinkCode.Parse(Settings.Code)); } catch { }
                // A newer version on the site, looked for once an hour: offered on the plugin's screen.
                updater.Check(LinkCode.Parse(Settings.Code));
                for (int i = 0; running && i < 60; i++) Thread.Sleep(1000);
            }
        }
    }
}
