// Les polices du mur (celles du site : Chakra Petch et JetBrains Mono, licence SIL OFL, dash/fonts) : installées pour
// l'utilisateur Windows au démarrage du plugin, sans droits administrateur, dans %LOCALAPPDATA%\Microsoft\Windows\Fonts,
// comme le fait Windows quand on choisit « Installer » sur une police. Dash Studio les voit au démarrage suivant de SimHub.
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace EnduranceManager.SimHub
{
    public static class Fonts
    {
        static readonly (string File, string Name)[] List =
        {
            ("ChakraPetch-400.ttf", "Chakra Petch Regular"), ("ChakraPetch-600.ttf", "Chakra Petch SemiBold"), ("ChakraPetch-700.ttf", "Chakra Petch Bold"),
            ("JetBrainsMono-Regular.ttf", "JetBrains Mono Regular"), ("JetBrainsMono-Bold.ttf", "JetBrains Mono Bold")
        };

        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern int AddFontResource(string file);

        // Never throws: without the fonts, Dash Studio draws the mur with Windows' own font.
        public static void Install()
        {
            try
            {
                string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Windows", "Fonts");
                Directory.CreateDirectory(folder);
                using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows NT\CurrentVersion\Fonts"))
                    foreach (var (file, name) in List)
                    {
                        string path = Path.Combine(folder, file);
                        if (!File.Exists(path))
                            using (var stream = typeof(Fonts).Assembly.GetManifestResourceStream("EnduranceManager.SimHub.fonts." + file))
                            using (var output = File.Create(path)) stream.CopyTo(output);
                        if (!(key.GetValue(name + " (TrueType)") is string known) || known != path)
                        {
                            key.SetValue(name + " (TrueType)", path);
                            AddFontResource(path);
                        }
                    }
            }
            catch { }
        }
    }
}
