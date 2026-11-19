// Endurance Manager · plugin SimHub des fiches combo.
//
// Pendant que le pilote roule dans Le Mans Ultimate, il lit ce que le jeu publie dans sa mémoire partagée (pneus,
// énergie, carburant, vitesse, pluie, secteurs, arrêts aux stands) et l'API locale du jeu (temps de service de la
// voiture, nom du réglage chargé),
// puis envoie chaque séance aux fiches combo de son équipe avec sa clé de pilote. Il se met à jour depuis le même site.
// Organisé en modules que chaque pilote active ou non, un onglet chacun sur l'écran du plugin. Seul le module Profils
// change quelque chose dans le jeu, quand le pilote appuie sur un de ses boutons.
using System;
using System.Collections.Generic;
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
        // Was the Site module's switch: kept so old settings still read, no longer used (the team modules use the site, Plugin.TeamOn).
        public bool Site { get; set; } = true;
        // Off: nothing is read from the game and nothing is sent; the sessions waiting stay on the disk.
        public bool Enabled { get; set; } = true;
        // Mur des stands: the car shared live with the team while driving (LiveShare.cs). On unless the pilot turns it off.
        public bool Share { get; set; } = true;
        // The overlays' stint length in laps (Practice.cs): it sets the energy per lap aimed at.
        public int StintLaps { get; set; } = 12;
        // The other modules: the overlay relais (Practice.cs) and the setting profiles (Profiles.cs, off until the pilot turns it on: it presses buttons in the game).
        public bool Overlays { get; set; } = true;
        // Was the « Chiffres de course » switch: kept so old settings still read, no longer used (Plugin.CourseOn).
        public bool Course { get; set; } = true;
        public bool Profiles { get; set; } = false;
        // Mur des stands (Wall.cs): our car on the dash « Endurance Manager · Mur », from this PC alone. Off by default.
        public bool Wall { get; set; } = false;
        // FMT companion, whole, run by this plugin (Companion.cs). Not chosen yet: on when the installer put its DLL in
        // our folder (it was installed alone before). Takes effect at SimHub's next start.
        public bool? Companion { get; set; }
        // « Aide au développement » (Report.cs): a journal of what the plugin does, for the development. Off by default.
        public bool Report { get; set; } = false;
        // The guided path (Guide.cs) was gone through or skipped: the plugin's screen opens on its modules.
        public bool GuideDone { get; set; } = false;
        [Newtonsoft.Json.JsonIgnore] public bool CompanionOn => Companion ?? System.IO.File.Exists(EnduranceManager.SimHub.Companion.Kept);
    }

    [PluginDescription("Overlay relais, réglages voiture en course, black box sur boutons et mur des stands pour Le Mans Ultimate. Le partage avec l'équipe passe par le site, en option.")]
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
        public Wall Wall => wall;
        Wall wall;
        public Practice Practice { get; } = new Practice();
        // The race figures a dashboard reads (Course.cs), and the game's pit menu they come with.
        public Course Course { get; } = new Course();
        public PitMenu Menu { get; } = new PitMenu();
        public GameApi Game { get; } = new GameApi();
        // The pilot's setting profiles, car by car, and the wheel buttons that apply or memorise them (Profiles.cs).
        public Profiles Profiles { get; private set; }
        // FMT companion 0.5 as it is, its DLL run from here when its module is on (Companion.cs).
        public Companion Companion { get; } = new Companion();
        // Our own calculations after LMU Drive's ideas (Computed.cs): pit timing and out-laps per car, optimal and predicted lap.
        public Computed Computed { get; } = new Computed();
        // The game's live standings (penalties by kind, finish status) and Lovely's track and car files.
        Standings standings;
        Lovely lovely;
        string home;
        // What the game is doing, for the settings screen: closed, in the menus, or on track.
        public volatile string GameState = "closed";
        // The last session recorded, for the settings screen.
        public volatile string LastSession;
        // The last reading while driving (boxed: the dashboards read it on SimHub's thread), null otherwise.
        volatile object latest;
        public string Status => !Settings.Enabled ? "En pause" : uploader?.Status ?? "";
        // The game is read while one module at least needs it.
        bool Reading => Settings.Enabled || Settings.Share || Settings.Overlays || Settings.Wall || Settings.Profiles;
        // The race figures for the dashs (Course.cs): no switch of their own, they run for the overlay and the mur des stands.
        public bool CourseOn => Settings.Overlays || Settings.Wall;

        public void Init(PluginManager pluginManager)
        {
            Settings = this.ReadCommonSettings("GeneralSettings", () => new Settings());
            EnduranceManager.SimHub.Report.Version = Updater.Current.ToString(3);
            EnduranceManager.SimHub.Report.On = Settings.Report;
            EnduranceManager.SimHub.Report.State("modules", Newtonsoft.Json.JsonConvert.SerializeObject(Modules()));
            home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EnduranceManager", "Combos");
            Directory.CreateDirectory(home);
            uploader = new Uploader(home);
            updater = new Updater(home);
            live = new LiveShare(() => Link);
            wall = new Wall();
            foreach (var (name, get) in WallProperties.All) this.AttachDelegate(name, () => get(wall.View));
            lovely = new Lovely(home);
            standings = new Standings(() => Reading && GameState == "track", Path.Combine(home, "api", "ws-LiveStandings.json"));
            standings.Start();
            Profiles = new Profiles(Path.GetDirectoryName(home), () => latest is Sample s ? s : (Sample?)null, () => PluginManager ?? pluginManager, () => Settings.Profiles);
            // One action per profile place, to map to a wheel button in SimHub (Contrôles et événements): a short press
            // applies the profile, a press held 2 s memorises the car's state in it.
            for (int k = 0; k < Profiles.Slots; k++)
            {
                int slot = k;
                // The extension already checked against SimHub (reference/simhub-api.txt): same action, same name.
                this.AddAction("Profil" + (slot + 1), (manager, button) => Profiles.Press(slot), (manager, button) => Profiles.Release(slot));
                this.AttachDelegate("Profils." + (slot + 1) + ".Nom", () => Profiles.NameAt(slot));
            }
            this.AttachDelegate("Profils.Actif", () => Settings.Profiles ? Profiles.Active ?? "" : "");
            this.AttachDelegate("Profils.Applique", () => Settings.Profiles ? Profiles.Applied ?? "" : "");
            this.AttachDelegate("Profils.NonActif", () => Settings.Profiles && Profiles.NotActive);
            this.AttachDelegate("Profils.Meteo", () => Settings.Profiles ? Profiles.ForWeather ?? "" : "");
            this.AttachDelegate("Profils.AChanger", () => Settings.Profiles && Profiles.ToChange);
            this.AttachDelegate("Profils.Humidite", () => Profiles.Wetness);
            this.AttachDelegate("Profils.Message", () => Settings.Profiles ? Profiles.Message : "");
            this.AttachDelegate("Status", () => Status);
            this.AttachDelegate("LapsRecorded", () => laps);
            this.AttachDelegate("Enabled", () => Settings.Enabled);
            // The overlays' figures (Practice.cs), for the Dash Studio overlays (Dashes.cs) and any dashboard.
            this.AttachDelegate("Essais.EnPiste", () => Practice.OnTrack);
            this.AttachDelegate("Essais.EnEssais", () => Practice.InPractice);
            this.AttachDelegate("Essais.EnCourse", () => Practice.InRace);
            this.AttachDelegate("Essais.NonCompte", () => Practice.View.NotCounted);
            this.AttachDelegate("Essais.Couleur", () => Practice.View.Color);
            // The stint length changes while driving (a new strategy): two actions to map to wheel buttons in SimHub
            // (Contrôles et événements), shown in the overlays as « vs 8,33 % (12 t.) ».
            this.AttachDelegate("Essais.ToursParRelais", () => Settings.StintLaps);
            this.AddAction("ToursParRelaisPlus", (manager, button) => SetStintLaps(Settings.StintLaps + 1));
            this.AddAction("ToursParRelaisMoins", (manager, button) => SetStintLaps(Settings.StintLaps - 1));
            // The dashes' own buttons A and B, that pilots already have on their wheel, do the same while the overlays show
            // (practice or race, car on track): A one lap more, B one lap less.
            pluginManager.InputToActionTriggered += DashButton;
            foreach (var (name, block) in new (string, Func<PracticeView, PracticeView.Block>)[] { ("Tour", view => view.Lap), ("Energie", view => view.Energy), ("Usure", view => view.Wear) })
            {
                string at = "Essais." + name + ".";
                this.AttachDelegate(at + "Titre", () => block(Practice.View).Title);
                this.AttachDelegate(at + "Valeur", () => block(Practice.View).Value);
                this.AttachDelegate(at + "Ecart", () => block(Practice.View).Delta);
                this.AttachDelegate(at + "EcartCouleur", () => block(Practice.View).DeltaColor);
                this.AttachDelegate(at + "Vise", () => block(Practice.View).Target);
                this.AttachDelegate(at + "Moi", () => block(Practice.View).Me);
                this.AttachDelegate(at + "MoiCouleur", () => block(Practice.View).MeColor);
                this.AttachDelegate(at + "Equipe", () => block(Practice.View).Team);
                this.AttachDelegate(at + "Meilleur", () => block(Practice.View).Best);
                this.AttachDelegate(at + "MeilleurCouleur", () => Practice.Violet);
                this.AttachDelegate(at + "Nombre", () => block(Practice.View).Number);
                this.AttachDelegate(at + "ViseNombre", () => block(Practice.View).TargetNumber);
            }
            // The race figures under NeoRed's names (EnduranceManagerPlugin.Energy.VE.Current_%…), for any dashboard.
            foreach (var (name, get) in Course.Properties) this.AttachDelegate(name, () => get(Course.View));
            // What LMU Drive reads of the car and the session (Telemetry.cs, plugin 2.5), from the last reading.
            foreach (var (name, get) in Telemetry.Properties) this.AttachDelegate(name, () => latest is Sample s ? get(s) : null);
            this.AttachDelegate("Voiture.TourOptimal", () => Computed.Optimal);
            this.AttachDelegate("Voiture.TourPrevu", () => Computed.Predicted);
            this.AttachDelegate("Voiture.ChocsRelais", () => Computed.Impacts);
            this.AttachDelegate("Voiture.BlocagesDernierTour", () => Computed.LockupsLastLap);
            this.AttachDelegate("Voiture.PlacePrevue", () => Computed.PredictedPlace);
            this.AttachDelegate("Voiture.Sortie.TempsPerdu", () => Computed.RejoinLoss);
            this.AttachDelegate("Voiture.Sortie.Place", () => Computed.RejoinPlace);
            this.AttachDelegate("Voiture.Sortie.EcartDevant", () => Computed.RejoinAhead);
            this.AttachDelegate("Voiture.Sortie.VoitureDevant", () => Computed.RejoinAheadCar);
            this.AttachDelegate("Voiture.Sortie.EcartDerriere", () => Computed.RejoinBehind);
            this.AttachDelegate("Voiture.Sortie.VoitureDerriere", () => Computed.RejoinBehindCar);
            this.AttachDelegate("Voiture.MicroSecteurs.Optimal", () => Computed.MicroOptimal);
            for (int k = 0; k < Computed.Micro; k++) { int part = k; this.AttachDelegate("Voiture.MicroSecteurs.Ecart" + (part + 1), () => Computed.MicroDelta[part]); }
            running = true;
            // Below the game and SimHub: when the PC is busy, these threads wait, never the game.
            reader = new Thread(ReadGame) { IsBackground = true, Name = "EnduranceManager.Read", Priority = ThreadPriority.BelowNormal };
            sender = new Thread(SendLoop) { IsBackground = true, Name = "EnduranceManager.Send", Priority = ThreadPriority.Lowest };
            reader.Start();
            sender.Start();
            // The overlays « Endurance Manager · Bandeau » and « · Colonne » in Dash Studio's templates.
            ThreadPool.QueueUserWorkItem(_ => Dashes.Install(home));
            if (Settings.CompanionOn) Companion.Start(pluginManager);
            EnduranceManager.SimHub.Report.State("fmt companion", Companion.Status);
        }

        // The plugin's screen without SimHub (tests/Preview, the pictures of the screen made on GitHub): what Init makes,
        // without SimHub's settings, properties or game reading.
        public void Preview(Settings settings)
        {
            Settings = settings;
            home = Path.Combine(Path.GetTempPath(), "EnduranceManagerPreview");
            Directory.CreateDirectory(home);
            uploader = new Uploader(home);
            updater = new Updater(home);
            live = new LiveShare(() => Link);
            wall = new Wall();
            Profiles = new Profiles(home, () => null, () => PluginManager, () => Settings.Profiles);
        }

        public void End(PluginManager pluginManager)
        {
            running = false;
            live?.Stop();
            standings?.Stop();
            pluginManager.InputToActionTriggered -= DashButton;
            Companion.End(pluginManager);
            EnduranceManager.SimHub.Report.Close("SimHub fermé", Modules());
            this.SaveCommonSettings("GeneralSettings", Settings);
            Tape.Stop();
            // SimHub closes: the session being driven is written to disk before the process goes.
            reader?.Join(3000);
        }

        // SimHub calls this sixty times a second; the plugin reads the game on its own thread, ten times a second (our car
        // thirty times while a teammate watches the wall).
        public void DataUpdate(PluginManager pluginManager, ref GameData data) => Companion.DataUpdate(pluginManager, ref data);

        public System.Windows.Controls.Control GetWPFSettingsControl(PluginManager pluginManager) => new Shell(this);

        // A module « Avec mon équipe » is on: the site is used (no switch of its own any more).
        public bool TeamOn => Settings.Enabled || Settings.Share || Settings.Report;
        // The team's site, when a team module is on and a code is saved: everything that talks to the site goes through it.
        public LinkCode Link => TeamOn ? LinkCode.Parse(Settings.Code) : null;

        public void SaveCode(string code)
        {
            Settings.Code = code?.Trim() ?? "";
            this.SaveCommonSettings("GeneralSettings", Settings);
            uploader.Reset();
        }

        // A module's switch on its tab.
        public void SetModule(Action<Settings> change)
        {
            change(Settings);
            this.SaveCommonSettings("GeneralSettings", Settings);
            EnduranceManager.SimHub.Report.On = Settings.Report;
            EnduranceManager.SimHub.Report.State("modules", Newtonsoft.Json.JsonConvert.SerializeObject(Modules()));
        }

        // Which modules are on, for the test reports.
        public object Modules() => new
        {
            equipe = TeamOn, lie = Link != null, fiches = Settings.Enabled, partage = Settings.Share, mur = Settings.Wall, overlays = Settings.Overlays,
            course = CourseOn, profils = Settings.Profiles, fmt = Settings.CompanionOn, retours = Settings.Report,
        };

        // « Signaler un problème » on the Aide au développement tab.
        public void Signal(string note) => EnduranceManager.SimHub.Report.Signal(note, Modules());

        // The recorder's switch (Tape.cs): never saved, a new SimHub run starts without recording.
        public void SetRecording(bool on)
        {
            if (on) Tape.Start(GetType().Assembly.GetName().Version.ToString(3));
            else Tape.Stop();
        }

        // The mur des stands switch (solo, Wall.cs): off, the dash is emptied.
        public void SetWall(bool on)
        {
            Settings.Wall = on;
            if (!on) wall.Clear();
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        // The live sharing switch (mur des stands): off, nothing more leaves for the team's pit wall.
        public void SetShare(bool share)
        {
            Settings.Share = share;
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

        void DashButton(string input, string action)
        {
            if (!Practice.InPractice && !Practice.InRace) return;
            if (action == "GraphicalDashPlugin.ActionA") SetStintLaps(Settings.StintLaps + 1);
            else if (action == "GraphicalDashPlugin.ActionB") SetStintLaps(Settings.StintLaps - 1);
        }

        // The overlays' stint length, from the plugin's screen.
        public void SetStintLaps(int laps)
        {
            Settings.StintLaps = Math.Max(1, Math.Min(60, laps));
            this.SaveCommonSettings("GeneralSettings", Settings);
        }

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
                // Télémétrie Mémo off: the session is not kept (the other modules still read the game).
                if (Settings.Enabled) try { uploader.Save(session); } catch { }
            }, () => api.Setup, api.CurrentLight);
            var buffer = new byte[LmuMemory.Size];
            while (running)
            {
                if (!Reading)
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
                        for (int misses = 0, frozen = 0, tick = 0; running && Reading && misses < 600; tick++)
                        {
                            Copy(view, buffer);
                            // The session recorder for the tests (Tape.cs), while its switch is on.
                            Tape.Frame(buffer);
                            bool ok = LmuMemory.Read(buffer, out var sample);
                            // The game's clock stopped (paused, crashed or closed while on track): not driving. After a
                            // minute the memory is let go and the session written, so nothing is lost on a crash.
                            frozen = ok && sample.Realtime && sample.ET == lastEt ? frozen + 1 : 0;
                            lastEt = sample.ET;
                            bool driving = ok && sample.Realtime && frozen < 50;
                            recorder.Feed(sample, driving);
                            latest = driving ? (object)sample : null;
                            if (ok && Settings.Profiles) Profiles.Seen(sample);
                            // Each car's pit lane and our optimal and predicted lap (Computed.cs), ten times a second.
                            if (driving) try { Computed.Update(buffer, sample, recorder.Current); } catch (Exception e) { EnduranceManager.SimHub.Report.Error("Computed", e); }
                            GameState = driving ? "track" : "menu";
                            // Once a second, the car and the field for the team's mur des stands.
                            if (driving && Settings.Share) live.Frame(sample);
                            if (driving && Settings.Share && tick % 10 == 0) live.Offer(buffer, sample, recorder, api, Computed);
                            // Between two, nine quick messages a second: our car's frames and the cars on the map.
                            else if (driving && Settings.Share) live.Fast(buffer);
                            // Once a second, the race figures for the dashboards; the pit menu every 2 s, read aside.
                            // Once a second, the mur des stands on this PC (solo, Wall.cs): our own snapshot, nothing sent.
                            if (driving && Settings.Wall && tick % 10 == 0)
                                try { var snap = live.Local(buffer, sample, recorder, api, Computed); if (snap != null) wall.Local(snap, new object[] { Math.Round(sample.LapDist), Math.Round(sample.Speed, 1), Math.Round(sample.Throttle * 100), Math.Round(sample.BrakePedal * 100), Math.Round(sample.Steer * 100), sample.Gear }); }
                                catch (Exception e) { EnduranceManager.SimHub.Report.Error("Mur", e); }
                            else if (!driving && Settings.Wall && tick % 10 == 0) wall.Pause();
                            if (driving && CourseOn && tick % 10 == 0) try { Course.Update(buffer, sample, recorder.Current, api.Service, Menu, Game, api.Refuel, standings, lovely); } catch (Exception e) { EnduranceManager.SimHub.Report.Error("Course", e); }
                            if (driving && CourseOn && tick % 20 == 5 && !Menu.Busy) ThreadPool.QueueUserWorkItem(_ => Menu.Read());
                            // The game's state, its estimate of the stop and the car's condition, what is due each second.
                            if (driving && tick % 10 == 7 && !Game.Busy)
                            {
                                bool standing = sample.InPits && sample.Speed < 1;
                                ThreadPool.QueueUserWorkItem(_ => Game.Read(standing));
                            }
                            // Lovely's track and car files for the ones being driven, looked at every 30 s (downloaded once).
                            if (driving && tick % 300 == 150 && !lovely.Busy)
                            {
                                string trackId = Text("DataCorePlugin.GameData.TrackId"), carId = Text("DataCorePlugin.GameData.CarId"), track = sample.Track;
                                ThreadPool.QueueUserWorkItem(_ => lovely.Load(trackId, track, carId));
                            }
                            // The game's answers not used yet, kept once per SimHub run on track and stopped in the pits.
                            if (driving && tick % 600 == 300) ThreadPool.QueueUserWorkItem(_ => ApiSamples.Take(home, "piste"));
                            if (driving && sample.InPits && sample.Speed < 1 && tick % 50 == 25) ThreadPool.QueueUserWorkItem(_ => ApiSamples.Take(home, "stands"));
                            // Once a second, the overlays' figures, in every session; and the states for the test reports.
                            if (tick % 10 == 0)
                            {
                                if (EnduranceManager.SimHub.Report.On) Watch(driving, tick);
                                if (driving && Settings.Overlays) try { Practice.Update(sample, recorder.Current, Link, Settings.StintLaps); } catch (Exception e) { EnduranceManager.SimHub.Report.Error("Overlays", e); Practice.Hide(); }
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
                            // In between, while a page watches the car: two more readings of it for the wall's curves
                            // (thirty a second), nothing else.
                            for (int extra = 0; extra < 2; extra++)
                            {
                                Thread.Sleep(33);
                                if (!driving || !Settings.Share || !live.Watching) continue;
                                Copy(view, buffer);
                                if (LmuMemory.Read(buffer, out var between) && between.Realtime) live.Frame(between);
                            }
                            Thread.Sleep(34);
                        }
                    }
                }
                // An error here must never close SimHub: the reading starts again a few seconds later.
                catch (Exception e) { EnduranceManager.SimHub.Report.Error("Lecture du jeu", e); Practice.Hide(); Thread.Sleep(5000); }
                // A minute without driving: the session is over, and the memory is let go so the game can close cleanly.
                recorder.Flush();
                EnduranceManager.SimHub.Report.Close("fin de séance", Modules());
            }
        }

        // What the test reports note each second when it changes, and the dash's figures every 5 minutes on track.
        void Watch(bool driving, int tick)
        {
            EnduranceManager.SimHub.Report.State("jeu", GameState);
            EnduranceManager.SimHub.Report.State("profils", Settings.Profiles ? $"{Profiles.Car} · actif {Profiles.Active ?? "aucun"} · {Profiles.Message}" : "coupé");
            if (Settings.Share) EnduranceManager.SimHub.Report.State("partage", live.Status);
            if (Settings.Wall) EnduranceManager.SimHub.Report.State("mur", wall.Status);
            EnduranceManager.SimHub.Report.State("fmt companion", Companion.Status);
            if (driving && tick % 3000 == 0)
                try
                {
                    var values = new List<KeyValuePair<string, object>>();
                    if (CourseOn) foreach (var (name, get) in Course.Properties) values.Add(new KeyValuePair<string, object>(name, get(Course.View)));
                    if (Settings.Wall) foreach (var p in WallProperties.All) values.Add(new KeyValuePair<string, object>(p.Name, p.Get(wall.View)));
                    EnduranceManager.SimHub.Report.Figures(values);
                }
                catch (Exception e) { EnduranceManager.SimHub.Report.Error("Chiffres", e); }
        }

        // A SimHub property as text, null when it has none.
        string Text(string name)
        {
            try { string text = PluginManager?.GetPropertyValue(name)?.ToString(); return string.IsNullOrWhiteSpace(text) ? null : text; }
            catch { return null; }
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
                if (Settings.Enabled && GameState != "track") try { uploader.SendAll(Link); } catch { }
                if (GameState != "track") try { EnduranceManager.SimHub.Report.SendAll(Link); } catch { }
                // A newer version on the site, looked for once an hour: offered on the plugin's screen.
                updater.Check(Link);
                for (int i = 0; running && i < 60; i++) Thread.Sleep(1000);
            }
        }
    }
}
