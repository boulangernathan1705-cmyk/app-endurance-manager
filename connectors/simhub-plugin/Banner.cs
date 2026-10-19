// La fenêtre du bandeau des essais (Practice.cs) : toujours au premier plan, sans bordure, et les clics la traversent
// pour aller au jeu. LMU doit être en fenêtré sans bordure pour qu'elle passe par-dessus. Sa taille, l'opacité de son fond
// et sa place se règlent sur l'écran du plugin (« Placer le bandeau » : on la fait glisser à la souris).
using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace EnduranceManager.SimHub
{
    public class Banner : Window
    {
        const int Width0 = 960, Height0 = 112;
        static readonly Brush Grey = Fill("#9aa3ab"), Light = Fill("#c8ced3"), Amber = Fill("#f2a64e"), Blue = Fill("#6fb6ff"), Edge = Fill("#2c3238");
        static readonly FontFamily Body = new FontFamily("Bahnschrift"), Digits = new FontFamily("Bahnschrift SemiCondensed");

        static Brush Fill(string color)
        {
            try { var brush = (Brush)new BrushConverter().ConvertFromString(color); brush.Freeze(); return brush; }
            catch { return Brushes.White; }
        }

        class Parts { public TextBlock Label, Value, Delta, Ref, NotCounted; public StackPanel Bottom; }

        readonly EnduranceManagerPlugin plugin;
        readonly Border frame;
        readonly ScaleTransform scale = new ScaleTransform(1, 1);
        readonly Parts[] parts = new Parts[3];
        BannerView shown;
        bool through = true, placed;
        DateTime raisedAt;

        public Banner(EnduranceManagerPlugin plugin)
        {
            this.plugin = plugin;
            WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent; Topmost = true;
            ShowInTaskbar = false; ShowActivated = false; ResizeMode = ResizeMode.NoResize; SizeToContent = SizeToContent.WidthAndHeight;
            Title = "Endurance Manager · bandeau des essais";
            var grid = new Grid();
            for (int i = 0; i < 3; i++)
            {
                grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var block = Block(out parts[i]);
                block.Margin = new Thickness(i == 0 ? 0 : 10, 0, i == 2 ? 0 : 10, 0);
                Grid.SetColumn(block, i);
                grid.Children.Add(block);
            }
            frame = new Border
            {
                Width = Width0, Height = Height0, Padding = new Thickness(16, 10, 16, 10), CornerRadius = new CornerRadius(10),
                BorderBrush = Edge, BorderThickness = new Thickness(1), Child = grid, LayoutTransform = scale, SnapsToDevicePixels = true
            };
            TextOptions.SetTextFormattingMode(frame, TextFormattingMode.Display);
            Content = frame;
            SourceInitialized += (sender, args) => ClickThrough(true);
            MouseLeftButtonDown += (sender, args) =>
            {
                if (through) return;
                try { DragMove(); } catch { }
                plugin.SaveBannerPlace(Left, Top);
            };
        }

        static FrameworkElement Block(out Parts p)
        {
            p = new Parts
            {
                Label = new TextBlock { FontFamily = Body, FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = Grey },
                Value = new TextBlock { FontFamily = Digits, FontSize = 34, FontWeight = FontWeights.Bold, LineHeight = 34, VerticalAlignment = VerticalAlignment.Bottom },
                Delta = new TextBlock { FontFamily = Digits, FontSize = 18, FontWeight = FontWeights.SemiBold, Margin = new Thickness(10, 0, 0, 2), VerticalAlignment = VerticalAlignment.Bottom },
                Ref = new TextBlock { FontFamily = Body, FontSize = 13, Foreground = Grey, Margin = new Thickness(10, 0, 0, 3), VerticalAlignment = VerticalAlignment.Bottom },
                NotCounted = new TextBlock { FontFamily = Body, FontSize = 11, Foreground = Grey, FontStyle = FontStyles.Italic, Text = "non compté", Margin = new Thickness(8, 0, 0, 4), VerticalAlignment = VerticalAlignment.Bottom },
                Bottom = new StackPanel { Orientation = Orientation.Horizontal, ClipToBounds = true }
            };
            var middle = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 5, 0, 5), ClipToBounds = true };
            middle.Children.Add(p.Value); middle.Children.Add(p.Delta); middle.Children.Add(p.Ref); middle.Children.Add(p.NotCounted);
            var block = new StackPanel { ClipToBounds = true };
            block.Children.Add(p.Label); block.Children.Add(middle); block.Children.Add(p.Bottom);
            return block;
        }

        static TextBlock Small(string text, Brush color, bool bold = false) =>
            new TextBlock { Text = text, FontFamily = Body, FontSize = 13, Foreground = color, FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, VerticalAlignment = VerticalAlignment.Center };

        void Render(BannerView view)
        {
            if (ReferenceEquals(view, shown)) return;
            shown = view;
            var me = Fill(view.Color);
            for (int i = 0; i < 3 && i < view.Blocks.Length; i++)
            {
                var b = view.Blocks[i];
                var p = parts[i];
                p.Label.Text = b.Label.ToUpperInvariant();
                p.Value.Text = b.Value; p.Value.Foreground = me;
                p.Delta.Text = b.Delta; p.Delta.Foreground = b.Up ? Amber : Blue;
                p.Ref.Text = b.Ref;
                // Said once, beside the lap time: the whole lap does not count.
                p.NotCounted.Visibility = b.NotCounted && i == 0 ? Visibility.Visible : Visibility.Collapsed;
                p.Bottom.Children.Clear();
                var team = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 10, 0) };
                team.Children.Add(Small("Équipe ", Brushes.White, true));
                team.Children.Add(Small(b.Team, Light));
                p.Bottom.Children.Add(team);
                foreach (var mate in b.Mates)
                {
                    var color = Fill(mate.Color);
                    var line = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 10, 0) };
                    line.Children.Add(new Ellipse { Width = 8, Height = 8, Fill = color, Margin = new Thickness(0, 0, 5, 0), VerticalAlignment = VerticalAlignment.Center });
                    line.Children.Add(Small(mate.Name + " ", color, true));
                    line.Children.Add(Small(mate.Value, Light));
                    p.Bottom.Children.Add(line);
                }
            }
        }

        // Four times a second on SimHub's screen thread: the latest view, the settings, shown or hidden.
        public void Tick()
        {
            var settings = plugin.Settings;
            bool placing = plugin.Placing;
            var view = settings.Banner ? plugin.Practice.View : null;
            if (placing) view = view ?? plugin.Practice.Last ?? BannerView.Empty(settings.StintLaps);
            if (view == null) { if (IsVisible) Hide(); return; }
            double size = Math.Max(0.4, Math.Min(2.5, settings.BannerScale));
            if (scale.ScaleX != size) { scale.ScaleX = size; scale.ScaleY = size; }
            double alpha = Math.Max(0.3, Math.Min(1, settings.BannerOpacity));
            if (!(frame.Background is SolidColorBrush fill) || Math.Abs(fill.Color.A - alpha * 255) > 1)
                frame.Background = new SolidColorBrush(Color.FromArgb((byte)Math.Round(alpha * 255), 12, 14, 17));
            Render(view);
            if (!placed)
            {
                placed = true;
                var area = SystemParameters.WorkArea;
                Left = settings.BannerLeft ?? area.Left + (area.Width - Width0 * size) / 2;
                Top = settings.BannerTop ?? area.Top + 40;
            }
            if (!IsVisible) Show();
            if (through == placing) ClickThrough(!placing);
            // A game in borderless window can come back above: the banner goes back on top every 2 s.
            if (DateTime.Now - raisedAt > TimeSpan.FromSeconds(2))
            {
                raisedAt = DateTime.Now;
                var handle = new WindowInteropHelper(this).Handle;
                if (handle != IntPtr.Zero) SetWindowPos(handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            }
        }

        // Clicks go through to the game, except while placing; never takes the focus, never in Alt+Tab.
        void ClickThrough(bool clickThrough)
        {
            through = clickThrough;
            var handle = new WindowInteropHelper(this).Handle;
            if (handle == IntPtr.Zero) return;
            int style = GetWindowLong(handle, -20) | 0x08000000 | 0x80 | 0x80000;
            SetWindowLong(handle, -20, clickThrough ? style | 0x20 : style & ~0x20);
        }

        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hwnd, int index, int value);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

        // Made on SimHub's screen thread once the plugin starts; closed with SimHub.
        public static void Start(EnduranceManagerPlugin plugin)
        {
            var dispatcher = Application.Current?.Dispatcher;
            dispatcher?.BeginInvoke(new Action(() =>
            {
                try
                {
                    var banner = new Banner(plugin);
                    var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
                    timer.Tick += (sender, args) => { try { banner.Tick(); } catch { } };
                    timer.Start();
                    plugin.StopBanner = () => dispatcher.BeginInvoke(new Action(() => { timer.Stop(); banner.Close(); }));
                }
                catch { }
            }));
        }
    }
}
