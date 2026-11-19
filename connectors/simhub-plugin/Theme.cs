// La charte du site Endurance Manager (styles/tokens.css) pour l'écran du plugin dans SimHub : mêmes couleurs, mêmes
// arrondis, bouton principal cyan au texte sombre comme sur le site. Theme.Apply pose des styles implicites sur une
// page (boutons, onglets, cases, champs), de sorte que l'écran garde son allure quel que soit le thème de SimHub.
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;

namespace EnduranceManager.SimHub
{
    public static class Theme
    {
        // --em-bg, --em-panel, --em-panel-2, --em-border, --em-text, --em-muted, --em-faint, --em-accent, --em-ok, --em-warn, --em-danger.
        public static readonly Brush Bg = Fill("#07090A"), Panel = Fill("#111315"), Panel2 = Fill("#171A1D"), Border = Fill("#292D31"),
            Text = Fill("#EEF3F2"), Muted = Fill("#9AA6AA"), Faint = Fill("#5F6A6E"), Accent = Fill("#52D3D8"), AccentText = Fill("#061012"),
            Ok = Fill("#3ECF8E"), Warn = Fill("#E7B653"), Danger = Fill("#E4483D"), Clear = Fill("#00000000");
        // --em-radius-sm / md / lg.
        public static readonly CornerRadius Small = new CornerRadius(9), Medium = new CornerRadius(12), Large = new CornerRadius(14);
        public static readonly FontFamily Font = new FontFamily("Arial");

        static Brush Fill(string color) { var brush = (Brush)new BrushConverter().ConvertFromString(color); brush.Freeze(); return brush; }

        // The page's look: background, text, and the implicit styles for what it holds.
        public static void Apply(Control root)
        {
            root.Background = Bg;
            root.Foreground = Text;
            root.FontFamily = Font;
            root.FontSize = 13.5;
            var r = root.Resources;
            r[typeof(Button)] = ButtonStyle(false);
            r[typeof(TabControl)] = TabsStyle();
            r[typeof(TabItem)] = TabStyle();
            r[typeof(CheckBox)] = CheckStyle();
            r[typeof(TextBox)] = BoxStyle();
            r[typeof(ScrollViewer)] = new Style(typeof(ScrollViewer)) { Setters = { new Setter(Control.BackgroundProperty, Clear) } };
        }

        // A card, as the site's panels.
        public static System.Windows.Controls.Border Card(UIElement inside, Thickness? margin = null) => new System.Windows.Controls.Border
        {
            Background = Panel, BorderBrush = Border, BorderThickness = new Thickness(1), CornerRadius = Medium, Padding = new Thickness(16),
            Margin = margin ?? new Thickness(0, 0, 0, 12), Child = inside
        };

        // A small upper-case heading over a card's content (the site's kickers).
        public static TextBlock Kicker(string text) => new TextBlock { Text = text.ToUpperInvariant(), FontSize = 11.5, FontWeight = FontWeights.Bold, Foreground = Muted, Margin = new Thickness(0, 0, 0, 8) };

        // The main action (cyan, dark text), a second one (outlined) or a link (text only).
        public static Button Primary(string text) => new Button { Content = text, Style = ButtonStyle(true) };
        public static Button Secondary(string text) => new Button { Content = text, Style = ButtonStyle(false) };
        public static Button Link(string text) => new Button { Content = text, Style = LinkStyle() };

        static ControlTemplate Template<T>(FrameworkElementFactory root) => new ControlTemplate(typeof(T)) { VisualTree = root };

        static FrameworkElementFactory Chrome(out FrameworkElementFactory content, bool header = false)
        {
            var border = new FrameworkElementFactory(typeof(System.Windows.Controls.Border), "chrome");
            border.SetValue(System.Windows.Controls.Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            border.SetValue(System.Windows.Controls.Border.BorderBrushProperty, new TemplateBindingExtension(Control.BorderBrushProperty));
            border.SetValue(System.Windows.Controls.Border.BorderThicknessProperty, new TemplateBindingExtension(Control.BorderThicknessProperty));
            border.SetValue(System.Windows.Controls.Border.PaddingProperty, new TemplateBindingExtension(Control.PaddingProperty));
            content = new FrameworkElementFactory(typeof(ContentPresenter));
            if (header) content.SetValue(ContentPresenter.ContentSourceProperty, "Header");
            content.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            content.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(content);
            return border;
        }

        static Style ButtonStyle(bool primary)
        {
            var border = Chrome(out _);
            border.SetValue(System.Windows.Controls.Border.CornerRadiusProperty, Small);
            var style = new Style(typeof(Button));
            style.Setters.Add(new Setter(Control.TemplateProperty, Template<Button>(border)));
            style.Setters.Add(new Setter(Control.BackgroundProperty, primary ? Accent : Panel2));
            style.Setters.Add(new Setter(Control.BorderBrushProperty, primary ? Accent : Border));
            style.Setters.Add(new Setter(Control.BorderThicknessProperty, new Thickness(1)));
            style.Setters.Add(new Setter(Control.ForegroundProperty, primary ? AccentText : Text));
            style.Setters.Add(new Setter(Control.FontWeightProperty, FontWeights.Bold));
            style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(16, 9, 16, 9)));
            style.Setters.Add(new Setter(FrameworkElement.MarginProperty, new Thickness(0, 0, 8, 0)));
            style.Setters.Add(new Setter(FrameworkElement.CursorProperty, Cursors.Hand));
            var hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(UIElement.OpacityProperty, 0.88));
            style.Triggers.Add(hover);
            var off = new Trigger { Property = UIElement.IsEnabledProperty, Value = false };
            off.Setters.Add(new Setter(UIElement.OpacityProperty, 0.45));
            style.Triggers.Add(off);
            return style;
        }

        static Style LinkStyle()
        {
            var style = new Style(typeof(Button), ButtonStyle(false));
            style.Setters.Add(new Setter(Control.BackgroundProperty, Clear));
            style.Setters.Add(new Setter(Control.BorderBrushProperty, Clear));
            style.Setters.Add(new Setter(Control.ForegroundProperty, Muted));
            style.Setters.Add(new Setter(Control.FontWeightProperty, FontWeights.Normal));
            style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(4, 9, 4, 9)));
            return style;
        }

        static Style TabsStyle()
        {
            var style = new Style(typeof(TabControl));
            style.Setters.Add(new Setter(Control.BackgroundProperty, Clear));
            style.Setters.Add(new Setter(Control.BorderThicknessProperty, new Thickness(0, 1, 0, 0)));
            style.Setters.Add(new Setter(Control.BorderBrushProperty, Border));
            style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(0)));
            // The tab's page inherits its text colour from here (WPF's own style would make it black).
            style.Setters.Add(new Setter(Control.ForegroundProperty, Text));
            return style;
        }

        // A tab: its name in grey, the open one in white over a cyan line, as the site's sub-menus. The look is set on the
        // name only: the tab's page keeps its own font and colours.
        static Style TabStyle()
        {
            var border = Chrome(out var name, true);
            name.Name = "name";
            name.SetValue(TextElement.ForegroundProperty, Muted);
            name.SetValue(TextElement.FontWeightProperty, FontWeights.Bold);
            var template = Template<TabItem>(border);
            var open = new Trigger { Property = TabItem.IsSelectedProperty, Value = true };
            open.Setters.Add(new Setter(TextElement.ForegroundProperty, Text, "name"));
            open.Setters.Add(new Setter(System.Windows.Controls.Border.BorderBrushProperty, Accent, "chrome"));
            template.Triggers.Add(open);
            var hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(TextElement.ForegroundProperty, Text, "name"));
            template.Triggers.Add(hover);
            var style = new Style(typeof(TabItem));
            style.Setters.Add(new Setter(Control.TemplateProperty, template));
            style.Setters.Add(new Setter(Control.BackgroundProperty, Clear));
            style.Setters.Add(new Setter(Control.BorderBrushProperty, Clear));
            style.Setters.Add(new Setter(Control.BorderThicknessProperty, new Thickness(0, 0, 0, 2)));
            style.Setters.Add(new Setter(Control.ForegroundProperty, Text));
            style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(14, 10, 14, 9)));
            style.Setters.Add(new Setter(FrameworkElement.CursorProperty, Cursors.Hand));
            return style;
        }

        // A check box: a rounded square, cyan with a dark tick when on.
        static Style CheckStyle()
        {
            var box = new FrameworkElementFactory(typeof(System.Windows.Controls.Border), "box");
            box.SetValue(FrameworkElement.WidthProperty, 18.0);
            box.SetValue(FrameworkElement.HeightProperty, 18.0);
            box.SetValue(System.Windows.Controls.Border.CornerRadiusProperty, new CornerRadius(5));
            box.SetValue(System.Windows.Controls.Border.BorderThicknessProperty, new Thickness(1.5));
            box.SetValue(System.Windows.Controls.Border.BorderBrushProperty, Faint);
            box.SetValue(System.Windows.Controls.Border.BackgroundProperty, Panel2);
            box.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Top);
            box.SetValue(FrameworkElement.MarginProperty, new Thickness(0, 0, 10, 0));
            var tick = new FrameworkElementFactory(typeof(System.Windows.Shapes.Path), "tick");
            tick.SetValue(System.Windows.Shapes.Path.DataProperty, Geometry.Parse("M3.5,9 L7.5,13 L14.5,5"));
            tick.SetValue(System.Windows.Shapes.Shape.StrokeProperty, AccentText);
            tick.SetValue(System.Windows.Shapes.Shape.StrokeThicknessProperty, 2.2);
            tick.SetValue(UIElement.VisibilityProperty, Visibility.Collapsed);
            box.AppendChild(tick);
            var content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            var line = new FrameworkElementFactory(typeof(DockPanel));
            line.SetValue(System.Windows.Controls.Panel.BackgroundProperty, Clear);
            line.AppendChild(box);
            line.AppendChild(content);
            var template = new ControlTemplate(typeof(CheckBox)) { VisualTree = line };
            var on = new Trigger { Property = ToggleButton.IsCheckedProperty, Value = true };
            on.Setters.Add(new Setter(System.Windows.Controls.Border.BackgroundProperty, Accent, "box"));
            on.Setters.Add(new Setter(System.Windows.Controls.Border.BorderBrushProperty, Accent, "box"));
            on.Setters.Add(new Setter(UIElement.VisibilityProperty, Visibility.Visible, "tick"));
            template.Triggers.Add(on);
            var hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(System.Windows.Controls.Border.BorderBrushProperty, Accent, "box"));
            template.Triggers.Add(hover);
            var style = new Style(typeof(CheckBox));
            style.Setters.Add(new Setter(Control.TemplateProperty, template));
            style.Setters.Add(new Setter(Control.ForegroundProperty, Text));
            style.Setters.Add(new Setter(FrameworkElement.CursorProperty, Cursors.Hand));
            return style;
        }

        static Style BoxStyle()
        {
            var style = new Style(typeof(TextBox));
            style.Setters.Add(new Setter(Control.BackgroundProperty, Panel2));
            style.Setters.Add(new Setter(Control.ForegroundProperty, Text));
            style.Setters.Add(new Setter(Control.BorderBrushProperty, Border));
            style.Setters.Add(new Setter(Control.PaddingProperty, new Thickness(8, 6, 8, 6)));
            style.Setters.Add(new Setter(TextBoxBase.CaretBrushProperty, Text));
            return style;
        }
    }
}
