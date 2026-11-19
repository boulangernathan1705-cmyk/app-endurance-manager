// Photos de l'écran du plugin, sans SimHub : chaque écran du guide et les onglets des modules, rendus par WPF en PNG
// (thème du site, Theme.cs). Faites par la CI Windows (.github/workflows/simhub-plugin.yml), rangées dans apercus/.
using System;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace EnduranceManager.SimHub.Preview
{
    public static class Program
    {
        const int Width = 1100, Height = 760;

        [STAThread]
        public static int Main(string[] args)
        {
            string dir = args.Length > 0 ? args[0] : "apercus";
            Directory.CreateDirectory(dir);
            int made = 0;
            void Shot(string name, Func<FrameworkElement> make, Action<FrameworkElement> then = null)
            {
                try
                {
                    var element = make();
                    var window = new Window { Content = element, Width = Width, Height = Height, WindowStyle = WindowStyle.None, ShowInTaskbar = false, ShowActivated = false, Left = -20000, Top = 0, Background = Theme.Bg };
                    window.Show();
                    Idle();
                    then?.Invoke(element);
                    Idle();
                    var shown = (FrameworkElement)window.Content;
                    var bitmap = new RenderTargetBitmap((int)(shown.ActualWidth * 1.5), (int)(shown.ActualHeight * 1.5), 144, 144, PixelFormats.Pbgra32);
                    bitmap.Render(shown);
                    var png = new PngBitmapEncoder();
                    png.Frames.Add(BitmapFrame.Create(bitmap));
                    using (var file = File.Create(Path.Combine(dir, name + ".png"))) png.Save(file);
                    window.Close();
                    made++;
                    Console.WriteLine("OK    " + name);
                }
                catch (Exception e) { Console.WriteLine("ÉCHEC " + name + " : " + e); }
            }

            // A pilot who has just installed it: overlay, team telemetry and sharing on (the defaults), the mur too.
            EnduranceManagerPlugin Plugin(bool guideDone) { var p = new EnduranceManagerPlugin(); p.Preview(new Settings { GuideDone = guideDone, Wall = true }); return p; }
            Guide GuideOf(FrameworkElement e) => (Guide)((Shell)e).Page;

            Shot("guide-1-modules", () => new Shell(Plugin(false)));
            Shot("guide-2-relier-au-site", () => new Shell(Plugin(false)), e => GuideOf(e).Jump(1, 0));
            Shot("guide-2-overlay-relais", () => new Shell(Plugin(false)), e => GuideOf(e).Jump(1, 1));
            Shot("guide-2-mur-des-stands", () => new Shell(Plugin(false)), e => GuideOf(e).Jump(1, 2));
            Shot("guide-3-pret", () => new Shell(Plugin(false)), e => GuideOf(e).Jump(2));
            Shot("onglet-general", () => new Shell(Plugin(true)));
            Shot("onglet-pour-moi-overlay-relais", () => new Shell(Plugin(true)), e => Open(e, 1, 0));
            Shot("onglet-pour-moi-reglages-voiture", () => new Shell(Plugin(true)), e => Open(e, 1, 1));
            Shot("onglet-pour-moi-mur-des-stands", () => new Shell(Plugin(true)), e => Open(e, 1, 3));
            Shot("onglet-equipe-relier-au-site", () => new Shell(Plugin(true)), e => Open(e, 2, 0));
            Shot("onglet-equipe-aide-au-developpement", () => new Shell(Plugin(true)), e => Open(e, 2, 3));
            Console.WriteLine(made + " photos dans " + Path.GetFullPath(dir));
            // The plugin's threads (sharing, updates) must not keep the program open.
            Environment.Exit(made == 11 ? 0 : 1);
            return 0;
        }

        // The main tab, then the module's tab inside it.
        static void Open(FrameworkElement shell, int tab, int module)
        {
            var tabs = Find<TabControl>(shell).First();
            tabs.SelectedIndex = tab;
            Idle();
            var inner = Find<TabControl>((DependencyObject)((TabItem)tabs.Items[tab]).Content).First();
            inner.SelectedIndex = module;
        }

        static System.Collections.Generic.IEnumerable<T> Find<T>(DependencyObject root) where T : DependencyObject
        {
            if (root is T found) yield return found;
            foreach (var child in LogicalTreeHelper.GetChildren(root).OfType<DependencyObject>())
                foreach (var item in Find<T>(child)) yield return item;
        }

        static void Idle()
        {
            for (int i = 0; i < 3; i++) Dispatcher.CurrentDispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
        }
    }
}
